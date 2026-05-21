-- ============================================================
-- 야구기록 앱 — Supabase 스키마
-- Supabase SQL Editor에서 순서대로 실행하세요
-- ============================================================

-- ── 확장 ────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── 1. 팀 ────────────────────────────────────────────────────
create table public.teams (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  invite_code text unique not null default substring(md5(random()::text), 1, 8),
  created_at  timestamptz default now()
);

-- ── 2. 사용자 프로필 (auth.users 연동) ───────────────────────
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  team_id     uuid references public.teams on delete cascade,
  role        text not null check (role in ('admin','coach','recorder','parent')),
  player_no   int,                         -- 학부모 계정의 경우 자녀 선수 번호
  nickname    text,
  created_at  timestamptz default now()
);

-- auth.users 생성 시 빈 profile 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'parent');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 3. 선수 명단 ─────────────────────────────────────────────
create table public.players (
  id          uuid primary key default uuid_generate_v4(),
  team_id     uuid not null references public.teams on delete cascade,
  no          int not null,
  name        text not null,
  role        text not null check (role in ('b','p','bp')) default 'b', -- b:타자 p:투수 bp:양쪽
  pos         text,
  siblings    jsonb default '[]',  -- 형제 정보 [{no, name}]
  created_at  timestamptz default now(),
  unique (team_id, no)
);

-- ── 4. 경기 ──────────────────────────────────────────────────
create table public.games (
  id          text primary key,              -- 기존 앱의 타임스탬프 id 호환
  team_id     uuid not null references public.teams on delete cascade,
  date        date not null,
  opponent    text not null,
  home        boolean default true,
  status      text not null check (status in ('active','ended')) default 'active',
  my_score    int default 0,
  opp_score   int default 0,
  created_at  timestamptz default now()
);

-- ── 5. 타자 기록 ─────────────────────────────────────────────
create table public.bat_log (
  id          text primary key,              -- 기존 앱 id 호환
  team_id     uuid not null references public.teams on delete cascade,
  game_id     text not null references public.games on delete cascade,
  player_no   int not null,
  oc          text not null,                 -- 타석 결과 코드 (1B/2B/HR/K/BB 등)
  zone        text,                          -- 스프레이 차트 구역
  run         int default 0,
  rbi         int default 0,
  sb          int default 0,
  cs          int default 0,
  inn         int,
  created_at  timestamptz default now()
);

-- ── 6. 투수 대면 타자 기록 ──────────────────────────────────
create table public.pit_bf (
  id          text primary key,
  team_id     uuid not null references public.teams on delete cascade,
  game_id     text not null references public.games on delete cascade,
  player_no   int not null,
  oc          text not null,
  inn         int,
  created_at  timestamptz default now()
);

-- ── 7. 투수 실점 기록 ────────────────────────────────────────
create table public.pit_runs (
  id          text primary key,
  team_id     uuid not null references public.teams on delete cascade,
  game_id     text not null references public.games on delete cascade,
  player_no   int not null,
  runs        int not null default 0,
  er          int default 0,                 -- 자책점
  inn_from    real,
  inn_to      real,
  created_at  timestamptz default now()
);

-- ============================================================
-- RLS (Row Level Security) 정책
-- ============================================================

alter table public.teams    enable row level security;
alter table public.profiles enable row level security;
alter table public.players  enable row level security;
alter table public.games    enable row level security;
alter table public.bat_log  enable row level security;
alter table public.pit_bf   enable row level security;
alter table public.pit_runs enable row level security;

-- 현재 사용자의 team_id를 반환하는 헬퍼 함수
create or replace function public.my_team_id()
returns uuid language sql stable security definer as $$
  select team_id from public.profiles where id = auth.uid();
$$;

-- 현재 사용자의 role을 반환하는 헬퍼 함수
create or replace function public.my_role()
returns text language sql stable security definer as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ── teams ────────────────────────────────────────────────────
create policy "팀원만 조회" on public.teams
  for select using (id = public.my_team_id());

-- ── profiles ─────────────────────────────────────────────────
create policy "본인 프로필 조회" on public.profiles
  for select using (auth.uid() = id or team_id = public.my_team_id());

create policy "본인 프로필 수정" on public.profiles
  for update using (auth.uid() = id);

-- ── players ──────────────────────────────────────────────────
create policy "팀원 조회" on public.players
  for select using (team_id = public.my_team_id());

create policy "관리자/코치 편집" on public.players
  for all using (
    team_id = public.my_team_id()
    and public.my_role() in ('admin', 'coach')
  );

-- ── games ────────────────────────────────────────────────────
create policy "팀원 조회" on public.games
  for select using (team_id = public.my_team_id());

create policy "관리자/코치/기록자 편집" on public.games
  for all using (
    team_id = public.my_team_id()
    and public.my_role() in ('admin', 'coach', 'recorder')
  );

-- ── bat_log ──────────────────────────────────────────────────
create policy "팀원 조회" on public.bat_log
  for select using (team_id = public.my_team_id());

create policy "관리자/코치/기록자 편집" on public.bat_log
  for all using (
    team_id = public.my_team_id()
    and public.my_role() in ('admin', 'coach', 'recorder')
  );

-- ── pit_bf ───────────────────────────────────────────────────
create policy "팀원 조회" on public.pit_bf
  for select using (team_id = public.my_team_id());

create policy "관리자/코치/기록자 편집" on public.pit_bf
  for all using (
    team_id = public.my_team_id()
    and public.my_role() in ('admin', 'coach', 'recorder')
  );

-- ── pit_runs ─────────────────────────────────────────────────
create policy "팀원 조회" on public.pit_runs
  for select using (team_id = public.my_team_id());

create policy "관리자/코치/기록자 편집" on public.pit_runs
  for all using (
    team_id = public.my_team_id()
    and public.my_role() in ('admin', 'coach', 'recorder')
  );

-- ============================================================
-- 인덱스 (성능)
-- ============================================================

create index idx_games_team      on public.games    (team_id, date desc);
create index idx_bat_log_game    on public.bat_log  (game_id);
create index idx_bat_log_team    on public.bat_log  (team_id);
create index idx_pit_bf_game     on public.pit_bf   (game_id);
create index idx_pit_runs_game   on public.pit_runs (game_id);
create index idx_players_team    on public.players  (team_id, no);
