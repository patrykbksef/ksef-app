-- KSeF API target: demo (TR) vs production (PRD)

alter table public.profiles
  add column if not exists ksef_environment text default 'demo';

update public.profiles
set ksef_environment = 'demo'
where ksef_environment is null
   or trim(ksef_environment) = '';

alter table public.profiles
  alter column ksef_environment set default 'demo',
  alter column ksef_environment set not null;

alter table public.profiles
  drop constraint if exists profiles_ksef_environment_check;

alter table public.profiles
  add constraint profiles_ksef_environment_check
  check (ksef_environment in ('demo', 'production'));
