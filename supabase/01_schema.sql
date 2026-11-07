-- =====================================================================
-- 다모아 데이터베이스 설계도 v1  (2026-11-07)
-- 사용법: Supabase 대시보드 → SQL Editor → New query → 전체 붙여 넣기 → Run
-- 한 번만 실행하세요. (두 번 실행하면 "이미 있음" 오류가 나요)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. 도우미: 지금 로그인한 사람이 "선생님"인가?
--    학생은 가입 없이 '익명 로그인'을 쓰므로 is_anonymous = true 예요.
-- ---------------------------------------------------------------------
create or replace function public.is_teacher()
returns boolean
language sql stable
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

-- ---------------------------------------------------------------------
-- 1. 선생님
-- ---------------------------------------------------------------------
create table public.teachers (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  school       text,
  created_at   timestamptz not null default now()
);

-- 선생님이 회원가입하면 teachers 줄이 자동으로 생겨요 (학생 익명 로그인은 제외)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(new.is_anonymous, false) = false then
    insert into public.teachers (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. 반과 명렬표
-- ---------------------------------------------------------------------
create table public.classes (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid() references public.teachers(id) on delete cascade,
  name        text not null,                       -- 예: 1학년 3반
  school_year int  not null default extract(year from now())::int,
  created_at  timestamptz not null default now()
);

create table public.students (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes(id) on delete cascade,
  teacher_id  uuid not null default auth.uid() references public.teachers(id) on delete cascade,
  number      int  not null,                       -- 번호
  name        text not null check (char_length(name) between 1 and 20),  -- 성 없이 이름만 권장
  picture_key text,                                -- (선택) 그림 비밀번호. 학생 화면에는 절대 안 보임
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (class_id, number)
);

-- ---------------------------------------------------------------------
-- 3. 템플릿 (선생님 보관함)
--    content = 바탕 + 입력 부품 + 필기 층 설정 (JSON)
--    answer_key = 정답. 학생에게는 절대 전달되지 않음
-- ---------------------------------------------------------------------
create table public.templates (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid() references public.teachers(id) on delete cascade,
  title       text not null,
  kind        text not null default 'custom',      -- choice4, vertical_math, essay, blank, map, custom
  content     jsonb not null default '{}'::jsonb,
  answer_key  jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. 수업 (한 차시)
-- ---------------------------------------------------------------------
create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  teacher_id    uuid not null default auth.uid() references public.teachers(id) on delete cascade,
  class_id      uuid not null references public.classes(id) on delete cascade,
  title         text not null default '',
  join_code     text not null,                     -- 입장 번호 (QR에도 들어감)
  status        text not null default 'open' check (status in ('open', 'ended')),
  entry_open    boolean not null default true,     -- 입장 마감하면 false
  screen_mode   text not null default 'normal' check (screen_mode in ('normal', 'locked', 'look_front')),
  current_assignment_id uuid,
  created_at    timestamptz not null default now(),
  ended_at      timestamptz
);
-- 열려 있는 수업끼리는 입장 번호가 겹치지 않게
create unique index sessions_open_code_uniq on public.sessions (join_code) where status = 'open';

-- 이 수업에 들어온 학생 (태블릿 한 대 = 학생 한 명)
create table public.session_participants (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  auth_uid    uuid not null,                       -- 그 태블릿의 익명 로그인 id
  joined_at   timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  in_app      boolean not null default true,       -- false = 다른 앱으로 나감
  primary key (session_id, student_id),
  unique (session_id, auth_uid)
);

-- ---------------------------------------------------------------------
-- 5. 보낸 템플릿 (수업 중에 학생들에게 보낸 한 장)
--    보낸 순간의 템플릿 내용을 복사해 둬요. 나중에 원본을 고쳐도 기록은 그대로.
-- ---------------------------------------------------------------------
create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  teacher_id  uuid not null default auth.uid() references public.teachers(id) on delete cascade,
  template_id uuid references public.templates(id) on delete set null,
  title       text not null default '',
  kind        text not null default 'custom',
  content     jsonb not null,
  accepting   boolean not null default true,       -- false = 더 이상 제출 안 받음
  sent_at     timestamptz not null default now()
);

alter table public.sessions
  add constraint sessions_current_assignment_fk
  foreign key (current_assignment_id) references public.assignments(id) on delete set null;

-- 정답은 따로 보관 (학생이 읽을 수 없는 표)
create table public.assignment_keys (
  assignment_id uuid primary key references public.assignments(id) on delete cascade,
  teacher_id    uuid not null default auth.uid() references public.teachers(id) on delete cascade,
  answer_key    jsonb
);

-- ---------------------------------------------------------------------
-- 6. 제출물 (학생이 "전송"한 답안)
--    answer = 고른 답, 타자 글, 펜 획 데이터(좌표), 색칠 정보 등 (JSON)
--    한 학생은 한 장에 답안 하나. 다시 전송하면 덮어써요.
-- ---------------------------------------------------------------------
create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  session_id    uuid not null references public.sessions(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  teacher_id    uuid not null references public.teachers(id) on delete cascade,
  auth_uid      uuid not null default auth.uid(),
  answer        jsonb not null default '{}'::jsonb,
  is_correct    boolean,                           -- 자동 채점 결과 (선생님 쪽에서 기록)
  submitted_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (assignment_id, student_id)
);
create index submissions_student_idx on public.submissions (student_id, submitted_at);
create index submissions_session_idx on public.submissions (session_id);

