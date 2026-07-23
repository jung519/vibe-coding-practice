// Day14 자동 점검 — Umami 측정 (스크립트 태그 + 전환 이벤트 발화, 목 기반)
// 사용: node tests/day14-check.js [랜딩 URL]
const { chromium } = require('playwright-core');

const CUSTOMER = process.argv[2] || 'file:///Users/junghyun/Project/kaist/index.html';
const SB = 'https://vffoydlxftzykupsqlnp.supabase.co';
const WEBSITE_ID = 'c6b31cfe-8ecb-498b-9ca4-0fc34bc433c4';

const results = [];
function log(item, pass, detail) {
  results.push({ item, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${item}${detail ? ' :: ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  page.on('dialog', (d) => d.accept());

  // Umami 스크립트를 스텁으로 대체 — track 호출을 기록
  await page.route('https://cloud.umami.is/script.js', (route) =>
    route.fulfill({ contentType: 'application/javascript',
      body: 'window.__tracked=[];window.umami={track:function(n,d){window.__tracked.push({n:n,d:d||null});}};' }));
  // Supabase 목 (접수 성공·조회)
  await page.route(SB + '/**', (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/slot_status')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (url.includes('/rpc/my_reservations')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (url.includes('/rest/v1/reservations')) return route.fulfill({ status: 201, body: '' });
    return route.fulfill({ status: 404, body: 'unmocked' });
  });

  await page.goto(CUSTOMER);
  await page.waitForTimeout(600);

  // ══ U1: 추적 스크립트 태그 (defer + website-id) ══
  const u1 = await page.evaluate(() => {
    const s = document.querySelector('script[src*="cloud.umami.is/script.js"]');
    return { exists: !!s, id: s && s.getAttribute('data-website-id'), defer: s && s.defer };
  });
  log('U1 Umami 스크립트 태그 (defer + website-id)', u1.exists && u1.id === WEBSITE_ID && u1.defer, JSON.stringify(u1));

  // ══ U2: 예약 완료 → reservation_complete 이벤트 (개인정보 없음) ══
  await page.fill('#name', '김측정');
  await page.fill('#phone', '01000000010');
  await page.check('#consent');
  await page.click('#submitBtn');
  await page.waitForSelector('.success-box.show', { timeout: 5000 });
  await page.waitForTimeout(300);
  const u2 = await page.evaluate(() => window.__tracked);
  const ev = (u2 || []).find((t) => t.n === 'reservation_complete');
  const noPII = ev && !JSON.stringify(ev.d).includes('김측정') && !JSON.stringify(ev.d).includes('01000000010');
  log('U2 예약 완료 시 reservation_complete (메뉴·수량만, 이름·전화 없음)',
    !!ev && noPII && ev.d && typeof ev.d.qty === 'number', JSON.stringify(ev));

  // ══ U3: 내 예약 확인 → lookup_used 이벤트 ══
  await page.click('#lookupToggle');
  await page.fill('#lookupName', '김측정');
  await page.fill('#lookupPhone', '01000000010');
  await page.click('#lookupRun');
  await page.waitForTimeout(400);
  const u3 = await page.evaluate(() => window.__tracked.filter((t) => t.n === 'lookup_used').length);
  log('U3 내 예약 확인 시 lookup_used', u3 === 1, `${u3}회`);

  // ══ U4: 실패 제출(검증 차단)에는 전환 이벤트 없음 ══
  const before = await page.evaluate(() => window.__tracked.filter((t) => t.n === 'reservation_complete').length);
  await page.fill('#name', '');
  await page.click('#submitBtn');
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__tracked.filter((t) => t.n === 'reservation_complete').length);
  log('U4 검증 실패 제출은 전환으로 안 셈', before === after, `${before}→${after}`);

  // ══ U5: 관리자 페이지에는 추적 스크립트 없음 (사장 방문 = 노이즈 제외) ══
  await page.goto(CUSTOMER.replace(/[^/]*$/, 'admin.html'));
  await page.waitForTimeout(300);
  const u5 = await page.evaluate(() => !!document.querySelector('script[src*="umami"]'));
  log('U5 관리자 화면 미추적 (지표 노이즈 방지)', !u5);

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== 결과: ${passed}/${results.length} 통과 ===`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('테스트 실행 오류:', e); process.exit(2); });
