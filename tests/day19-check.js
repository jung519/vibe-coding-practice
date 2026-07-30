// Day19 자동 점검 — M2 메뉴 관리 (서버 로드·품절·토글, 목 기반)
// 사용: node tests/day19-check.js [랜딩 URL]
const { chromium } = require('playwright-core');

const CUSTOMER = process.argv[2] || 'file:///Users/junghyun/Project/kaist/index.html';
const ADMIN = CUSTOMER.replace(/[^/]*$/, 'admin.html');
const SB = 'https://vffoydlxftzykupsqlnp.supabase.co';

const results = [];
function log(item, pass, detail) {
  results.push({ item, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${item}${detail ? ' :: ' + detail : ''}`);
}

const MENUS = [
  { id: 'm1', category: 'pickup', title: '핸드드립 커피', description: null, emoji: '☕', price: 5500, soldout: false, sort_order: 1 },
  { id: 'm2', category: 'pickup', title: '수제 스콘', description: null, emoji: '🥐', price: 3500, soldout: true, sort_order: 2 },
  { id: 'm3', category: 'product', title: '에티오피아 예가체프 원두(200g)', description: '아침에 볶은 싱글 오리진', emoji: '☕', price: 18000, soldout: false, sort_order: 1 },
  { id: 'm4', category: 'product', title: '드립백 세트(10개입)', description: '사무실에서', emoji: '📦', price: 15000, soldout: true, sort_order: 2 },
];
const calls = [];
let menusMode = 'ok'; // 'ok' | 'fail'

async function installMocks(page) {
  await page.route('https://cloud.umami.is/script.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.umami={track:function(){}}' }));
  await page.route(SB + '/**', (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.includes('/auth/v1/token')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'jwt_A', refresh_token: 'ref_A' }) });
    if (url.includes('/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (url.includes('/rest/v1/menus')) {
      if (method === 'PATCH') {
        calls.push({ kind: 'patch_menu', url, body: JSON.parse(route.request().postData()) });
        const id = url.match(/id=eq\.([^&]+)/)[1];
        const m = MENUS.find((x) => x.id === id);
        if (m) m.soldout = JSON.parse(route.request().postData()).soldout;
        return route.fulfill({ status: 204, body: '' });
      }
      if (menusMode === 'fail') return route.fulfill({ status: 500, body: '{}' });
      let rows = MENUS;
      const cat = url.match(/category=eq\.([a-z]+)/);
      if (cat) rows = MENUS.filter((m) => m.category === cat[1]);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    }
    if (url.includes('/rest/v1/reservations') || url.includes('/rest/v1/orders')) {
      if (method === 'POST') { calls.push({ kind: 'insert', body: JSON.parse(route.request().postData()) }); return route.fulfill({ status: 201, body: '' }); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 404, body: 'unmocked' });
  });
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  page.on('dialog', (d) => d.accept());
  await installMocks(page);

  // ══ N1: 예약 폼 메뉴 — 서버 로드 + 품절 disabled ══
  await page.goto(CUSTOMER);
  await page.waitForTimeout(700);
  const n1 = await page.evaluate(() => {
    const opts = Array.from(document.querySelectorAll('#menu option'));
    return opts.map((o) => ({ v: o.value, t: o.textContent, d: o.disabled }));
  });
  log('N1 예약 메뉴 서버 로드 (2옵션) + 품절 disabled·표시',
    n1.length === 2 && n1[0].v === '핸드드립 커피 (5,500원)' && !n1[0].d &&
    n1[1].d && n1[1].t.includes('품절'), JSON.stringify(n1));

  // ══ N2: 상점 상품 — 서버 로드 + 품절 카드(담기 불가·배지) ══
  const n2 = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#productGrid .product-card'));
    return cards.map((c) => ({
      name: c.querySelector('.name').textContent,
      soldout: c.classList.contains('soldout'),
      btnDisabled: c.querySelector('.btn-add').disabled,
      btnText: c.querySelector('.btn-add').textContent,
    }));
  });
  log('N2 상점 서버 로드 (2상품) + 품절 담기 불가',
    n2.length === 2 && !n2[0].btnDisabled && n2[1].soldout && n2[1].btnDisabled &&
    n2[1].btnText === '품절' && n2[1].name.includes('품절'), JSON.stringify(n2));

  // ══ N3: 판매중 상품은 정상 담기·주문 (서버 id로) ══
  await page.click('#productGrid .product-card:first-child .btn-add');
  await page.fill('#odName', '메뉴검증');
  await page.fill('#odPhone', '010-0000-0027');
  calls.length = 0;
  await page.click('#orderBtn');
  await page.waitForTimeout(500);
  const ins = calls.find((c) => c.kind === 'insert');
  const n3items = ins ? JSON.parse(ins.body.items) : [];
  log('N3 판매중 상품 정상 주문 (서버 메뉴 기준)',
    ins && n3items[0].name === '에티오피아 예가체프 원두(200g)' && ins.body.total_price === 18000,
    JSON.stringify(n3items));

  // ══ N4: menus 서버 실패 → 폴백 (예약 4옵션 하드코딩 + 상품 3종) ══
  menusMode = 'fail';
  await page.goto(CUSTOMER);
  await page.waitForTimeout(700);
  const n4 = await page.evaluate(() => ({
    menuOpts: document.querySelectorAll('#menu option').length,
    products: document.querySelectorAll('#productGrid .product-card').length,
    anyDisabled: Array.from(document.querySelectorAll('#productGrid .btn-add')).some((b) => b.disabled),
  }));
  log('N4 서버 실패 시 폴백 (예약 4옵션·상품 3종·전부 판매중)',
    n4.menuOpts === 4 && n4.products === 3 && !n4.anyDisabled, JSON.stringify(n4));
  menusMode = 'ok';

  // ══ N5: 관리자 메뉴 탭 — 목록·그룹·토글 PATCH ══
  await page.goto(ADMIN);
  await page.fill('#loginEmail', 'boss@test.com');
  await page.fill('#loginPassword', 'pw');
  await page.click('#loginBtn');
  await page.waitForTimeout(700);
  await page.click('#tabBtnMenus');
  await page.waitForTimeout(300);
  const n5 = await page.evaluate(() => ({
    groups: Array.from(document.querySelectorAll('#menuList .menu-group-title')).map((g) => g.textContent),
    rows: document.querySelectorAll('#menuList .booking-card').length,
    firstBadge: document.querySelector('#menuList .status-badge').textContent,
  }));
  log('N5 관리자 메뉴 탭 — 그룹 2종 + 4행', n5.groups.length === 2 && n5.rows === 4 && n5.firstBadge === '판매중', JSON.stringify(n5));

  // ══ N6: 품절 토글 → PATCH {soldout}만 + 재로드 반영 ══
  calls.length = 0;
  await page.click('#menuList .booking-card .btn-toggle'); // 첫 매치 (그룹 제목이 first-child라 :first-child 불가)
  await page.waitForTimeout(500);
  const patch = calls.find((c) => c.kind === 'patch_menu');
  const n6badge = await page.evaluate(() => document.querySelector('#menuList .status-badge').textContent);
  log('N6 품절 토글 PATCH — id=eq.m1 + {soldout:true}만 + 화면 반영',
    patch && patch.url.includes('id=eq.m1') && patch.body.soldout === true &&
    Object.keys(patch.body).join(',') === 'soldout' && n6badge === '품절',
    JSON.stringify({ body: patch && patch.body, badge: n6badge }));

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== 결과: ${passed}/${results.length} 통과 ===`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('테스트 실행 오류:', e); process.exit(2); });
