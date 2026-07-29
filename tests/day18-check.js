// Day18 자동 점검 — 버그 사냥 수정분 (엣지 케이스 3종 + 형식 검증, 목 기반)
// 사용: node tests/day18-check.js [랜딩 URL]
const { chromium } = require('playwright-core');

const CUSTOMER = process.argv[2] || 'file:///Users/junghyun/Project/kaist/index.html';
const SB = 'https://vffoydlxftzykupsqlnp.supabase.co';

const results = [];
function log(item, pass, detail) {
  results.push({ item, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${item}${detail ? ' :: ' + detail : ''}`);
}

const inserts = [];
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  page.on('dialog', (d) => d.accept());
  await page.route('https://cloud.umami.is/script.js', (r) => r.fulfill({ contentType: 'application/javascript', body: 'window.umami={track:function(){}}' }));
  await page.route(SB + '/**', (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    if (route.request().method() === 'POST' && url.includes('/rest/v1/')) {
      inserts.push({ table: url.split('/rest/v1/')[1].split('?')[0], body: JSON.parse(route.request().postData()) });
      return route.fulfill({ status: 201, body: '' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await page.goto(CUSTOMER);
  await page.waitForTimeout(500);

  // ══ E1: 길이 제한 속성 — 입력 필드 7종 ══
  const e1 = await page.evaluate(() => ({
    name: document.getElementById('name').maxLength,
    note: document.getElementById('note').maxLength,
    lookupName: document.getElementById('lookupName').maxLength,
    odName: document.getElementById('odName').maxLength,
    odEmail: document.getElementById('odEmail').maxLength,
    odAddress: document.getElementById('odAddress').maxLength,
    odNote: document.getElementById('odNote').maxLength,
  }));
  log('E1 길이 제한(maxlength) 7필드', e1.name === 20 && e1.note === 200 && e1.lookupName === 20 &&
    e1.odName === 20 && e1.odEmail === 60 && e1.odAddress === 80 && e1.odNote === 200, JSON.stringify(e1));

  // ══ E2: 이름 200자 입력 시도 → 20자로 잘림 ══
  await page.fill('#name', '김'.repeat(200));
  const e2 = await page.evaluate(() => document.getElementById('name').value.length);
  log('E2 이름 200자 → 20자 컷', e2 === 20, `${e2}자`);

  // ══ E3: 담기 11회 → 수량 10 상한 + 한국어 안내 ══
  const addBtn = (await page.$$('#productGrid .btn-add'))[0];
  for (let i = 0; i < 11; i++) await addBtn.click();
  const e3 = await page.evaluate(() => ({
    qty: document.querySelector('#cartArea .cqty').textContent,
    alert: document.getElementById('orderAlert').textContent,
    shown: document.getElementById('orderAlert').classList.contains('show'),
  }));
  log('E3 담기 11연타 → 상한 10 + 한국어 안내', e3.qty === '10' && e3.shown && e3.alert.includes('10개까지'), JSON.stringify(e3));

  // ══ E4: 장바구니 + 버튼으로도 초과 불가 ══
  await page.click('#cartArea .qplus');
  const e4 = await page.evaluate(() => document.querySelector('#cartArea .cqty').textContent);
  log('E4 +버튼으로도 10 초과 불가', e4 === '10', `${e4}개`);

  // ══ E5: 잘못된 이메일 → 한국어 안내 + 전송 없음 ══
  await page.fill('#odName', '이멜검증');
  await page.fill('#odPhone', '010-1111-0000');
  await page.fill('#odEmail', '이건이메일아님');
  inserts.length = 0;
  await page.click('#orderBtn');
  await page.waitForTimeout(300);
  const e5 = await page.evaluate(() => document.getElementById('orderAlert').textContent);
  log('E5 잘못된 이메일 차단 + 안내', e5.includes('이메일 형식') && inserts.length === 0, e5);

  // ══ E6: 이메일 비우면 정상 통과 (선택 필드) ══
  await page.fill('#odEmail', '');
  await page.click('#orderBtn');
  await page.waitForTimeout(400);
  const e6ok = inserts.length === 1 && inserts[0].body.email === null && JSON.parse(inserts[0].body.items)[0].qty === 10;
  log('E6 이메일 없이 정상 주문 (qty 10 그대로)', e6ok, JSON.stringify(inserts[0] && { email: inserts[0].body.email, total: inserts[0].body.total_price }));

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== 결과: ${passed}/${results.length} 통과 ===`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('테스트 실행 오류:', e); process.exit(2); });
