-- Split KSeF token per environment (demo TR vs production PRD)

alter table public.profiles
  add column if not exists ksef_token_demo text;

alter table public.profiles
  add column if not exists ksef_token_production text;

update public.profiles
set
  ksef_token_demo = ksef_token,
  ksef_token_production = ksef_token
where ksef_token is not null;

alter table public.profiles
  drop column if exists ksef_token;
