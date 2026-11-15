# TeachFlow

TeachFlow is a SaaS workspace for independent online teachers. Initial market: Republic of Moldova. Initial UI language: Romanian.

## Requirements
- Node.js 20.9 or newer (Node.js 22 LTS recommended)
- npm
- A Supabase project for real authentication and persistence (optional for the local demo UI)

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000.

## Configure Supabase
1. Create a project in Supabase.
2. Copy `.env.example` to `.env.local`.
3. Add the Project URL and publishable key from the Supabase project Connect/API settings.
4. Apply the migrations in `supabase/migrations/` in order (`0001_foundation.sql`, `0002_homework_messages_payments.sql`, `0003_student_portal.sql`, `0004_email_reminders.sql`, `0005_manual_billing.sql`, then `0006_lesson_whiteboard.sql`) in the Supabase SQL Editor or through the Supabase CLI. Until 0002 is applied, the Homework, Messages and Finances pages show a notice instead of failing. Until 0003 is applied, student invitations show a notice and the rest of the app keeps working. Until 0006 is applied, the lesson room (video call, screen share, whiteboard) works locally but is neither saved nor shared.

   Lesson video calls are built in (WebRTC, peer-to-peer, signalling over Supabase Realtime). For students or teachers behind strict firewalls, add a TURN relay: set `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_KEY_API_TOKEN` (Cloudflare Realtime → TURN), or `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL` for another TURN server. Without them only public STUN is used. Details, limits and a manual test checklist: [docs/video-classroom.md](docs/video-classroom.md).
5. Configure the Auth email provider. Under Authentication → URL Configuration set the Site URL to your production domain and add redirect URLs for `http://localhost:3000/**` and `https://<your-domain>/**`. Email links land on `/auth/callback`, which signs the user in and continues to the dashboard (or to `/reset-password` for password recovery).
6. Restart the dev server.

Without Supabase environment variables, the dashboard displays clearly marked demo data. Authentication actions require Supabase configuration.

## Mobile app
The native Android/iOS app lives in [`mobile/`](mobile/README.md) (Expo / React Native). It uses the same Supabase project, so accounts and data are shared with the web app. See `mobile/README.md` for running it on a phone with Expo Go, building an APK, and publishing to the stores.

## Commands
```bash
npm run typecheck
npm run lint
npm test        # unit tests (Vitest)
npm run build
npm run i18n:check   # every UI string has ru + en translations
```

GitHub Actions runs the same checks on every pull request and on pushes to `main` (`.github/workflows/ci.yml`).

