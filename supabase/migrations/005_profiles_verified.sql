-- Manual verification flag (set true in Supabase after phone verification)
alter table public.profiles
  add column if not exists verified boolean not null default false;

-- Existing accounts: treat as already verified
update public.profiles set verified = true;
