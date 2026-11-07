-- =====================================================================
-- 다모아 05: 누구나 들어오기 (이름·별명 쓰고 입장)
-- Supabase → SQL Editor 에 통째로 붙여 넣고 Run 하세요. 여러 번 실행해도 괜찮아요.
-- =====================================================================

-- 수업마다 들어오는 방법: roster(명렬표에서 이름 고르기) / open(QR 있는 누구나, 이름 쓰기)
alter table public.sessions
  add column if not exists join_mode text not null default 'roster';
do $$ begin
  alter table public.sessions add constraint sessions_join_mode_chk check (join_mode in ('roster', 'open'));
exception when duplicate_object then null; end $$;

-- 이름을 쓰고 들어온 학생은 그 수업에만 있는 손님이에요 (명렬표에는 안 보여요)
alter table public.students
  add column if not exists guest_session uuid references public.sessions(id) on delete cascade;
create index if not exists students_guest_session_idx on public.students (guest_session);

-- 손님 번호는 명렬표 번호와 겹치지 않게 음수로 매겨요 (화면에는 번호 없이 이름만 보여요)
create sequence if not exists public.guest_no_seq;

-- 학생: 입장 번호로 수업 이름과 들어오는 방법을 알아요
create or replace function public.session_info(p_code text)
returns table (session_title text, join_mode text)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  s public.sessions;
begin
  select * into s from public.sessions where join_code = p_code and status = 'open';
  if s.id is null then raise exception 'no_session'; end if;
  if not s.entry_open then raise exception 'entry_closed'; end if;
  return query select s.title, s.join_mode;
end $$;

-- 학생: 이름이나 별명을 쓰고 들어와요
create or replace function public.join_open(p_code text, p_name text)
returns table (session_id uuid, student_id uuid, name text)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  s   public.sessions;
  v   text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  sid uuid;
begin
  if auth.uid() is null then raise exception 'login_required'; end if;
  if char_length(v) < 1 or char_length(v) > 12 then raise exception 'bad_name'; end if;

  select * into s from public.sessions where join_code = p_code and status = 'open';
  if s.id is null then raise exception 'no_session'; end if;
  if not s.entry_open then raise exception 'entry_closed'; end if;
  if s.join_mode <> 'open' then raise exception 'roster_only'; end if;

  -- 같은 수업에서 다른 태블릿이 이미 쓰는 이름이면 안 돼요
  if exists (select 1 from public.students st
               join public.session_participants sp on sp.student_id = st.id and sp.session_id = s.id
              where st.guest_session = s.id and st.name = v and sp.auth_uid <> auth.uid()) then
    raise exception 'name_taken';
  end if;

  -- 이 태블릿이 벌써 들어와 있었다면 이름만 바꿔요
  select sp.student_id into sid
    from public.session_participants sp
    join public.students st on st.id = sp.student_id
   where sp.session_id = s.id and sp.auth_uid = auth.uid() and st.guest_session = s.id
   limit 1;

  if sid is not null then
    update public.students set name = v where id = sid;
    update public.session_participants set last_seen = now(), in_app = true
     where session_id = s.id and student_id = sid;
  else
    -- 명렬표 이름을 골랐었다면 그건 풀어 줘요
    delete from public.session_participants where session_id = s.id and auth_uid = auth.uid();
    insert into public.students (class_id, teacher_id, number, name, active, guest_session)
    values (s.class_id, s.teacher_id, -nextval('public.guest_no_seq')::int, v, false, s.id)
    returning id into sid;
    insert into public.session_participants (session_id, student_id, auth_uid)
    values (s.id, sid, auth.uid());
  end if;

  return query select s.id, sid, v;
end $$;

revoke execute on function public.session_info(text)    from public, anon;
revoke execute on function public.join_open(text, text) from public, anon;
grant  execute on function public.session_info(text)    to authenticated;
grant  execute on function public.join_open(text, text) to authenticated;