-- ---------------------------------------------------------------------
-- 7. 선생님 도장과 한마디
-- ---------------------------------------------------------------------
create table public.feedback (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null unique references public.submissions(id) on delete cascade,
  teacher_id      uuid not null default auth.uid() references public.teachers(id) on delete cascade,
  stamp           text,                            -- 예: great, best, effort, retry, 또는 내 도장 id
  comment         text,
  comment_strokes jsonb,                           -- 펜으로 쓴 한마디
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- 자동 처리 (트리거)
-- =====================================================================

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger templates_touch before update on public.templates
  for each row execute function public.touch_updated_at();
create trigger feedback_touch before update on public.feedback
  for each row execute function public.touch_updated_at();

-- 제출물: 학생이 보낸 값 중 '누구 것인지'는 믿지 않고 서버가 직접 채워요
create or replace function public.fill_submission()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  a public.assignments;
  s public.sessions;
  p public.session_participants;
begin
  select * into a from public.assignments where id = new.assignment_id;
  if a.id is null then
    raise exception 'no_assignment';
  end if;

  new.session_id := a.session_id;
  new.teacher_id := a.teacher_id;
  new.updated_at := now();

  if not public.is_teacher() then
    select * into s from public.sessions where id = a.session_id;
    if s.status <> 'open' then
      raise exception 'session_ended';
    end if;
    if not a.accepting then
      raise exception 'assignment_closed';
    end if;
    if s.screen_mode = 'locked' then
      raise exception 'screen_locked';
    end if;

    select * into p from public.session_participants
     where session_id = a.session_id and auth_uid = auth.uid();
    if p.student_id is null then
      raise exception 'not_joined';
    end if;

    new.student_id   := p.student_id;
    new.auth_uid     := auth.uid();
    new.is_correct   := null;                     -- 다시 낸 답은 다시 채점
    new.submitted_at := now();
  end if;

  return new;
end $$;

create trigger submissions_fill
  before insert or update on public.submissions
  for each row execute function public.fill_submission();

-- =====================================================================
-- 학생이 쓰는 기능 (함수로만 열어 둠)
-- =====================================================================

-- 이 태블릿이 이 수업에 들어와 있나? (보안 규칙에서 사용)
create or replace function public.joined_session(sid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.session_participants
     where session_id = sid and auth_uid = auth.uid()
  )
$$;

-- 선생님: 수업 시작 → 6자리 입장 번호 자동 생성
create or replace function public.start_session(p_class uuid, p_title text default '')
returns public.sessions
language plpgsql security definer set search_path = public
as $$
declare
  v_code text;
  v_row  public.sessions;
begin
  if not public.is_teacher() then
    raise exception 'teacher_only';
  end if;
  if not exists (select 1 from public.classes where id = p_class and teacher_id = auth.uid()) then
    raise exception 'not_your_class';
  end if;

  loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.sessions where join_code = v_code and status = 'open');
  end loop;

  insert into public.sessions (teacher_id, class_id, title, join_code)
  values (auth.uid(), p_class, coalesce(p_title, ''), v_code)
  returning * into v_row;

  return v_row;
end $$;

-- 학생: QR로 들어오면 명렬표를 받아요 (이름·번호·이미 들어왔는지만)
create or replace function public.session_roster(p_code text)
returns table (student_id uuid, number int, name text, taken boolean, needs_picture boolean, session_title text)
language plpgsql stable security definer set search_path = public
as $$
declare
  s public.sessions;
begin
  select * into s from public.sessions where join_code = p_code and status = 'open';
  if s.id is null then
    raise exception 'no_session';
  end if;
  if not s.entry_open then
    raise exception 'entry_closed';
  end if;

  return query
    select st.id, st.number, st.name,
           exists (select 1 from public.session_participants sp
                    where sp.session_id = s.id and sp.student_id = st.id
                      and sp.auth_uid <> auth.uid()),
           st.picture_key is not null,
           s.title
      from public.students st
     where st.class_id = s.class_id and st.active
     order by st.number;
end $$;

