-- ═══════════════════════════════════════════════════════════
-- 모닝브루 Day 18 — 버그 사냥 수정: 서버 데이터 품질 방어
-- 실행: Supabase SQL Editor (전체 붙여넣기 → Run)
-- 근거: B-18-01 버그 사냥 — 직접 API 호출로 뚫리는 구멍 2건
-- ═══════════════════════════════════════════════════════════

-- ── 1. 예약: 과거 날짜 차단 (KST 기준 오늘부터만) ──
--    now()는 비불변이라 check 대신 BEFORE 트리거로 검증
create or replace function public.validate_reservation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.pickup_date < (now() at time zone 'Asia/Seoul')::date then
    raise exception 'PAST_DATE';
  end if;
  return new;
end $$;

create trigger validate_reservation_on_insert
  before insert on public.reservations
  for each row execute function public.validate_reservation();

-- ── 2. 예약: 입력 길이 상한 (이름 40자·요청 300자) ──
alter table public.reservations
  add constraint reservations_name_len  check (char_length(name) <= 40),
  add constraint reservations_note_len  check (note is null or char_length(note) <= 300);

-- ── 3. 주문: 데이터 품질 제약 (버그 사냥 1번 — 현재 check 0개) ──
alter table public.orders
  add constraint orders_phone_format check (phone ~ '^[0-9]{10,11}$'),
  add constraint orders_total_positive check (total_price > 0),
  add constraint orders_items_is_array check (jsonb_typeof(items::jsonb) = 'array'),
  add constraint orders_name_len check (char_length(customer_name) <= 40),
  add constraint orders_note_len check (note is null or char_length(note) <= 300),
  add constraint orders_status_valid check (status in ('접수','확인','완료','취소'));

-- 확인: 기존 정상 데이터가 제약을 통과하는지 (오류 없이 Success면 됨)
-- select count(*) from public.reservations; select count(*) from public.orders;
