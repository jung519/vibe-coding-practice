-- ═══════════════════════════════════════════════════════════
-- 모닝브루 Day 12 — 예약 접수 슬랙 알림 (B-12-O1 설정 원본)
-- 실행: Supabase SQL Editor — <SLACK_WEBHOOK_URL> 을 실제 값으로 바꿔서
-- ⚠️ 실제 Webhook URL은 비밀값 — 저장소에 커밋 금지 (DB 함수 안에만 존재)
-- ═══════════════════════════════════════════════════════════

-- 1) HTTP 전송 확장 (Supabase Database Webhooks의 내부 엔진)
create extension if not exists pg_net;

-- 2) INSERT → Slack Incoming Webhook (비동기 — 고객 접수 응답을 막지 않음)
--    템플릿(B-12-O2)이 곧 코드: 사장이 3초 안에 준비 판단 가능한 4요소
create or replace function public.notify_slack()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform net.http_post(
    url := '<SLACK_WEBHOOK_URL>',
    body := jsonb_build_object('text',
      '☕ *새 예약 접수 — 모닝브루*' || E'\n\n' ||
      '👤 ' || new.name || ' 님 · ' ||
        regexp_replace(new.phone, '^([0-9]{3})([0-9]{3,4})([0-9]{4})$', '\1-\2-\3') || E'\n' ||
      '🥤 ' || new.menu || ' × ' || new.qty || '잔' || E'\n' ||
      '📅 ' || new.pickup_date || ' ⏰ ' || new.pickup_time || ' 픽업' ||
      coalesce(E'\n' || '📝 요청: ' || new.note, '')
    )
  );
  return new;
end $$;

create trigger notify_slack_on_insert
  after insert on public.reservations
  for each row execute function public.notify_slack();

-- ── 이력 (실행 순서 기록) ──
-- 1차: Zapier Catch Hook 경유 트리거(notify_zapier_on_insert) 설치 → trial 만료로 Publish 불가
-- 2차: 아래로 정리 후 위 직결 트리거로 교체 (2026-07-21)
--   drop trigger if exists notify_zapier_on_insert on public.reservations;
--   drop function if exists public.notify_zapier();
