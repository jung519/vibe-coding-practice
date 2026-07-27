-- ═══════════════════════════════════════════════════════════
-- 모닝브루 Day 16 — M1 운영 완결 (PRD v2 · B-16-02 스펙)
-- 실행: Supabase SQL Editor — <SLACK_WEBHOOK_URL>을 Day 12와 같은 값으로 바꿔서
-- ⚠️ Webhook URL은 비밀값 — 저장소 커밋 금지 (DB 안에만)
-- ═══════════════════════════════════════════════════════════

-- ── M1-①: 취소 알림 — 상태가 '취소'로 바뀌는 순간 사장 슬랙 ──
--   (고객 RPC 취소든, 관리 화면 취소든 — 서버 시점이라 모두 잡힘)
create or replace function public.notify_slack_cancel()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform net.http_post(
    url := '<SLACK_WEBHOOK_URL>',
    body := jsonb_build_object('text',
      '🚫 *예약 취소 — 모닝브루*' || E'\n\n' ||
      '👤 ' || new.name || ' 님 · ' ||
        regexp_replace(new.phone, '^([0-9]{3})([0-9]{3,4})([0-9]{4})$', '\1-\2-\3') || E'\n' ||
      '🥤 ' || new.menu || ' × ' || new.qty || '잔' || E'\n' ||
      '📅 ' || new.pickup_date || ' ⏰ ' || new.pickup_time || ' 픽업분이 취소되었습니다'
    )
  );
  return new;
end $$;

create trigger notify_slack_on_cancel
  after update on public.reservations
  for each row
  when (old.status is distinct from new.status and new.status = '취소')
  execute function public.notify_slack_cancel();

-- ── M1-③: 1개월 자동 파기 — 매일 03:00 KST (= 18:00 UTC, cron은 UTC 기준) ──
--   근거: 개인정보 보유 1개월 정책 (PRD v1 · B-13-04 운영 루틴의 수동 파기 자동화)
create extension if not exists pg_cron;

select cron.schedule(
  'purge-old-reservations',
  '0 18 * * *',
  $$ delete from public.reservations where created_at < now() - interval '1 month' $$
);

-- 실행 이력 확인(운영 점검용):
--   select jobname, status, start_time from cron.job_run_details
--   order by start_time desc limit 5;
