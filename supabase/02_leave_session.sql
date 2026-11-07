-- 다모아 추가 설계도 02  (01을 실행한 다음에 한 번 실행하세요)
-- 학생이 "내 이름이 아니에요"를 누르면 그 이름을 풀어 줘요.

create or replace function public.leave_session(p_session uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from public.session_participants
   where session_id = p_session and auth_uid = auth.uid();
$$;

revoke execute on function public.leave_session(uuid) from public, anon;
grant  execute on function public.leave_session(uuid) to authenticated;