## Email reminders
Every morning (05:00 UTC, `vercel.json`) Vercel Cron calls `/api/cron/reminders`. Each teacher with reminders on gets one email listing tomorrow's lessons, homework to review and overdue payments. Nothing is sent on quiet days, and `reminder_log` prevents duplicates. Teachers turn it off in Settings. To enable:
1. Apply `supabase/migrations/0004_email_reminders.sql`.
2. Create a [Resend](https://resend.com) account, verify a sending domain and create an API key.
3. In Vercel → Project → Settings → Environment Variables (Production) add `SUPABASE_SECRET_KEY` (Supabase → Project Settings → API Keys → secret key), `RESEND_API_KEY`, `REMINDER_FROM` (e.g. `TeachFlow <noreply@yourdomain.md>`), `CRON_SECRET` (a long random string) and optionally `APP_URL`. These are server-only; never prefix them with `NEXT_PUBLIC_`.
4. Redeploy. Test with `curl -H "Authorization: Bearer $CRON_SECRET" "https://<app>/api/cron/reminders?dry=1"`, which builds the digests without sending.

Without these variables the endpoint answers 503 and sends nothing.

## Push notifications, quizzes, library and monthly parent reports
Apply `supabase/migrations/0013_library_quizzes_reports_push.sql`.
- **Library** (`/library`): reusable files and links per course; shared items appear in the student portal under "Materiale" and can be attached to homework.
- **Quizzes** (`/quizzes`): single choice, multiple choice and short answers. Students take them at `/student/quizzes`; `submit_quiz()` grades in the database, and students never read the correct answers before submitting.
- **AI tests** ("Teste AI", migration 0014): set `ANTHROPIC_API_KEY` (server-only; `AI_API_KEY` is also read) and optionally `AI_MODEL` (default `claude-opus-5-5`). Teachers describe a test, Claude generates the questions (9 types) with answer keys and explanations, the teacher edits/approves and publishes; closed questions are graded in the database, open ones get an AI-suggested mark the teacher approves. Without the key the builder shows a clear message and still works manually — nothing is simulated.
- **Push notifications** (Web Push): set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `SUPABASE_SECRET_KEY`. Users turn them on in Settings / "Profilul meu" (on iPhone after "Add to Home Screen"). Sent for new lessons and cancellations, homework (new, handed in, reviewed), quizzes and messages; `/api/cron/lesson-push` sends "today's lessons" every morning. `?mode=soon` sends "starts in N minutes"; call it every 5–10 minutes from an external scheduler (e.g. cron-job.org) with the `CRON_SECRET` header if you want those.
- **Monthly parent reports**: `/api/cron/parent-reports` runs on the 1st of each month (Resend, same env as the reminders) and e-mails parent accounts and the parent e-mail on the student card. Teachers switch it off in Settings and preview it from the student card.

## Points, PDF invoices and the public teacher page
Apply `supabase/migrations/0015_gamification_invoices_public_page.sql`.
- **Points and badges** (`/student/achievements`): students earn points for homework (+10, +5 on time, +5 for a 9–10), tests (+10, up to +10 for the score, +5 for 100%) and attended lessons (+5), level up, collect 13 badges and keep a streak of days with homework or tests. Teachers add bonus points from the student card and switch it off in Settings; parents see it on their home page. Computed in `src/lib/gamification.ts`.
- **PDF invoices** (`/invoices/<payment id>`): every payment gets a number (`PREFIX-YEAR-0001`); the teacher fills in the billing details in Settings → "Date pentru facturi". Teacher, student and parents can open the PDF; with Resend configured (same env as the reminders) parents get it by e-mail when a payment is recorded and when it is paid. Fonts: Liberation Sans (SIL OFL), in `src/lib/invoices/fonts`.
- **Public page** (`/p/<address>`, set up in "Pagina mea"): the teacher, their courses and a sign-up form without an account. Requests appear in "Pagina mea" (push + e-mail to the teacher) and become a student with one click. Visitors only reach `public_teacher_page()` and `public_signup()` (with simple flood limits).

## Subscriptions (manual billing)
Plans, prices and student limits live in `src/lib/plans.ts`. Teachers see their plan on `/billing` and send a plan request; an admin confirms the payment by hand on `/admin` and sets the plan, status and paid-until date. A paid plan applies only while it is active and inside its paid period; otherwise the Free limits apply, and adding or re-activating a student above the limit is refused. Admins are exempt.
1. Apply `supabase/migrations/0005_manual_billing.sql`.
2. Make your account admin (SQL Editor): `update public.user_roles set role = 'admin' where user_id = (select id from auth.users where email = 'you@example.com');`

## Languages
The UI is in Romanian, Russian and English. Romanian text in the code is the translation key: `t("Elevi")` on the server (`getT()` from `src/lib/i18n/server.ts`) or in client components (`useT()` from `src/lib/i18n/client.tsx`). Translations live in `src/lib/i18n/ru.ts` and `en.ts`; plurals use `t.n("{n} elev|{n} elevi|{n} de elevi", n)`. The language comes from the signed-in user's profile, then the `tf_lang` cookie (RO/RU/EN switch on the login and student pages), then the browser. `npm run i18n:check` fails when a string has no translation.

## Security notes
- Do not put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable.
- The `user_roles` table is not client-writable. New accounts receive the `teacher` role through a database trigger. Admin access must be provisioned by a trusted operator in the database.
- RLS is enabled on every public table in the foundation migration.
- Student accounts: a teacher creates a one-time invite link (valid 14 days, only its SHA-256 hash is stored). A student who accepts it gets the `student` role and read-only access to their own lessons, courses, homework, payments and messages through RLS. Students write only through the `submit_homework`, `send_student_message` and `mark_student_messages_read` functions. Student pages live under `/student`.
- Billing is manual (no payment processor yet). Lesson video calls are peer-to-peer: without a TURN key, some networks (mobile data, strict Wi-Fi) cannot connect.

## Project structure
- `src/app`: routes and layouts
- `src/components`: reusable UI
- `src/lib/supabase`: browser/server clients and session proxy
- `supabase/migrations`: database schema and RLS
