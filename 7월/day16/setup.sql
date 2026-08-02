-- ═══════════════════════════════════════════════════════════
-- 모닝브루 Day 16 — M1 운영 완결 (최종판: 설정 테이블 구조)
-- 실행 이력: v1(함수 내 URL) → v2(예외 격리) → v3(설정 테이블) — 전환 사유는 B-16-04
-- ⚠️ 실제 Webhook URL은 app_settings 테이블에만 (저장소 커밋 금지)
-- ═══════════════════════════════════════════════════════════

-- ── 0. 설정 테이블: 비밀값은 코드(함수)에서 분리 ──
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
-- 정책 없음 = 외부 접근 전면 차단 (security definer 함수만 읽음)

-- 최초 1회 (SQL Editor에서 실제 값으로):
-- insert into public.app_settings (key, value) values ('slack_webhook_url', '<실제 URL>')
--   on conflict (key) do update set value = excluded.value;

-- ── 1. 접수 알림 (Day 12 함수의 최종판) — 실패해도 접수는 성공 ──
create or replace function public.notify_slack()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform net.http_post(
      url := (select value from public.app_settings where key = 'slack_webhook_url'),
      body := jsonb_build_object('text',
        '☕ *새 예약 접수 — 모닝브루*' || E'\n\n' ||
        '👤 ' || new.name || ' 님 · ' ||
          regexp_replace(new.phone, '^([0-9]{3})([0-9]{3,4})([0-9]{4})$', '\1-\2-\3') || E'\n' ||
        '🥤 ' || new.menu || ' × ' || new.qty || '잔' || E'\n' ||
        '📅 ' || new.pickup_date || ' ⏰ ' || new.pickup_time || ' 픽업' ||
        coalesce(E'\n' || '📝 요청: ' || new.note, '')));
  exception when others then
    raise warning '접수 알림 실패(접수는 정상): %', sqlerrm;
  end;
  return new;
end $$;

-- ── 2. M1-①: 취소 알림 — 상태가 '취소'로 바뀌는 순간 (고객 RPC든 관리 화면이든) ──
create or replace function public.notify_slack_cancel()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  begin
    perform net.http_post(
      url := (select value from public.app_settings where key = 'slack_webhook_url'),
      body := jsonb_build_object('text',
        '🚫 *예약 취소 — 모닝브루*' || E'\n\n' ||
        '👤 ' || new.name || ' 님 · ' ||
          regexp_replace(new.phone, '^([0-9]{3})([0-9]{3,4})([0-9]{4})$', '\1-\2-\3') || E'\n' ||
        '🥤 ' || new.menu || ' × ' || new.qty || '잔' || E'\n' ||
        '📅 ' || new.pickup_date || ' ⏰ ' || new.pickup_time || ' 픽업분이 취소되었습니다'));
  exception when others then
    raise warning '취소 알림 실패(취소는 정상): %', sqlerrm;
  end;
  return new;
end $$;

create trigger notify_slack_on_cancel
  after update on public.reservations
  for each row
  when (old.status is distinct from new.status and new.status = '취소')
  execute function public.notify_slack_cancel();

-- ── 3. M1-③: 1개월 자동 파기 — 매일 03:00 KST (= 18:00 UTC) ──
create extension if not exists pg_cron;

select cron.schedule(
  'purge-old-reservations',
  '0 18 * * *',
  $$ delete from public.reservations where created_at < now() - interval '1 month' $$
);

-- 등록 확인:  select jobname, schedule, active from cron.job;
-- 실행 이력:  select jobname, status, start_time from cron.job_run_details order by start_time desc limit 5;
