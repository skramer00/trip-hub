create table if not exists public.trip_state (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.trip_state enable row level security;
revoke all on table public.trip_state from anon, authenticated;
grant select, insert, update on table public.trip_state to service_role;

drop policy if exists "Public insert trip state" on public.trip_state;
drop policy if exists "Public read trip state" on public.trip_state;
drop policy if exists "Public update trip state" on public.trip_state;
drop policy if exists trip_state_insert on public.trip_state;
drop policy if exists trip_state_select on public.trip_state;
drop policy if exists trip_state_update on public.trip_state;
-- All reads and writes go through authenticated Next.js server routes using a secret key.
