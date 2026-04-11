-- Issuer (Podmiot1) display fields for FA(3) XML — nullable for existing rows; app requires on save/send.

alter table public.profiles
  add column if not exists issuer_name text;

alter table public.profiles
  add column if not exists issuer_address_line1 text;

alter table public.profiles
  add column if not exists issuer_address_line2 text;
