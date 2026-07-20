// Day11 라이브 검증 — 실제 Supabase 서버에 테스트 5건 제출 + 서버 규칙 확인
// 사용: node tests/day11-live.js [고객페이지 URL]
// ⚠️ 실서버에 실습용 가짜 데이터가 저장된다 (사장님이 Table Editor에서 확인·정리)
const { chromium } = require('playwright-core');

const CUSTOMER = process.argv[2] || 'file:///Users/junghyun/Project/kaist/day1/index.html';
const SB = 'https://vffoydlxftzykupsqlnp.supabase.co';
const KEY = 'sb_publishable_D-4Y6feEhZNnKDwmTuCqEw_ZyFVu5nf';
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

const results = [];
function log(item, pass, detail) {
  results.push({ item, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${item}${detail ? ' :: ' + detail : ''}`);
}

async function rpc(name, params) {
  const res = await fetch(SB + '/rest/v1/rpc/' + name, { method: 'POST', headers: H, body: JSON.stringify(params) });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

async function submit(page, name, phone, hour, min, qty, note) {
  await page.fill('#name', name);
  await page.fill('#phone', phone);
  await page.check('#consent');
  await page.selectOption('#timeHour', hour);
  await page.selectOption('#timeMin', min);
  await page.evaluate(() => { document.getElementById('note').value = ''; });
  if (note) await page.fill('#note', note);
  const cur = await page.evaluate(() => Number(document.getElementById('qtyValue').textContent));
  for (let i = cur; i < qty; i++) await page.click('#qtyPlus');
  for (let i = cur; i > qty; i--) await page.click('#qtyMinus');
  await page.click('#submitBtn');
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });

  await page.goto(CUSTOMER);
  await page.waitForTimeout(1200);
  const date = await page.inputValue('#pickupDate');
  console.log('대상 날짜:', date, '| 페이지:', CUSTOMER, '\n');

  // ── L1~L2: 같은 슬롯(08:10)에 1잔 + 2잔 = 3잔 채우기 ──
  await submit(page, '김테스트', '010-0000-0001', '08', '10', 1);
  await page.waitForSelector('.success-box.show', { timeout: 8000 });
  log('L1 1건: 김테스트 08:10 × 1잔 접수', true);

  await submit(page, '이살펴', '010-0000-0002', '08', '10', 2);
  await page.waitForSelector('.success-box.show', { timeout: 8000 });
  log('L2 2건: 이살펴 08:10 × 2잔 접수 (슬롯 3/3)', true);

  // ── L3: 같은 슬롯 4잔째 → 서버가 SLOT_FULL로 거절해야 함 ──
  // (다른 브라우저인 척: 현황 새로고침 전 시도 — 서버 트리거가 최종 방어)
  dialogs.length = 0;
  const blocked = await page.evaluate(async (args) => {
    const res = await fetch(args.sb + '/rest/v1/reservations', {
      method: 'POST', headers: args.h,
      body: JSON.stringify({ name: '박마감', phone: '01000000003', menu: '카페라떼 (6,000원)', qty: 1, pickup_date: args.date, pickup_time: '08:10', note: null, consent_at: new Date().toISOString() })
    });
    return { status: res.status, body: await res.text() };
  }, { sb: SB, h: H, date });
  log('L3 슬롯 4잔째 직접 API 시도 → 서버 트리거가 거절 (전역 상한)', blocked.status >= 400 && blocked.body.includes('SLOT_FULL'), `HTTP ${blocked.status}`);

  // ── L3b: 박마감을 08:20으로 정상 접수 (3건째 저장) ──
  await page.reload(); await page.waitForTimeout(1200);
  await submit(page, '박마감', '010-0000-0003', '08', '20', 1);
  await page.waitForSelector('.success-box.show', { timeout: 8000 });
  log('L4 3건: 박마감 08:20 × 1잔 접수', true);

  // ── L4b~5: 취소 시나리오용 + 요청사항 매핑 (4·5건째) ──
  await submit(page, '최취소', '010-0000-0004', '09', '00', 1);
  await page.waitForSelector('.success-box.show', { timeout: 8000 });
  log('L5 4건: 최취소 09:00 × 1잔 접수', true);

  await submit(page, '정다섯', '010-0000-0005', '09', '30', 1, '연하게 부탁드려요');
  await page.waitForSelector('.success-box.show', { timeout: 8000 });
  log('L6 5건: 정다섯 09:30 × 1잔 + 요청사항 접수', true);

  // ── L7: 슬롯 현황이 서버 전역 진실로 표시 (08:10 마감) ──
  await page.reload(); await page.waitForTimeout(1500);
  await page.selectOption('#timeHour', '08');
  const slotUI = await page.evaluate(() => {
    const o = Array.from(document.querySelectorAll('#timeMin option')).find((x) => x.value === '10');
    return { disabled: o.disabled, text: o.textContent };
  });
  log('L7 새 세션에서도 08:10 마감 표시 (전역 현황)', slotUI.disabled && slotUI.text.includes('마감'), JSON.stringify(slotUI));

  // ── L8: 내 예약 확인 + 고객 취소 → 서버 반영 ──
  await page.click('#lookupToggle');
  await page.fill('#lookupName', '최취소');
  await page.fill('#lookupPhone', '010-0000-0004');
  await page.click('#lookupRun');
  await page.waitForSelector('#lookupResults .btn-cancel-booking', { timeout: 8000 });
  await page.click('#lookupResults .btn-cancel-booking');
  await page.waitForTimeout(2500);
  const after = await rpc('my_reservations', { p_name: '최취소', p_phone: '01000000004' });
  const cancelled = after.data && after.data.some((r) => r.pickup_time === '09:00' && r.status === '취소');
  log('L8 고객 취소가 서버에 반영 (my_reservations로 확인)', !!cancelled, JSON.stringify(after.data));

  // ── L9: 서버 영업 규칙 — 23시 예약 직접 시도 → check 거절 ──
  const badTime = await page.evaluate(async (args) => {
    const res = await fetch(args.sb + '/rest/v1/reservations', {
      method: 'POST', headers: args.h,
      body: JSON.stringify({ name: '심야시도', phone: '01000000009', menu: '카페라떼 (6,000원)', qty: 1, pickup_date: args.date, pickup_time: '23:00', note: null, consent_at: new Date().toISOString() })
    });
    return res.status;
  }, { sb: SB, h: H, date });
  log('L9 영업시간 밖(23:00) 직접 API 시도 → 서버 check 거절', badTime >= 400, `HTTP ${badTime}`);

  // ── L10: 월요일 직접 시도 → check 거절 ──
  const nextMonday = (() => { const d = new Date(date + 'T00:00:00'); while (d.getDay() !== 1) d.setDate(d.getDate() + 1); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })(); // 로컬 기준 (toISOString은 UTC라 하루 밀림)
  const badDay = await page.evaluate(async (args) => {
    const res = await fetch(args.sb + '/rest/v1/reservations', {
      method: 'POST', headers: args.h,
      body: JSON.stringify({ name: '월요시도', phone: '01000000009', menu: '카페라떼 (6,000원)', qty: 1, pickup_date: args.monday, pickup_time: '09:00', note: null, consent_at: new Date().toISOString() })
    });
    return res.status;
  }, { sb: SB, h: H, monday: nextMonday });
  log('L10 월요일(' + nextMonday + ') 직접 API 시도 → 서버 check 거절', badDay >= 400, `HTTP ${badDay}`);

  // ── L11: RLS — 익명 키로 테이블 직접 SELECT → 빈 결과 (개인정보 차단) ──
  const sel = await fetch(SB + '/rest/v1/reservations?select=*', { headers: H });
  const selData = await sel.json().catch(() => null);
  log('L11 익명 키 직접 SELECT → 개인정보 노출 없음', Array.isArray(selData) && selData.length === 0, `HTTP ${sel.status}, rows ${Array.isArray(selData) ? selData.length : 'n/a'}`);

  // ── L12: slot_status는 개인정보 없이 잔 수만 반환 ──
  const ss = await rpc('slot_status', { p_date: date });
  const noPII = ss.ok && Array.isArray(ss.data) && ss.data.every((r) => Object.keys(r).sort().join(',') === 'cups,pickup_time');
  log('L12 slot_status 응답에 개인정보 필드 없음 (pickup_time·cups만)', noPII, JSON.stringify(ss.data));

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== 라이브 결과: ${passed}/${results.length} 통과 ===`);
  console.log('→ Table Editor에서 확인: 접수 4건(김테스트·이살펴·박마감·정다섯) + 취소 1건(최취소), 심야·월요일·4잔째는 없어야 정상');
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('라이브 테스트 오류:', e); process.exit(2); });
