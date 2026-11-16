# Lesson video calls

The lesson room (`/classroom/<lesson id>` for the teacher, `/student/lesson/<lesson id>` for the
student) combines TeachFlow's own video call, the teacher's screen share and the shared whiteboard.
No Zoom, Meet, Jitsi or other external meeting platform is used.

## Architecture

```
            ┌────────────── signalling (WebSocket, private, RLS) ──────────────┐
 Browser A ─┤ Supabase Realtime channel screen:<lesson_id>                      ├─ Browser B
            └────────────────────────────────────────────────────────────────────┘
 1:1 lesson (P2P):   A ◄──────── WebRTC audio/video (direct, or via TURN) ────────► B
 group lesson (SFU): A ──► LiveKit SFU ──► B, C, D …   (each person uploads once, simulcast)

 Next.js server: /api/turn (TURN credentials), /api/rtc/token (LiveKit token) — both check lesson membership
 Supabase: auth, lessons, lesson_call_attendance (presence/duration), RLS
```

Media never goes through Supabase or the Next.js server.

| Piece | Where |
| --- | --- |
| Engine choice (P2P or SFU) + attendance | `src/components/board/VideoCall.tsx` |
| Call UI: join bar, dark full call view, small movable panel | `src/components/call/CallView.tsx` |
| P2P engine (mesh, ≤ 8 people) | `src/components/call/useMeshCall.ts` |
| SFU engine (LiveKit, group lessons) | `src/components/call/useLiveKitCall.ts` |
| Attendance heartbeat | `src/components/call/useCallAttendance.ts` |
| Attendance card for the teacher | `src/components/call/CallAttendance.tsx`, `src/lib/call/attendance.ts` |
| Quality measurement + adaptive video | `src/lib/call/quality.ts` |
| TURN credentials, LiveKit tokens, transport choice | `src/lib/call/tokens.ts`, `src/app/api/turn`, `src/app/api/rtc/token` |
| Signalling bus + message validation | `src/lib/board/signal.ts`, `src/lib/board/rtc.ts`, `src/lib/board/call.ts` |
| Database | migrations `0006_lesson_whiteboard.sql` (channel RLS), `0018_lesson_calls.sql` |

### Which transport a lesson uses

Decided on the server from the lesson, so everybody in a lesson uses the same one
(`callTransport()` in `src/lib/call/tokens.ts`):

- LiveKit not configured → always P2P.
- `RTC_MODE=auto` (default): group lesson (a course lesson without a single student) → SFU; 1:1 → P2P.
- `RTC_MODE=p2p` / `RTC_MODE=sfu` force one or the other.

### Rooms, access and security

- The room is the lesson: room id = `lessons.id` (LiveKit room name `lesson_<id>`).
- Who may join: the lesson's teacher, and its student (1:1) or the students enrolled (active/paused)
  in its course (group). One SQL function decides it: `public.lesson_call_identity()` (0018), built on
  `private.can_use_lesson_board()` (0006). It also returns the name and role used in the call.
- Signalling: private Realtime channel; RLS on `realtime.messages` lets only lesson members read or
  send. Every message is validated and size-limited (`sanitizeCallSignal`) and rate-limited per
  participant (400 signalling / 10 s, 12 chat / 10 s).
- TURN: `/api/turn?lesson=<id>` hands out credentials only to lesson members, valid 4 hours
  (Cloudflare short-lived credentials, or coturn HMAC credentials bound to the user). No TURN secret
  ever reaches the browser.
- SFU: `/api/rtc/token` signs a LiveKit token (HS256 with `LIVEKIT_API_SECRET`, server-only) for
  exactly one room, 4 hours, no admin rights. Name and role come from the database, so a participant
  cannot pretend to be the teacher.
- Attendance rows can only be written through the RPCs `call_join` / `call_heartbeat` / `call_leave`
  (no insert/update policies); teachers read their lessons' rows, everybody reads their own.
- Screen sharing in the call (migration 0021): only the teacher shares by default. The teacher allows
  each student from "Participanți" → "Cine poate partaja ecranul" in the call (table
  `lesson_screen_access`, same rules as `lesson_board_access`). A change is announced on the lesson's
  signalling channel (event `access`) and clients read the list again; a student who loses access
  stops sharing. This is enforced in the app, not by the media path: a tampered client could still
  send a screen as its "camera" (as with any virtual camera). Before 0021 everybody can share.
- Whiteboard (migration 0019): all lesson members see the board; only the teacher draws by default.
  The teacher gives drawing access per student from "Acces elevi" above the board (table
  `lesson_board_access`, one row per lesson and student account; only the lesson's teacher can insert
  or delete). The database enforces it: saving the board and sending strokes on the `board:` channel
  need `private.can_draw_on_board()`. Realtime checks the right to send when a channel is joined, so a
  student's page rejoins the channel when access changes; a tampered client that keeps an old
  connection after access is turned off could still send live strokes until it reconnects, but
  cannot save them. Before 0019 is applied every student can draw, as before, and the teacher sees
  a notice.
- Camera and microphone are requested only when the person presses "Intră în apel" (or "Doar audio"
  for the microphone only); a refusal is explained and the call continues with what is allowed.

### P2P connection flow

1. Opening the lesson page subscribes to the channel and asks `who` is already in the call.
2. Joining gets the local media and broadcasts `hello`.
3. For each pair, the participant with the smaller key (`<user id>:<tab id>`) creates the
   RTCPeerConnection and sends the `offer`; the other answers. One connection per pair.
4. ICE candidates are trickled (buffered until the remote description exists). STUN finds a direct
   path; TURN is offered as a candidate and used by the browser only when no direct path works.
