-- =====================================================================
-- 다모아 06: 포트폴리오 대표작 별표
-- Supabase → SQL Editor 에 통째로 붙여 넣고 Run 하세요. 여러 번 실행해도 괜찮아요.
-- (답안 표에 직접 쓰지 않고 따로 두어서, 별표를 달아도 학생이 "낸 시각"은 그대로예요)
-- =====================================================================

create table if not exists public.portfolio_stars (
  submission_id uuid primary key references public.submissions(id) on delete cascade,
  teacher_id    uuid not null default auth.uid() references public.teachers(id) on delete cascade,
  created_at    timestamptz not null default now()
);

alter table public.portfolio_stars enable row level security;

drop policy if exists portfolio_stars_owner on public.portfolio_stars;
create policy portfolio_stars_owner on public.portfolio_stars
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.submissions sb where sb.id = submission_id and sb.teacher_id = auth.uid())
  );

grant select, insert, delete on public.portfolio_stars to authenticated;
