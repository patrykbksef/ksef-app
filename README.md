# KSeF Invoice (MVP)

Next.js app: Supabase auth, PDF invoice parsing (InterRisk-style layout), FA(3) XML via `ksef-lite`, and submission to **KSeF API 2.0 test** using a **KSeF token** + **NIP**.

## Environment

Create `.env.local` (or Vercel env vars):

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_anon_or_publishable_key
```

## Supabase

1. Enable **Email** auth and **Google** OAuth (add redirect URL: `http://localhost:3000/auth/callback` and your production URL).
2. Run the SQL in [`supabase/migrations/001_profiles_invoices.sql`](supabase/migrations/001_profiles_invoices.sql) in the SQL editor (tables, RLS, profile trigger on signup).

## Local dev

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Security & validation

- Server Actions use `getUser()` and re-validate inputs with **Zod** (`lib/validations/`).
- KSeF token is stored in `profiles.ksef_token` (RLS); treat production data as sensitive.

## KSeF test

Use credentials from the MF **test** environment. The app calls `https://api-test.ksef.mf.gov.pl/v2`. Your **context NIP** in Settings must match the taxpayer you authenticate as.

## PDF format

The regex parser targets invoices structured like [`invoice-example.pdf`](invoice-example.pdf) (seller block, buyer block, `NIP` lines, line items with net/VAT/gross columns). Other layouts may need parser changes or a future AI step.
