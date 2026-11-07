-- 다모아 추가 설계도 03  (01, 02를 실행한 다음에 한 번 실행하세요)
-- 1) 여러 장을 동시에 열어 둘 수 있게 마감 시각을 기록해요
-- 2) 마감하면 쓰던 답을 자동으로 거둬 가요 (마감 뒤 2분 동안만 허용)
-- 3) 학생 꽃밭에 "몇 명 중 몇 명이 보냈는지" 숫자만 알려 줘요

alter table public.assignments add column if not exists closed_at timestamptz;
alter table public.submissions add column if not exists auto_collected boolean not null default false;

-- 마감하면 closed_at 자동 기록, 다시 열면 지움
create or replace function public.stamp_closed_at()
returns trigger language plpgsql as $$
begin
  if new.accepting = false and coalesce(old.accepting, true) = true then
    new.closed_at := now();
  elsif new.accepting = true then
    new.closed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists assignments_closed_at on public.assignments;
create trigger assignments_closed_at
  before update on public.assignments
  for each row execute function public.stamp_closed_at();

-- 제출물 규칙 다시 쓰기: 마감 뒤에는 '자동 거둠'만 2분 동안 받아요
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
      -- 마감 순간 쓰던 것을 거둬 가는 경우만, 마감 뒤 2분 안에, 처음 내는 답만
      if not coalesce(new.auto_collected, false)
         or tg_op <> 'INSERT'
         or a.closed_at is null
         or a.closed_at < now() - interval '2 minutes' then
        raise exception 'assignment_closed';
      end if;
    else
      new.auto_collected := false;
      if s.screen_mode = 'locked' then
        raise exception 'screen_locked';
      end if;
    end if;

    select * into p from public.session_participants
     where session_id = a.session_id and auth_uid = auth.uid();
    if p.student_id is null then
      raise exception 'not_joined';
    end if;

    new.student_id   := p.student_id;
    new.auth_uid     := auth.uid();
    new.is_correct   := null;
    new.submitted_at := now();
  end if;

  return new;
end $$;

-- 꽃밭 숫자: 이 수업에 들어온 학생 수, 이 장을 낸 학생 수 (누가 냈는지는 안 알려 줌)
create or replace function public.session_progress(p_session uuid, p_assignment uuid)
returns table (joined int, submitted int)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.joined_session(p_session) then
    raise exception 'not_joined';
  end if;
  return query
    select (select count(*)::int from public.session_participants where session_id = p_session),
           (select count(*)::int from public.submissions sb
              where sb.assignment_id = p_assignment and sb.session_id = p_session);
end $$;

revoke execute on function public.session_progress(uuid, uuid) from public, anon;
grant  execute on function public.session_progress(uuid, uuid) to authenticated;
