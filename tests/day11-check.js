// Day11 자동 점검 — Supabase 서버 연동 (네트워크 목 기반: 결정적 검증)
// 사용: node tests/day11-check.js [고객페이지 URL]
// 실서버 대신 라우트 목으로 응답을 고정 — 요청 바디·RPC 호출·UI 반영을 검사한다.
// (실서버 검증은 별도 라이브 테스트 5건으로 수행)
const { chromium } = require('playwright-core');

const CUSTOMER = process.argv[2] || 'file:///Users/junghyun/Project/kaist/day1/index.html';
const ADMIN = CUSTOMER.replace(/[^/]*$/, 'admin.html');
const SB = 'https://vffoydlxftzykupsqlnp.supabase.co';

const results = [];
function log(item, pass, detail) {
  results.push({ item, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${item}${detail ? ' :: ' + detail : ''}`);
}

// ── 목 상태 (테스트 중 시나리오별로 바꾼다) ──
const state = {
  slotRows: [],          // slot_status 응답
  myRows: [],            // my_reservations 응답
  cancelResult: true,    // cancel_reservation 응답
  insertMode: 'ok',      // 'ok' | 'slot_full'
  calls: [],             // {kind, body} 기록
};

async function installMocks(page) {
  await page.route(SB + '/**', async (route) => {
    const url = route.request().url();
    const body = route.request().postData();
    const parsed = body ? JSON.parse(body) : null;

    if (url.includes('/rpc/slot_status')) {
      state.calls.push({ kind: 'slot_status', body: parsed });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.slotRows) });
    }
    if (url.includes('/rpc/my_reservations')) {
      state.calls.push({ kind: 'my_reservations', body: parsed });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.myRows) });
    }
    if (url.includes('/rpc/cancel_reservation')) {
      state.calls.push({ kind: 'cancel_reservation', body: parsed });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.cancelResult) });
    }
    if (url.includes('/rest/v1/reservations')) {
      state.calls.push({ kind: 'insert', body: parsed });
      if (state.insertMode === 'slot_full') {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'SLOT_FULL' }) });
      }
      return route.fulfill({ status: 201, body: '' });
    }
    return route.fulfill({ status: 404, body: 'unmocked' });
  });
}

function callsOf(kind) { return state.calls.filter((c) => c.kind === kind); }

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });

  const dialogs = [];
  let dialogAccept = true;
  page.on('dialog', async (d) => { dialogs.push(d.message()); await (dialogAccept ? d.accept() : d.dismiss()); });

  await installMocks(page);

  // ══ S1: 로드 시 slot_status 호출 (선택 날짜 기준) ══
  state.slotRows = [{ pickup_time: '08:20', cups: 3 }, { pickup_time: '08:30', cups: 2 }];
  await page.goto(CUSTOMER);
  await page.waitForTimeout(600);
  const s1 = callsOf('slot_status');
  const selDate = await page.inputValue('#pickupDate');
  log('S1 로드 시 slot_status RPC 호출 + 선택 날짜 전달', s1.length >= 1 && s1[0].body.p_date === selDate,
    `호출 ${s1.length}회, p_date=${s1[0] && s1[0].body.p_date}, 선택=${selDate}`);

  // ══ S2: 서버 현황이 UI에 반영 — 3잔=마감 disabled, 2잔=(2/3) ══
  await page.selectOption('#timeHour', '08');
  await page.waitForTimeout(200);
  const optInfo = await page.evaluate(() => {
    const opts = Array.from(document.querySelectorAll('#timeMin option'));
    const o20 = opts.find((o) => o.value === '20');
    const o30 = opts.find((o) => o.value === '30');
    return { d20: o20.disabled, t20: o20.textContent, d30: o30.disabled, t30: o30.textContent };
  });
  log('S2 서버 슬롯 현황 반영 (3잔→마감 disabled, 2잔→(2/3))',
    optInfo.d20 && optInfo.t20.includes('마감') && !optInfo.d30 && optInfo.t30.includes('2/3'),
    JSON.stringify(optInfo));

  // ══ S3: 전화 9자리 → 클라이언트 검증 차단 (서버 규칙 10~11자리 정렬) ══
  await page.fill('#name', '김테스트');
  await page.fill('#phone', '010123456'); // 9자리
  await page.check('#consent');
  await page.click('#submitBtn');
  await page.waitForTimeout(300);
  const phoneErr = await page.evaluate(() => {
    const el = document.getElementById('phoneError');
    return { shown: el.classList.contains('show'), text: el.textContent };
  });
  log('S3 전화 9자리 차단 + 10~11자리 안내 + 서버 전송 없음',
    phoneErr.shown && phoneErr.text.includes('10~11') && callsOf('insert').length === 0,
    `${phoneErr.text} / insert ${callsOf('insert').length}회`);

  // ══ S4: 정상 제출 → INSERT 바디 매핑 검사 ══
  await page.fill('#phone', '01012345678');
  await page.selectOption('#timeMin', '30');
  await page.fill('#note', '');
  await page.click('#qtyPlus'); // qty 2
  await page.click('#submitBtn'); // confirm 자동 수락
  await page.waitForSelector('.success-box.show', { timeout: 4000 });
  const ins = callsOf('insert')[0];
  const b = ins ? ins.body : {};
  const s4ok = ins && b.name === '김테스트' && b.phone === '01012345678' && b.qty === 2 &&
    b.pickup_date === selDate && /^[0-9]{2}:[0-9]{2}$/.test(b.pickup_time) &&
    b.note === null && typeof b.consent_at === 'string' && b.consent_at.length > 18 &&
    b.id === undefined && b.status === undefined && b.time === undefined && b.pickupDate === undefined;
  log('S4 INSERT 바디 매핑 (숫자만 전화·pickup_date·pickup_time·note null·consent_at·클라 필드 없음)',
    !!s4ok, JSON.stringify(b));

  // ══ S5: 제출 후 slot_status 재호출 (현황 갱신) ══
  const slotCallsAfter = callsOf('slot_status').length;
  log('S5 접수 성공 후 슬롯 현황 재조회', slotCallsAfter >= 2, `slot_status 총 ${slotCallsAfter}회`);

  // ══ S6: 서버 SLOT_FULL 거절 → 마감 안내 + 현황 재조회 ══
  state.insertMode = 'slot_full';
  dialogs.length = 0;
  await page.fill('#name', '박동시');
  await page.fill('#phone', '01099998888');
  await page.check('#consent');
  await page.click('#submitBtn');
  await page.waitForTimeout(800);
  const fullAlert = dialogs.find((m) => m.includes('가득') || m.includes('마감'));
  log('S6 서버 SLOT_FULL 거절 시 마감 안내 + 재조회',
    !!fullAlert && callsOf('slot_status').length > slotCallsAfter,
    (fullAlert || '알림 없음').split('\n')[0]);
  state.insertMode = 'ok';

  // ══ S7: 내 예약 확인 — my_reservations RPC + 본인 카드 렌더 ══
  state.myRows = [
    { id: 'aaaaaaaa-0000-0000-0000-000000000001', menu: '핸드드립 오늘의 커피 — 4,500원', qty: 2, pickup_date: selDate, pickup_time: '08:30', note: null, status: '접수' },
    { id: 'aaaaaaaa-0000-0000-0000-000000000002', menu: '카페라떼 — 5,000원', qty: 1, pickup_date: selDate, pickup_time: '09:00', note: '연하게', status: '확정' },
  ];
  await page.click('#lookupToggle');
  await page.fill('#lookupName', '김테스트');
  await page.fill('#lookupPhone', '01012345678');
  await page.click('#lookupRun');
  await page.waitForTimeout(500);
  const lk = callsOf('my_reservations')[0];
  const cards = await page.evaluate(() => {
    const cs = Array.from(document.querySelectorAll('#lookupResults .booking-card'));
    return cs.map((c) => ({
      badge: c.querySelector('.status-badge').textContent,
      hasCancel: !!c.querySelector('.btn-cancel-booking'),
    }));
  });
  log('S7 내 예약 확인: RPC 바디(이름+숫자전화) + 카드 2건 + 접수만 취소 버튼',
    lk && lk.body.p_name === '김테스트' && lk.body.p_phone === '01012345678' &&
    cards.length === 2 && cards[0].badge === '접수' && cards[0].hasCancel &&
    cards[1].badge === '확정' && !cards[1].hasCancel,
    JSON.stringify({ body: lk && lk.body, cards }));

  // ══ S8: 고객 취소 → cancel_reservation RPC (id+본인) → 재조회 ══
  state.myRows = [{ ...state.myRows[0], status: '취소' }, state.myRows[1]];
  dialogs.length = 0;
  await page.click('#lookupResults .btn-cancel-booking');
  await page.waitForTimeout(600);
  const cc = callsOf('cancel_reservation')[0];
  const badgeAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#lookupResults .status-badge')).map((b) => b.textContent));
  log('S8 취소가 서버 RPC로 전달 (p_id+p_name+p_phone) + 목록 갱신',
    cc && cc.body.p_id === 'aaaaaaaa-0000-0000-0000-000000000001' &&
    cc.body.p_name === '김테스트' && cc.body.p_phone === '01012345678' &&
    badgeAfter.includes('취소'),
    JSON.stringify({ body: cc && cc.body, badgeAfter }));

  // ══ S9: 취소 불가(false) 응답 → 전화 안내 ══
  state.myRows = [{ id: 'aaaaaaaa-0000-0000-0000-000000000003', menu: '카페라떼 — 5,000원', qty: 1, pickup_date: selDate, pickup_time: '09:30', note: null, status: '접수' }];
  state.cancelResult = false;
  await page.click('#lookupRun');
  await page.waitForTimeout(400);
  dialogs.length = 0;
  await page.click('#lookupResults .btn-cancel-booking');
  await page.waitForTimeout(500);
  const denyAlert = dialogs.find((m) => m.includes('전화') || m.includes('확정'));
  log('S9 서버가 취소 거부(false) 시 전화 문의 안내', !!denyAlert, (denyAlert || '알림 없음').split('\n')[0]);
  state.cancelResult = true;

  // ══ S10: 월요일 제외 + 375px 가로 스크롤 없음 ══
  const dateChecks = await page.evaluate(() => {
    const opts = Array.from(document.querySelectorAll('#pickupDate option'));
    const hasMonday = opts.some((o) => { const d = new Date(o.value + 'T00:00:00'); return d.getDay() === 1; });
    return { hasMonday, count: opts.length, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
  log('S10 월요일 옵션 제외 + 375px 가로 스크롤 없음',
    !dateChecks.hasMonday && dateChecks.count > 0 && !dateChecks.overflow, JSON.stringify(dateChecks));

  // ══ A1: 관리자 페이지 — 서버 이관 안내 배너 ══
  await page.goto(ADMIN);
  await page.waitForTimeout(300);
  const bannerText = await page.evaluate(() => document.body.textContent);
  log('A1 관리자 화면에 Supabase Table Editor 안내 배너',
    bannerText.includes('Supabase') && bannerText.includes('Table Editor'));

  await browser.close();

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== 결과: ${passed}/${results.length} 통과 ===`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('테스트 실행 오류:', e); process.exit(2); });
