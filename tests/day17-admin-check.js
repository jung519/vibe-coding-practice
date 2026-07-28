// Day17 추가 점검 — 관리자 화면 주문 섹션 (목 기반)
// 사용: node tests/day17-admin-check.js [관리자 URL]
const { chromium } = require('playwright-core');

const ADMIN = process.argv[2] || 'file:///Users/junghyun/Project/kaist/admin.html';
const SB = 'https://vffoydlxftzykupsqlnp.supabase.co';

const results = [];
function log(item, pass, detail) {
  results.push({ item, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${item}${detail ? ' :: ' + detail : ''}`);
}

const calls = [];
const ORDERS = [
  { id: 1, customer_name: '김주문', phone: '01011112222', email: 'kim@test.com', address: '서울 마포구 망원로 1',
    note: '굵게', items: JSON.stringify([{ name: '에티오피아 예가체프 원두(200g)', qty: 2, price: 18000 }, { name: '수제 버터 스콘 4개입', qty: 1, price: 12000 }]),
    total_price: 48000, status: '접수', created_at: '2026-07-28T10:30:00+09:00' },
  { id: 2, customer_name: '이완료', phone: '01033334444', email: null, address: null,
    note: null, items: JSON.stringify([{ name: '드립백 세트(10개입)', qty: 1, price: 15000 }]),
    total_price: 15000, status: '완료', created_at: '2026-07-27T15:00:00+09:00' },
];

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  page.on('dialog', (d) => d.accept());

  await page.route(SB + '/**', (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/auth/v1/token')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'jwt_A', refresh_token: 'ref_A' }) });
    }
    if (url.includes('/rest/v1/reservations')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    if (url.includes('/rest/v1/orders')) {
      const auth = route.request().headers()['authorization'] || '';
      if (method === 'GET') {
        calls.push({ kind: 'get_orders', auth });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ORDERS) });
      }
      if (method === 'PATCH') {
        calls.push({ kind: 'patch_order', url, body: JSON.parse(route.request().postData()), auth });
        return route.fulfill({ status: 204, body: '' });
      }
    }
    return route.fulfill({ status: 404, body: 'unmocked' });
  });

  await page.goto(ADMIN);
  await page.fill('#loginEmail', 'boss@test.com');
  await page.fill('#loginPassword', 'pw');
  await page.click('#loginBtn');
  await page.waitForTimeout(700);

  // ══ D1: 주문 섹션 렌더 — JWT 조회 + 사장에겐 전체 정보 표시 ══
  const d1 = await page.evaluate(() => {
    const cards = document.querySelectorAll('#orderList .booking-card');
    const first = cards[0];
    return {
      count: cards.length,
      text: first ? first.textContent : '',
    };
  });
  const g = calls.find((c) => c.kind === 'get_orders');
  log('D1 주문 목록 렌더 (JWT + 주문자·상품·총액·연락처·주소·요청)',
    g && g.auth === 'Bearer jwt_A' && d1.count === 2 &&
    d1.text.includes('김주문') && d1.text.includes('원두') && d1.text.includes('48,000원') &&
    d1.text.includes('010-1111-2222') && d1.text.includes('kim@test.com') && d1.text.includes('망원로') && d1.text.includes('굵게'),
    d1.text.replace(/\s+/g, ' ').slice(0, 90));

  // ══ D2: 상태 배지 + 셀렉트 옵션 (접수/확인/완료/취소) ══
  const d2 = await page.evaluate(() => ({
    badge: document.querySelector('#orderList .status-badge').textContent,
    opts: Array.from(document.querySelector('#orderList .status-select').options).map((o) => o.value),
  }));
  log('D2 상태 배지·옵션 4단계', d2.badge === '접수' && d2.opts.join(',') === '접수,확인,완료,취소', JSON.stringify(d2));

  // ══ D3: 상태 변경 → PATCH id=eq.1 + {status}만 ══
  await page.selectOption('#orderList .booking-card:first-child .status-select', '확인');
  await page.waitForTimeout(500);
  const p = calls.find((c) => c.kind === 'patch_order');
  log('D3 상태 변경 PATCH — id=eq.1 + {status}만 전송',
    p && p.url.includes('id=eq.1') && p.body.status === '확인' && Object.keys(p.body).join(',') === 'status',
    JSON.stringify({ url: p && p.url.split('?')[1], body: p && p.body }));

  // ══ D4: 375px 가로 스크롤 없음 ══
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  log('D4 375px 가로 스크롤 없음', !overflow);

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== 결과: ${passed}/${results.length} 통과 ===`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('테스트 실행 오류:', e); process.exit(2); });
