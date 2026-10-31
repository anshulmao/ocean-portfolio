-- Private visitor submissions. Only the intake function's server credential can access these.
create table public.portfolio_feedback (
  id uuid primary key,
  created_at timestamptz not null default now(),
  rating smallint not null check (rating between 1 and 5),
  feedback text not null default '' check (length(feedback) <= 2000),
  depth_meters numeric check (depth_meters between 0 and 40),
  contact_name text check (length(contact_name) <= 100),
  contact_email text check (length(contact_email) <= 254),
  contact_consent boolean not null default false,
  status text not null default 'new' check (status in ('new','reviewed','archived')),
  check (contact_consent or (contact_name is null and contact_email is null))
);
create index portfolio_feedback_created_at on public.portfolio_feedback (created_at desc);
create table public.portfolio_photos (
  id uuid primary key,
  created_at timestamptz not null default now(),
  storage_path text not null unique,
  bytes integer not null check (bytes between 4 and 1048576),
  note text check (length(note) <= 400),
  status text not null default 'private' check (status in ('private','approved','archived'))
);
create table public.portfolio_intake_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  used integer not null default 1,
  primary key (bucket_key, window_start)
);
create index portfolio_intake_limits_window on public.portfolio_intake_limits (window_start);
alter table public.portfolio_feedback enable row level security;
alter table public.portfolio_photos enable row level security;
alter table public.portfolio_intake_limits enable row level security;
revoke all on public.portfolio_feedback, public.portfolio_photos, public.portfolio_intake_limits from public, anon, authenticated;
grant select, insert, update, delete on public.portfolio_feedback, public.portfolio_photos, public.portfolio_intake_limits to service_role;

-- Atomic counters work across isolates. Callers cannot choose their own quota: RPC is server-only.
create function public.portfolio_take_quota(p_key text, p_limit integer, p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_start timestamptz; v_used integer;
begin
  if length(p_key) > 160 or p_limit < 1 or p_seconds < 1 then return false; end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_seconds) * p_seconds);
  delete from public.portfolio_intake_limits where window_start < now() - interval '2 days';
  insert into public.portfolio_intake_limits as limits (bucket_key, window_start, used)
    values (p_key, v_start, 1)
    on conflict (bucket_key, window_start) do update set used = limits.used + 1
    where limits.used < p_limit
    returning used into v_used;
  return v_used is not null;
end;
$$;
revoke all on function public.portfolio_take_quota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.portfolio_take_quota(text, integer, integer) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reef-photos', 'reef-photos', false, 1048576, array['image/jpeg']);
