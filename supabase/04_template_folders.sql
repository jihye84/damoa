-- 다모아 추가 설계도 04  (01~03을 실행한 다음에 한 번 실행하세요)
-- 템플릿 보관함을 묶음(폴더)별로 정리할 수 있게 해요.

alter table public.templates add column if not exists folder text;
create index if not exists templates_folder_idx on public.templates (teacher_id, folder);