-- 학생: 내 이름 고르기
create or replace function public.claim_student(p_code text, p_student uuid, p_picture text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  s  public.sessions;
  st public.students;
begin
  if auth.uid() is null then
    raise exception 'login_required';
  end if;

  select * into s from public.sessions where join_code = p_code and status = 'open';
  if s.id is null then
    raise exception 'no_session';
  end if;
  if not s.entry_open then
    raise exception 'entry_closed';
  end if;

  select * into st from public.students
   where id = p_student and class_id = s.class_id and active;
  if st.id is null then
    raise exception 'no_student';
  end if;

  if st.picture_key is not null and st.picture_key is distinct from p_picture then
    raise exception 'wrong_picture';
  end if;

  if exists (select 1 from public.session_participants
              where session_id = s.id and student_id = st.id and auth_uid <> auth.uid()) then
    raise exception 'taken';
  end if;

  -- 이 태블릿이 다른 이름을 골랐었다면 그 이름은 풀어 줘요
  delete from public.session_participants
   where session_id = s.id and auth_uid = auth.uid() and student_id <> st.id;

  insert into public.session_participants (session_id, student_id, auth_uid)
  values (s.id, st.id, auth.uid())
  on conflict (session_id, student_id)
  do update set last_seen = now(), in_app = true;

  return s.id;
end $$;

-- 학생: "나 아직 여기 있어요" 신호 (다른 앱으로 나가면 in_app = false)
create or replace function public.heartbeat(p_session uuid, p_in_app boolean default true)
returns void
language sql security definer set search_path = public
as $$
  update public.session_participants
     set last_seen = now(), in_app = p_in_app
   where session_id = p_session and auth_uid = auth.uid();
$$;

-- 함수 실행 권한: 로그인한 사람만 (학생 익명 로그인 포함)
revoke execute on function public.start_session(uuid, text)            from public, anon;
revoke execute on function public.session_roster(text)                 from public, anon;
revoke execute on function public.claim_student(text, uuid, text)      from public, anon;
revoke execute on function public.heartbeat(uuid, boolean)             from public, anon;
revoke execute on function public.joined_session(uuid)                 from public, anon;
grant  execute on function public.start_session(uuid, text)            to authenticated;
grant  execute on function public.session_roster(text)                 to authenticated;
grant  execute on function public.claim_student(text, uuid, text)      to authenticated;
grant  execute on function public.heartbeat(uuid, boolean)             to authenticated;
grant  execute on function public.joined_session(uuid)                 to authenticated;
grant  execute on function public.is_teacher()                         to authenticated;

-- =====================================================================
-- 보안 규칙 (Row Level Security)
-- 원칙: 선생님은 자기 자료만, 학생은 자기가 들어온 수업과 자기 답안만
-- =====================================================================

alter table public.teachers             enable row level security;
alter table public.classes              enable row level security;
alter table public.students             enable row level security;
alter table public.templates            enable row level security;
alter table public.sessions             enable row level security;
alter table public.session_participants enable row level security;
alter table public.assignments          enable row level security;
alter table public.assignment_keys      enable row level security;
alter table public.submissions          enable row level security;
alter table public.feedback             enable row level security;

-- 선생님 프로필
create policy teachers_self_select on public.teachers
  for select to authenticated using (id = auth.uid());
create policy teachers_self_update on public.teachers
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 반
create policy classes_owner on public.classes
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and public.is_teacher());

-- 명렬표 (학생은 직접 못 읽음 → session_roster 함수로만)
create policy students_owner on public.students
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );

-- 템플릿 보관함
create policy templates_owner on public.templates
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and public.is_teacher());

-- 수업
create policy sessions_owner on public.sessions
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );
create policy sessions_participant_read on public.sessions
  for select to authenticated
  using (public.joined_session(id));

-- 입장한 학생 목록
create policy participants_teacher on public.session_participants
  for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.teacher_id = auth.uid()));
create policy participants_teacher_kick on public.session_participants
  for delete to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and s.teacher_id = auth.uid()));
create policy participants_self_read on public.session_participants
  for select to authenticated
  using (auth_uid = auth.uid());

-- 보낸 템플릿
create policy assignments_owner on public.assignments
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.sessions s where s.id = session_id and s.teacher_id = auth.uid())
  );
create policy assignments_participant_read on public.assignments
  for select to authenticated
  using (public.joined_session(session_id));

-- 정답 (선생님만)
create policy assignment_keys_owner on public.assignment_keys
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.assignments a where a.id = assignment_id and a.teacher_id = auth.uid())
  );

-- 제출물
create policy submissions_teacher_read on public.submissions
  for select to authenticated using (teacher_id = auth.uid());
create policy submissions_teacher_update on public.submissions
  for update to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy submissions_teacher_delete on public.submissions
  for delete to authenticated using (teacher_id = auth.uid());
create policy submissions_student_read on public.submissions
  for select to authenticated using (auth_uid = auth.uid());
create policy submissions_student_insert on public.submissions
  for insert to authenticated
  with check (auth_uid = auth.uid() and public.joined_session(session_id));
create policy submissions_student_update on public.submissions
  for update to authenticated
  using (auth_uid = auth.uid())
  with check (auth_uid = auth.uid() and public.joined_session(session_id));

-- 도장과 한마디
create policy feedback_owner on public.feedback
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.submissions sb where sb.id = submission_id and sb.teacher_id = auth.uid())
  );
create policy feedback_student_read on public.feedback
  for select to authenticated
  using (exists (select 1 from public.submissions sb where sb.id = submission_id and sb.auth_uid = auth.uid()));

-- =====================================================================
-- 실시간 전달 켜기 (선생님 ↔ 학생 화면이 바로바로 바뀌게)
-- =====================================================================
alter publication supabase_realtime add table
  public.sessions,
  public.session_participants,
  public.assignments,
  public.submissions,
  public.feedback;

-- 끝! "Success. No rows returned" 가 나오면 성공이에요.
