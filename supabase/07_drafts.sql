-- 다모아 추가 설계도 07  (01~06을 실행한 다음에 한 번 실행하세요)
-- 학생이 쓰던 것을 서버에도 몇 초마다 맡겨 둬요.
-- 1) 브라우저를 닫거나 태블릿이 꺼져도, 다시 들어오면 쓰던 그대로 이어서 해요
-- 2) 다른 태블릿으로 바꿔 들어와도(선생님이 이름을 풀어 준 뒤) 이어서 해요
-- 3) 선생님이 마감하면, 창을 닫아 버린 학생 것까지 쓰던 그대로 거둬 와요

create table if not exists public.drafts (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  session_id    uuid not null references public.sessions(id) on delete cascade,
  teacher_id    uuid not null references public.teachers(id) on delete cascade,
  auth_uid      uuid not null,
  answer        jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (assignment_id, student_id)
);
create index if not exists drafts_session_idx on public.drafts (session_id);

alter table public.drafts enable row level security;
-- 선생님은 자기 수업 것만 볼 수 있어요. 학생은 아래 함수로만 쓰고 읽어요.
drop policy if exists drafts_teacher_read on public.drafts;
create policy drafts_teacher_read on public.drafts
  for select to authenticated using (teacher_id = auth.uid());

-- 학생: 쓰던 것 맡기기
create or replace function public.save_draft(p_assignment uuid, p_answer jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  a public.assignments;
  p public.session_participants;
begin
  if p_answer is null or octet_length(p_answer::text) > 2000000 then
    raise exception 'too_big';
  end if;
  select * into a from public.assignments where id = p_assignment;
  if a.id is null or not a.accepting then
    return;                                         -- 끝난 장은 조용히 넘어가요
  end if;
  if not exists (select 1 from public.sessions where id = a.session_id and status = 'open') then
    return;
  end if;
  select * into p from public.session_participants
   where session_id = a.session_id and auth_uid = auth.uid();
  if p.student_id is null then
    raise exception 'not_joined';
  end if;
  -- 이미 보낸 장은 학생 화면에서 "고쳐서 다시 보내기" 중일 수 있으니 그래도 맡아 둬요
  insert into public.drafts (assignment_id, student_id, session_id, teacher_id, auth_uid, answer, updated_at)
  values (a.id, p.student_id, a.session_id, a.teacher_id, auth.uid(), p_answer, now())
  on conflict (assignment_id, student_id)
  do update set answer = excluded.answer, auth_uid = excluded.auth_uid, updated_at = now();
end $$;

-- 학생: 이 수업에서 내가 쓰던 것 모두 받기 (태블릿이 바뀌어도 이름으로 찾아요)
create or replace function public.my_drafts(p_session uuid)
returns table (assignment_id uuid, answer jsonb, updated_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_student uuid;
begin
  select sp.student_id into v_student from public.session_participants sp
   where sp.session_id = p_session and sp.auth_uid = auth.uid();
  if v_student is null then
    return;
  end if;
  return query
    select d.assignment_id, d.answer, d.updated_at from public.drafts d
     where d.session_id = p_session and d.student_id = v_student;
end $$;

revoke execute on function public.save_draft(uuid, jsonb) from public, anon;
revoke execute on function public.my_drafts(uuid)         from public, anon;
grant  execute on function public.save_draft(uuid, jsonb) to authenticated;
grant  execute on function public.my_drafts(uuid)         to authenticated;

-- 보내면 맡겨 둔 것은 지워요
create or replace function public.clear_draft_on_submit()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.drafts where assignment_id = new.assignment_id and student_id = new.student_id;
  return null;
end $$;

drop trigger if exists submissions_clear_draft on public.submissions;
create trigger submissions_clear_draft
  after insert or update on public.submissions
  for each row execute function public.clear_draft_on_submit();

-- 선생님이 마감하면: 아직 안 낸 학생의 맡겨 둔 것을 "자동 거둠"으로 넣어요
create or replace function public.collect_drafts_on_close()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.accepting = false and coalesce(old.accepting, true) = true then
    insert into public.submissions (assignment_id, session_id, student_id, teacher_id, auth_uid, answer, auto_collected)
    select d.assignment_id, d.session_id, d.student_id, d.teacher_id, d.auth_uid, d.answer, true
      from public.drafts d
     where d.assignment_id = new.id
       and not exists (select 1 from public.submissions sb
                        where sb.assignment_id = d.assignment_id and sb.student_id = d.student_id)
    on conflict (assignment_id, student_id) do nothing;
    delete from public.drafts where assignment_id = new.id;
  end if;
  return null;
end $$;

drop trigger if exists assignments_collect_drafts on public.assignments;
create trigger assignments_collect_drafts
  after update on public.assignments
  for each row execute function public.collect_drafts_on_close();

-- 다른 태블릿으로 바꿔 들어와도 내가 낸 것이 보이고 고쳐 낼 수 있게
-- (이 수업에서 지금 내 이름을 쓰고 있는 사람 = 나)
drop policy if exists submissions_student_read on public.submissions;
create policy submissions_student_read on public.submissions
  for select to authenticated using (
    auth_uid = auth.uid()
    or exists (select 1 from public.session_participants sp
                where sp.session_id = submissions.session_id
                  and sp.student_id = submissions.student_id
                  and sp.auth_uid = auth.uid())
  );
drop policy if exists submissions_student_update on public.submissions;
create policy submissions_student_update on public.submissions
  for update to authenticated
  using (
    auth_uid = auth.uid()
    or exists (select 1 from public.session_participants sp
                where sp.session_id = submissions.session_id
                  and sp.student_id = submissions.student_id
                  and sp.auth_uid = auth.uid())
  )
  with check (auth_uid = auth.uid() and public.joined_session(session_id));

drop policy if exists feedback_student_read on public.feedback;
create policy feedback_student_read on public.feedback
  for select to authenticated using (
    exists (select 1 from public.submissions sb
             where sb.id = submission_id
               and (sb.auth_uid = auth.uid()
                    or exists (select 1 from public.session_participants sp
                                where sp.session_id = sb.session_id
                                  and sp.student_id = sb.student_id
                                  and sp.auth_uid = auth.uid())))
  );
