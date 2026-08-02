-- ═══════════════════════════════════════════════════════════
-- 모닝브루 Day 19 — M2 메뉴 관리 (PRD v2 ④⑤⑥ · Day 11 ERD 점선의 완성)
-- 실행: Supabase SQL Editor (전체 붙여넣기 → Run)
-- ═══════════════════════════════════════════════════════════

-- ── 1. menus 테이블 ──
create table public.menus (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in ('pickup', 'product')), -- 픽업 음료·간식 / 상점 상품
  title       text not null check (char_length(title) <= 60),
  description text check (description is null or char_length(description) <= 100),
  emoji       text,
  price       integer not null check (price > 0),
  soldout     boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ── 2. RLS: 판매 정보는 공개(고객이 봐야 함), 수정은 사장의 품절 토글만 ──
alter table public.menus enable row level security;

create policy "anon_select_menus" on public.menus
  for select to anon using (true);

create policy "owner_select_menus" on public.menus
  for select to authenticated using (true);

create policy "owner_update_menus" on public.menus
  for update to authenticated using (true) with check (true);

revoke update on public.menus from authenticated;
grant update (soldout) on public.menus to authenticated;
-- 메뉴 추가·삭제·가격 변경은 Table Editor에서 (오늘 스코프 = 품절 토글)

-- ── 3. 시드: 현재 운영 중인 메뉴 그대로 ──
insert into public.menus (category, title, description, emoji, price, sort_order) values
  ('pickup',  '핸드드립 커피',        null,                      '☕', 5500,  1),
  ('pickup',  '오늘의 원두',          null,                      '🫘', 4500,  2),
  ('pickup',  '수제 스콘',            null,                      '🥐', 3500,  3),
  ('pickup',  '계절 과일 에이드',     null,                      '🍋', 6000,  4),
  ('product', '에티오피아 예가체프 원두(200g)', '아침에 볶은 싱글 오리진',   '☕', 18000, 1),
  ('product', '수제 버터 스콘 4개입',          '매일 아침 굽는 그 스콘',     '🥐', 12000, 2),
  ('product', '드립백 세트(10개입)',           '사무실에서 즐기는 모닝브루', '📦', 15000, 3);

-- 확인: select category, title, price, soldout from public.menus order by category, sort_order;
