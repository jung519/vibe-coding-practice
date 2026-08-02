-- ═══════════════════════════════════════════════════════════
-- 모닝브루 Day 11 — Supabase 설정 (B-11-O2)
-- 실행: Supabase 대시보드 → SQL Editor → 전체 붙여넣기 → Run
-- 설계 근거: B-11-R1 ERD · 검토 5건 반영(전화 규칙·영업 규칙·전역 슬롯·본인 조회/취소)
-- ═══════════════════════════════════════════════════════════

-- ── 1. 테이블 (영업 규칙 check 포함) ──
create table public.reservations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null check (phone ~ '^[0-9]{10,11}$'),
  menu        text not null,
  qty         smallint not null default 1 check (qty between 1 and 3),
  pickup_date date not null check (extract(dow from pickup_date) <> 1), -- 월요일 휴무
  pickup_time text not null check (pickup_time ~ '^[0-2][0-9]:[0-5][0-9]$'
                                   and pickup_time between '08:00' and '10:00'), -- 아침 픽업만
  note        text,
  status      text not null default '접수'
              check (status in ('접수','확정','픽업완료','취소')),
  consent_at  timestamptz not null,          -- 개인정보 동의 증빙
  created_at  timestamptz not null default now(), -- 보유 1개월 파기 기준
  updated_at  timestamptz not null default now()
);

-- ── 2. RLS: 익명(publishable key)은 INSERT만 — 테이블 직접 조회·수정·삭제 차단 ──
alter table public.reservations enable row level security;

create policy "anon_insert_only" on public.reservations
  for insert to anon with check (true);
-- SELECT/UPDATE/DELETE 정책 없음 = 전부 차단 (조회는 아래 RPC 통로로만)

-- ── 3. 슬롯 상한 3잔: 서버 전역 강제 (동시 요청 잠금 포함) ──
create or replace function public.enforce_slot_cap()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare used int;
begin
  perform pg_advisory_xact_lock(hashtext(new.pickup_date::text || new.pickup_time));
  select coalesce(sum(qty), 0) into used
    from public.reservations
   where pickup_date = new.pickup_date
     and pickup_time = new.pickup_time
     and status in ('접수','확정');
  if used + new.qty > 3 then
    raise exception 'SLOT_FULL';
  end if;
  return new;
end $$;

create trigger trg_slot_cap before insert on public.reservations
  for each row execute function public.enforce_slot_cap();

-- ── 4. RPC: 슬롯 현황 — 개인정보 없이 시간별 잔 수만 ──
create or replace function public.slot_status(p_date date)
returns table(pickup_time text, cups bigint)
language sql security definer set search_path = public, pg_temp as $$
  select r.pickup_time, sum(r.qty)::bigint
  from public.reservations r
  where r.pickup_date = p_date and r.status in ('접수','확정')
  group by r.pickup_time
$$;

-- ── 5. RPC: 내 예약 확인 — 이름+전화 모두 일치하는 본인 것만 ──
create or replace function public.my_reservations(p_name text, p_phone text)
returns table(id uuid, menu text, qty smallint, pickup_date date,
              pickup_time text, note text, status text)
language sql security definer set search_path = public, pg_temp as $$
  select r.id, r.menu, r.qty, r.pickup_date, r.pickup_time, r.note, r.status
  from public.reservations r
  where r.name = p_name and r.phone = p_phone
  order by r.pickup_date, r.pickup_time
$$;

-- ── 6. RPC: 고객 취소 — 본인 일치 + 접수 상태만 ──
create or replace function public.cancel_reservation(p_id uuid, p_name text, p_phone text)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.reservations set status = '취소', updated_at = now()
  where id = p_id and name = p_name and phone = p_phone and status = '접수';
  return found;
end $$;

-- ── 7. 함수 실행 권한: 익명에게는 위 3개 RPC만 ──
revoke execute on function public.enforce_slot_cap() from public, anon;
grant execute on function public.slot_status(date) to anon;
grant execute on function public.my_reservations(text, text) to anon;
grant execute on function public.cancel_reservation(uuid, text, text) to anon;
