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
4. Apply the migrations in `supabase/migrations/` in order (`0001_foundation.sql`, then `0002_homework_messages_payments.sql`) in the Supabase SQL Editor or through the Supabase CLI. Until 0002 is applied, the Homework, Messages and Finances pages show a notice instead of failing.
5. Configure the Auth email provider. Under Authentication → URL Configuration set the Site URL to your production domain and add redirect URLs for `http://localhost:3000/**` and `https://<your-domain>/**`. Email links land on `/auth/callback`, which signs the user in and continues to the dashboard (or to `/reset-password` for password recovery).
6. Restart the dev server.

Without Supabase environment variables, the dashboard displays clearly marked demo data. Authentication actions require Supabase configuration.

## Commands
```bash
npm run typecheck
npm run lint
npm test        # unit tests (Vitest)
npm run build
```

GitHub Actions runs the same four checks on every pull request and on pushes to `main` (`.github/workflows/ci.yml`).

## Security notes
- Do not put a Supabase secret/service-role key in a `NEXT_PUBLIC_` variable.
- The `user_roles` table is not client-writable. New accounts receive the `teacher` role through a database trigger. Admin access must be provisioned by a trusted operator in the database.
- RLS is enabled on every public table in the foundation migration.
- The current foundation is not a production-ready billing, classroom-video, or student-invitation implementation. Those are later sprints.

## Project structure
- `src/app`: routes and layouts
- `src/components`: reusable UI
- `src/lib/supabase`: browser/server clients and session proxy
- `supabase/migrations`: database schema and RLS
