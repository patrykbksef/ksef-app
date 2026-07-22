-- Legal document acceptance (Regulamin, Polityka prywatności, DPA)
alter table public.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists privacy_accepted_at timestamptz,
  add column if not exists dpa_accepted_at timestamptz,
  add column if not exists legal_docs_version text;
