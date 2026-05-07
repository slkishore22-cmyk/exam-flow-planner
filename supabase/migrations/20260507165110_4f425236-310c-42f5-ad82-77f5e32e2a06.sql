create table public.exam_seating_lookup (
  id uuid default gen_random_uuid() primary key,
  roll_number text not null,
  room_number integer not null,
  seat_number integer not null,
  exam_code text,
  dept text,
  session_id text not null,
  published_at timestamptz not null default now(),
  unique(roll_number, session_id)
);

create table public.exam_sessions (
  session_id text primary key,
  total_students integer,
  total_rooms integer,
  published_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index idx_roll_session on public.exam_seating_lookup(roll_number, session_id);

alter table public.exam_seating_lookup enable row level security;
create policy "Public read seating lookup" on public.exam_seating_lookup
  for select using (true);
create policy "Public insert seating lookup" on public.exam_seating_lookup
  for insert with check (true);
create policy "Public update seating lookup" on public.exam_seating_lookup
  for update using (true) with check (true);

alter table public.exam_sessions enable row level security;
create policy "Public read sessions" on public.exam_sessions
  for select using (true);
create policy "Public insert sessions" on public.exam_sessions
  for insert with check (true);
create policy "Public update sessions" on public.exam_sessions
  for update using (true) with check (true);