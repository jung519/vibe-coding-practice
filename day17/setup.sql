-- ═══════════════════════════════════════════════════════════
-- 모닝브루 Day 17 — 원두·디저트 주문 쇼핑몰 (orders)
-- 실행: Supabase SQL Editor (전체 붙여넣기 → Run)
-- 스키마·정책: 교재 그대로 (사장 결정 2026-07-28 — anon SELECT 포함)
-- 알림: Zapier 대신 Day 12 직결 인프라 재사용 (trial 만료 — B-12-O4)
-- ═══════════════════════════════════════════════════════════

-- ── 1. 테이블 + 정책 (교재 원문) ──
create table if not exists orders (
  id           bigserial primary key,
  customer_name text not null,
  phone        text not null,
  email        text,
  address      text,
  note         text,
  items        text not null,            -- 장바구니 상품 목록을 JSON 문자열로
  total_price  integer not null default 0,
  status       text not null default '접수',
  created_at   timestamptz default now()
);

-- 주문 목록을 화면에 보여 주려면 읽기 정책이 필요합니다
alter table orders enable row level security;
create policy "anon insert orders" on orders for insert to anon with check (true);
create policy "anon select orders" on orders for select to anon using (true);

-- ── 2. 운영자 알림: 새 주문 → 슬랙 (직결 — app_settings의 URL 재사용) ──
create or replace function public.notify_slack_order()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare item_summary text;
begin
  begin
    -- items JSON 문자열 → "상품명 ×수량" 줄로 요약 (파싱 실패 시 원문 일부)
    begin
      select string_agg(i->>'name' || ' ×' || (i->>'qty'), E'\n') into item_summary
      from jsonb_array_elements(new.items::jsonb) as i;
    exception when others then
      item_summary := left(new.items, 100);
    end;

    perform net.http_post(
      url := (select value from public.app_settings where key = 'slack_webhook_url'),
      body := jsonb_build_object('text',
        '🛒 *새 주문 접수 — 모닝브루 상점*' || E'\n\n' ||
        '👤 ' || new.customer_name || ' 님 · ' ||
          regexp_replace(new.phone, '^([0-9]{3})([0-9]{3,4})([0-9]{4})$', '\1-\2-\3') || E'\n' ||
        coalesce(item_summary, '(상품 정보 없음)') || E'\n' ||
        '💰 합계 ' || to_char(new.total_price, 'FM999,999,999') || '원' ||
        coalesce(E'\n' || '📦 주소: ' || new.address, '') ||
        coalesce(E'\n' || '📝 요청: ' || new.note, '') || E'\n\n' ||
        '→ 확인 후 고객에게 연락해 주세요'));
  exception when others then
    raise warning '주문 알림 실패(주문은 정상 저장): %', sqlerrm;
  end;
  return new;
end $$;

create trigger notify_slack_on_order
  after insert on orders
  for each row execute function public.notify_slack_order();

-- ═══════════════════════════════════════════════════════════
-- (추가 2026-07-28) 사장 관리 화면에서 주문 확인·상태 관리
-- 배경: 주문 확인 경로가 슬랙·Table Editor뿐 — 관리자 화면 통합 (사장 요청)
-- ═══════════════════════════════════════════════════════════

-- 로그인한 사장: 전체 조회 + 상태만 수정 (reservations와 같은 원칙)
create policy "owner_select_orders" on orders
  for select to authenticated using (true);

create policy "owner_update_orders" on orders
  for update to authenticated using (true) with check (true);

revoke update on orders from authenticated;
grant update (status) on orders to authenticated;
