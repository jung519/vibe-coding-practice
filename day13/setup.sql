-- ═══════════════════════════════════════════════════════════
-- 모닝브루 Day 13 — 사장 관리 화면 정책 (B-13-02)
-- 실행: Supabase SQL Editor
-- 전제(대시보드에서 먼저):
--   1) Authentication → Sign In / Providers → "Allow new users to sign up" OFF
--      (끄지 않으면 아무나 가입 → authenticated → 아래 정책으로 전체 열람 가능!)
--   2) Authentication → Users → Add user → 사장 계정 1개 (email + password)
-- ═══════════════════════════════════════════════════════════

-- ── 1. 로그인한 사장(authenticated)에게 조회·수정 허용 ──
--    (익명 anon은 Day 11 그대로: INSERT만 — 개인정보 SELECT 금지 유지)
create policy "owner_select" on public.reservations
  for select to authenticated using (true);

create policy "owner_update" on public.reservations
  for update to authenticated using (true) with check (true);

-- ── 2. 수정 범위 강화: 상태 처리에 필요한 컬럼만 ──
--    (사장 화면의 일은 상태 전이 — 이름·전화·예약 내용 변조는 원천 차단)
revoke update on public.reservations from authenticated;
grant update (status, updated_at) on public.reservations to authenticated;

-- ── 3. DELETE 정책 없음 = 화면에서 삭제 불가 (의도) ──
--    파기(1개월 경과 등)는 Table Editor에서 수행 — 운영 루틴(B-13-04)에 기록
