// Day17 자동 점검 — 미니 쇼핑몰 주문 흐름 (목 기반)
// 사용: node tests/day17-check.js [랜딩 URL]
const { chromium } = require('playwright-core');

const CUSTOMER = process.argv[2] || 'file:///Users/junghyun/Project/kaist/index.html';
const SB = 'https://vffoydlxftzykupsqlnp.supabase.co';

const results = [];
function log(item, pass, detail) {
  results.push({ item, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${item}${detail ? ' :: ' + detail : ''}`);
}

const state = { insertMode: 'ok', orders: [], calls: [] };

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  page.on('dialog', (d) => d.accept());
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.route('https://cloud.umami.is/script.js', (route) =>
    route.fulfill({ contentType: 'application/javascript',
      body: 'window.__tracked=[];window.umami={track:function(n,d){window.__tracked.push({n:n,d:d||null});}};' }));
  await page.route(SB + '/**', (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/rpc/slot_status')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (url.includes('/rest/v1/orders')) {
      if (method === 'POST') {
        state.calls.push({ kind: 'insert', body: JSON.parse(route.request().postData()) });
        if (state.insertMode === 'fail') return route.fulfill({ status: 500, body: '{"message":"boom"}' });
        return route.fulfill({ status: 201, body: '' });
      }
      state.calls.push({ kind: 'select' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.orders) });
    }
    return route.fulfill({ status: 404, body: 'unmocked' });
  });

  await page.goto(CUSTOMER);
  await page.waitForTimeout(600);

  // ══ S1 (B-17-01): 상품 카드 3개 + 빈 장바구니 안내 ══
  const s1 = await page.evaluate(() => ({
    cards: document.querySelectorAll('#productGrid .product-card').length,
    names: Array.from(document.querySelectorAll('#productGrid .name')).map((n) => n.textContent),
    empty: document.querySelector('#cartArea .cart-empty') && document.querySelector('#cartArea .cart-empty').textContent,
  }));
  log('S1 상품 3개 카드 + 빈 장바구니 안내', s1.cards === 3 && s1.empty.includes('담아주세요'), JSON.stringify(s1.names));

  // ══ S2 (B-17-01): 담기 → 수량 +/- → 삭제 → 합계 정확 ══
  const addBtns = await page.$$('#productGrid .btn-add');
  await addBtns[0].click();           // 원두 18000
  await addBtns[0].click();           // 원두 ×2
  await addBtns[1].click();           // 스콘 12000
  await addBtns[2].click();           // 드립백 15000
  let total = await page.textContent('#cartTotal');
  const t1 = total === '63,000원';    // 36000+12000+15000
  await page.click('#cartArea .cart-row:nth-child(1) .qminus'); // 원두 ×1 → 45,000
  total = await page.textContent('#cartTotal');
  const t2 = total === '45,000원';
  await page.click('#cartArea .cart-row:nth-child(3) .cdel');   // 드립백 삭제 → 30,000
  total = await page.textContent('#cartTotal');
  const t3 = total === '30,000원';
  log('S2 담기·수량 변경·삭제·합계 계산', t1 && t2 && t3, `63000:${t1} 45000:${t2} 30000:${t3}`);

  // ══ S3 (B-17-04): 빈 장바구니 주문 → 한국어 안내 + 전송 없음 ══
  await page.evaluate(() => { // 장바구니 비우기 (남은 2줄 삭제)
    document.querySelectorAll('#cartArea .cdel').forEach((b) => b.click());
  });
  await page.click('#orderBtn');
  await page.waitForTimeout(300);
  const s3 = await page.evaluate(() => ({
    alert: document.getElementById('orderAlert').textContent,
    shown: document.getElementById('orderAlert').classList.contains('show'),
  }));
  log('S3 빈 장바구니 → "상품을 1개 이상 담아주세요" + 전송 없음',
    s3.shown && s3.alert.includes('1개 이상') && state.calls.filter((c) => c.kind === 'insert').length === 0, s3.alert);

  // ══ S4 (B-17-04): 필수값 누락 → 한국어 안내 ══
  await (await page.$$('#productGrid .btn-add'))[0].click();
  await page.click('#orderBtn');
  await page.waitForTimeout(300);
  const s4 = await page.evaluate(() => document.getElementById('orderAlert').textContent);
  log('S4 이름·연락처 누락 → 한국어 안내', s4.includes('이름과 연락처를 입력해주세요'), s4);

  // ══ S5 (B-17-01·02): 정상 주문 → INSERT 바디·성공 안내·비우기·목록 갱신 ══
  state.orders = [{ customer_name: '김주문', items: JSON.stringify([{ name: '에티오피아 예가체프 원두(200g)', qty: 1, price: 18000 }]), total_price: 18000, status: '접수', created_at: '2026-07-28T10:00:00+09:00' }];
  await page.fill('#odName', '김주문');
  await page.fill('#odPhone', '010-0000-0017');
  await page.fill('#odNote', '굵게 갈아주세요');
  const selBefore = state.calls.filter((c) => c.kind === 'select').length;
  await page.click('#orderBtn');
  await page.waitForTimeout(600);
  const ins = state.calls.find((c) => c.kind === 'insert');
  const items = ins ? JSON.parse(ins.body.items) : [];
  const s5 = await page.evaluate(() => ({
    success: document.getElementById('orderSuccess').textContent,
    cartEmpty: !!document.querySelector('#cartArea .cart-empty'),
    recent: document.querySelectorAll('#recentOrders .order-item').length,
    tracked: window.__tracked.filter((t) => t.n === 'order_complete').length,
  }));
  const s5ok = ins && ins.body.customer_name === '김주문' && ins.body.phone === '01000000017' &&
    ins.body.total_price === 18000 && ins.body.status === '접수' && ins.body.note === '굵게 갈아주세요' &&
    ins.body.email === null && items.length === 1 && items[0].qty === 1 &&
    s5.success.includes('접수되었습니다') && s5.cartEmpty && s5.recent === 1 &&
    state.calls.filter((c) => c.kind === 'select').length > selBefore && s5.tracked === 1;
  log('S5 정상 주문 → INSERT 바디·접수 안내·비우기·목록 갱신·측정', !!s5ok,
    JSON.stringify({ body: ins && { n: ins.body.customer_name, p: ins.body.phone, t: ins.body.total_price }, ui: s5 }));

  // ══ S6 (B-17-02): 목록에 개인정보 미표시 (이름·상품·총액·상태만) ══
  const s6 = await page.evaluate(() => document.getElementById('recentOrders').textContent);
  log('S6 최근 주문에 전화·이메일·주소 미표시', s6.includes('김주문') && s6.includes('18,000원') && !s6.includes('0100000') && !s6.includes('@'), s6.trim().slice(0, 60));

  // ══ S7 (B-17-04): 저장 실패 → 한국어 실패 안내 + console.error 유지 ══
  state.insertMode = 'fail';
  await (await page.$$('#productGrid .btn-add'))[1].click();
  await page.fill('#odName', '실패도전');
  await page.fill('#odPhone', '010-0000-0018');
  consoleErrors.length = 0;
  await page.click('#orderBtn');
  await page.waitForTimeout(600);
  const s7 = await page.evaluate(() => document.getElementById('orderAlert').textContent);
  log('S7 저장 실패 → 한국어 안내(무슨 일+어떻게) + console.error',
    s7.includes('실패했어요') && s7.includes('다시 시도') && consoleErrors.length >= 1, s7);
  state.insertMode = 'ok';

  // ══ S8: 375px 가로 스크롤 없음 + 기존 예약 폼 공존 ══
  const s8 = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    reserveForm: !!document.getElementById('bookingForm'),
    shopSection: !!document.getElementById('shop'),
  }));
  log('S8 375px + 예약·상점 공존', !s8.overflow && s8.reserveForm && s8.shopSection, JSON.stringify(s8));

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== 결과: ${passed}/${results.length} 통과 ===`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('테스트 실행 오류:', e); process.exit(2); });
