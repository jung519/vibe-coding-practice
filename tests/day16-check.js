// Day16 자동 점검 — M1 운영 완결 중 클라이언트 조각(완료 화면 확인 유도), 목 기반
// 사용: node tests/day16-check.js [랜딩 URL]
const { chromium } = require('playwright-core');

const CUSTOMER = process.argv[2] || 'file:///Users/junghyun/Project/kaist/index.html';
const SB = 'https://vffoydlxftzykupsqlnp.supabase.co';

const results = [];
function log(item, pass, detail) {
  results.push({ item, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${item}${detail ? ' :: ' + detail : ''}`);
}

const calls = [];
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  page.on('dialog', (d) => d.accept());

  await page.route('https://cloud.umami.is/script.js', (route) =>
    route.fulfill({ contentType: 'application/javascript',
      body: 'window.__tracked=[];window.umami={track:function(n,d){window.__tracked.push({n:n,d:d||null});}};' }));
  await page.route(SB + '/**', (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/slot_status')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (url.includes('/rpc/my_reservations')) {
      calls.push({ kind: 'my_reservations', body: JSON.parse(route.request().postData()) });
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify([{ id: 'x1', menu: '핸드드립 커피 (5,500원)', qty: 1, pickup_date: '2026-07-28', pickup_time: '08:30', note: null, status: '접수' }]) });
    }
    if (url.includes('/rest/v1/reservations')) return route.fulfill({ status: 201, body: '' });
    return route.fulfill({ status: 404, body: 'unmocked' });
  });

  await page.goto(CUSTOMER);
  await page.waitForTimeout(600);

  // ══ M1: 접수 성공 → 완료 박스에 '내 예약 확인하기' 버튼 ══
  await page.fill('#name', '유도야');
  await page.fill('#phone', '010-0000-0011');
  await page.check('#consent');
  await page.click('#submitBtn');
  await page.waitForSelector('.success-box.show', { timeout: 5000 });
  const m1 = await page.evaluate(() => {
    const btn = document.querySelector('.success-box .success-lookup-btn');
    return { exists: !!btn, text: btn && btn.textContent };
  });
  log('M1 접수 완료 박스에 확인 유도 버튼', m1.exists && m1.text.includes('내 예약 확인'), JSON.stringify(m1));

  // ══ M2: 버튼 클릭 → 패널 열림 + 방금 정보 프리필 + 자동 조회 + 측정 ══
  await page.click('.success-box .success-lookup-btn');
  await page.waitForTimeout(500);
  const m2 = await page.evaluate(() => ({
    panelOpen: !document.getElementById('lookupPanel').hidden,
    name: document.getElementById('lookupName').value,
    phone: document.getElementById('lookupPhone').value,
    cards: document.querySelectorAll('#lookupResults .booking-card').length,
    tracked: window.__tracked.filter((t) => t.n === 'lookup_used').length,
  }));
  const rpcBody = calls.find((c) => c.kind === 'my_reservations');
  log('M2 클릭 → 패널+프리필(3-4-4)+자동 조회(RPC 숫자만)+lookup_used',
    m2.panelOpen && m2.name === '유도야' && m2.phone === '010-0000-0011' &&
    m2.cards === 1 && m2.tracked === 1 &&
    rpcBody && rpcBody.body.p_phone === '01000000011',
    JSON.stringify({ m2, rpc: rpcBody && rpcBody.body }));

  // ══ M3: 375px 가로 스크롤 없음 (버튼 추가 후) ══
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  log('M3 375px 가로 스크롤 없음', !overflow);

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== 결과: ${passed}/${results.length} 통과 ===`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('테스트 실행 오류:', e); process.exit(2); });