5. Each connection always negotiates one audio and one video line both ways, so the camera can be
   turned on later and the screen can be shared with `replaceTrack`, without renegotiating.

### Quality, adaptive video

Every 4 s each connection's `getStats()` is read: round-trip time, packet loss, bitrate, available
upload estimate and whether a TURN relay is used. Rating: good (RTT < 250 ms, loss < 2 %),
poor (RTT > 600 ms or loss > 8 %), otherwise fair. Shown as 3 bars in the header and on every tile.

The outgoing video of each connection follows its own network: steps `hd` 1.2 Mbps (960×540) →
`sd` 600 kbps → `low` 300 kbps → `min` 150 kbps (resolution scaled down, fewer frames). Poor quality
steps down at once; 3 good samples in a row step up; the upload estimate caps the step. With several
people in a P2P call the best step is capped (each person uploads one stream per other person).
A shared screen keeps full resolution (readable text) at 15 fps. In SFU calls LiveKit does this with
simulcast (180p/360p/540p layers) and dynacast.

### Recovery

- P2P: `disconnected` > 4 s or `failed` → ICE restart (max 2), 20 s watchdog per attempt, then the
  tile says "Nu se poate conecta" with the TURN hint. Network back online → every broken connection
  restarts. Leaving, closing the tab or navigating away sends `bye`.
- SFU: LiveKit reconnects by itself; the UI shows "Se reconectează…".
- Attendance: a missing heartbeat for 90 s ends the stay at its last heartbeat, so a closed laptop
  is not counted as presence; the next heartbeat starts a new stay.

### Attendance and duration

Teachers see "Prezența la apel" above the board: each person's time actually in the call (two tabs
counted once), first join / last seen, who is in the call now, and "Lecție cu elevii" = time with the
teacher and at least one student both in the call.

## Configuration

Required: the Supabase variables already used by the app, and migrations 0006, 0018 and 0019 applied.

All call variables are **server-only** (Vercel → Project → Settings → Environment Variables,
Production; never `NEXT_PUBLIC_`). Redeploy after changing them.

| Variable | Meaning |
| --- | --- |
| `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_KEY_API_TOKEN` | Cloudflare TURN (dash.cloudflare.com → Realtime → TURN Server → Create). 1000 GB/month free, then ~$0.05/GB relayed. Recommended. |
| `TURN_URLS`, `TURN_SECRET` | Own coturn with `use-auth-secret` / `static-auth-secret=<TURN_SECRET>`; URLs comma-separated, e.g. `turn:turn.example.md:3478?transport=udp,turns:turn.example.md:5349`. |
| `TURN_USERNAME`, `TURN_CREDENTIAL` | Fixed TURN account (development only, not time-limited). |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit Cloud (cloud.livekit.io → project → Settings → API keys; URL looks like `wss://<project>.livekit.cloud`) or a self-hosted LiveKit server. |
| `RTC_MODE` | `auto` (default), `p2p` or `sfu`. |

Without TURN only STUN is used: most home networks work, mobile data / school or office Wi-Fi / VPN
may fail with "Nu se poate conecta". Without LiveKit, group lessons use P2P (fine up to ~4–5 people).

## Tests

- Unit: `npm test` (`tests/call-*.test.ts`: tokens, TURN credentials, transport choice, stats
  parsing, quality, adaptive steps, attendance math).
- Database: migration 0018 was run against PostgreSQL 16 with a Supabase-like auth stub: teacher and
  student get their identity, a stranger gets nothing and cannot join, direct inserts are refused,
  a stay without heartbeats is closed at its last heartbeat.
- End-to-end with real media (`scripts/rtc-e2e`). Each participant is a separate Chromium process
  with a fake camera (moving pattern) and microphone (tone); the receiving side checks that video
  frames keep changing and the audio is not silent:

  ```bash
  npm i --no-save playwright && npx playwright install chromium   # once
  node scripts/rtc-e2e/relay.mjs &                                   # test signalling relay
  NEXT_PUBLIC_RTC_TEST_BUS=ws://localhost:8787 npm run build
  RTC_TEST_HARNESS=1 npx next start -p 3100 &
  node scripts/rtc-e2e/run.mjs p2p
  # SFU: start a LiveKit server (livekit-server --dev) and add
  #   LIVEKIT_URL=ws://127.0.0.1:7880 LIVEKIT_API_KEY=devkey LIVEKIT_API_SECRET=secret
  # to the next start command, then: node scripts/rtc-e2e/run.mjs sfu
  ```

  The harness page `/dev/call` and the relay exist only for this; the page is a 404 unless the server
  runs with `RTC_TEST_HARNESS=1`, and the relay is used only when the build was made with
  `NEXT_PUBLIC_RTC_TEST_BUS` (never set on Vercel). Do not deploy such a build.

### Manual checklist (two real devices, two accounts)

These cannot be automated from one machine and must be done on real networks:

1. Teacher on home Wi-Fi (laptop), student on **mobile data** (phone): both see and hear each other.
   Without TURN this may fail; with a TURN key the header shows "TURN" on the quality badge.
2. Both on different Wi-Fi networks (e.g. home + café).
3. A strict network (school/office Wi-Fi or VPN): connects only with TURN.
4. Camera and microphone: turn each off/on on both sides; refuse the camera permission once.
5. Turn Wi-Fi off for ~10 s during a call, then on: warning, then the call recovers by itself.
6. Student closes the tab and opens the lesson again; teacher leaves → student is told.
7. Screen share from a laptop; stop it from the browser's own "Stop sharing" bar.
8. Two lessons at the same time with different people: nobody sees the other lesson.
9. Group lesson with LiveKit configured: 3+ people, header shows "SFU".
10. After the lesson: the teacher's "Prezența la apel" shows plausible minutes.
