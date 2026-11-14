# Lesson video classroom

The lesson room (`/classroom/<lesson id>` for the teacher, `/student/lesson/<lesson id>` for the
student) combines a whiteboard, the teacher's screen share and a video call. Everything is built on
WebRTC peer-to-peer; no media server or paid video API is used.

## Architecture

| Piece | Where | Notes |
| --- | --- | --- |
| Call UI + WebRTC | `src/components/board/VideoCall.tsx` | Small floating, movable panel so the whiteboard keeps the page. |
| Teacher screen share (large, above the board) | `src/components/board/ScreenShare.tsx` | One connection per student, teacher sends only. |
| Signalling bus | `src/lib/board/signal.ts` | One private Supabase Realtime channel per lesson: `screen:<lesson_id>`. Events `call` and `rtc`. |
| Message types + validation | `src/lib/board/rtc.ts` | `sanitizeCallSignal` checks every incoming message (types, ids, SDP size, chat length). |
| Helpers | `src/lib/board/call.ts` | Error mapping, rate limiter, duplicate filter, bitrate cap. |
| Optional TURN credentials | `src/app/api/turn/route.ts` | Signed-in users only. |
| Access control | `supabase/migrations/0006_lesson_whiteboard.sql` | RLS on `realtime.messages`: only the lesson's teacher and its student(s) can join the channel. |

Supabase only carries signalling (offer/answer, ICE candidates, who is in the call, mic/camera state,
chat). Audio and video travel directly between the browsers.

### Database

No new tables are needed. A "classroom" is the existing `lessons` row: its id is the room id, the
teacher is `lessons.teacher_id`, and the students are `lessons.student_id` or the students enrolled
in `lessons.course_id`. The private Realtime channel `screen:<lesson_id>` is authorised by
`private.can_use_board_topic()` from migration 0006, so nobody else can listen to or send signalling
for a lesson. SDP and ICE candidates are never stored. Chat messages are not stored either (only
the people in the call at that moment see them).

### Connection flow

1. Opening the lesson page subscribes to `screen:<lesson_id>` and asks `who` is already in the call.
2. "Intră în apel" (camera + microphone) or "Doar audio" (microphone only) gets the local media and
   broadcasts `hello`.
3. For each pair of participants, the one with the smaller key (`<user id>:<tab id>`) creates the
   RTCPeerConnection and sends the `offer`; the other answers. Offers never cross, and there is
   exactly one connection per pair (a newer one replaces and closes the old one).
4. ICE candidates are trickled; candidates that arrive before the offer/answer are buffered.
5. Messages from one participant are processed strictly in order; duplicate answers are ignored.
6. Every connection always negotiates one audio and one video line in both directions. That is what
   lets a participant who joined with audio only turn the camera on later, and share the screen,
   by swapping the outgoing track (`replaceTrack`) without renegotiating.

### Recovery and failures

- `disconnected` for more than 4 s, or `failed`: ICE restart (the answering side asks the offerer
  with a `restart` message). Up to 2 attempts.
- A connection that never gets through (for example no usable network path) is treated as failed
  after 20 s per attempt.
- After the attempts, the participant's tile shows "Nu se poate conecta" and the panel explains
  that the network may need a TURN server. The call is never shown as connected when it is not.
- Going offline shows a warning; when the network returns, every broken connection restarts ICE.
- Leaving, closing the tab or navigating away sends `bye`; the others drop that connection at once.
  A student is told when the teacher leaves.

### Abuse protection

- Only lesson members can use the channel (RLS).
- Every message is validated and size-limited (`sanitizeCallSignal`).
- Each participant is rate limited: 400 signalling messages / 10 s, 12 chat messages / 10 s.
- At most 8 people in one call (mesh: each person uploads one stream per other participant).

## Configuration

Required: the Supabase variables already used by the app, and migration 0006 applied.

Optional TURN relay (only needed for strict networks, see below):

| Variable | Meaning |
| --- | --- |
| `CLOUDFLARE_TURN_KEY_ID`, `CLOUDFLARE_TURN_KEY_API_TOKEN` | Cloudflare Realtime TURN key (dash.cloudflare.com → Realtime → TURN Server). First 1000 GB/month free, then $0.05/GB relayed. |
| `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` | Any other TURN server (comma-separated URLs). |

Without them the call uses public STUN only (`stun.l.google.com`).

## Limits without TURN

STUN only helps two browsers discover their public addresses; the media still has to flow directly.
That works on most home Wi-Fi networks, but it often fails when one side is:

- on mobile data (carrier-grade / symmetric NAT),
- on a school, office or hotel Wi-Fi that blocks UDP or peer-to-peer traffic,
- behind a VPN or a strict corporate firewall.

In those cases the tile shows "Nu se poate conecta" with the TURN hint. Adding a TURN key fixes it
without code changes. Also: mesh calls get heavy above 4–5 participants (each person uploads one
video per other participant); outgoing video is capped at 640×360 and ~700 kbps to help.

## Manual test checklist

Use two different accounts (teacher + a student invited to the lesson), ideally on two devices.

1. Teacher opens the lesson room, student opens the same lesson from the student portal.
2. Both press "Intră în apel": each sees and hears the other; the participants list shows "Conectat".
3. Teacher with no camera / "Doar audio": the student still sees nothing but an avatar for the
   teacher, and the teacher sees the student's camera. Teacher then presses the camera button: the
   student now sees the teacher.
4. Mute / camera off on one side: the other side shows the muted icon / the avatar.
5. "Arată ecranul în apel": the other side sees the screen in that tile; stop sharing from the panel
   or from the browser's own "Stop sharing" bar, and the camera comes back.
6. Chat: messages appear on the other side, with an unread badge when the chat is closed.
7. Refresh the student's page and join again: the teacher sees the student reconnect.
8. Teacher leaves: the student sees "Profesorul a ieșit din apel."
9. Block the camera permission in the browser: a clear message, and the call continues with audio.
10. Student on mobile data, teacher on home Wi-Fi: without TURN this may end in
    "Nu se poate conecta"; after adding a TURN key and redeploying it connects.
11. Turn Wi-Fi off and on during a call: the warning appears, then the call reconnects.
