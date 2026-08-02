// Day13 자동 점검 — 사장 관리 화면 (Supabase Auth + REST, 네트워크 목 기반)
// 사용: node tests/day13-check.js [관리자 페이지 URL]
const { chromium } = require('playwright-core');

const ADMIN = process.argv[2] || 'file:///Users/junghyun/Project/kaist/7월/day1/admin.html';
const SB = 'https://vffoydlxftzykupsqlnp.supabase.co';

const results = [];
function log(item, pass, detail) {
  results.push({ item, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${item}${detail ? ' :: ' + detail : ''}`);
}

// ── 목 상태 ──
const state = {
  loginMode: 'ok',        // 'ok' | 'bad'
  rows: [],               // GET 응답
  expireAccess: false,    // true면 GET/PATCH에 401 (refresh 전까지)
  calls: [],
};

const ROWS = [
  { id: 'r1', name: '김아침', phone: '01011112222', menu: '핸드드립 커피 (5,500원)', qty: 2, pickup_date: '2026-07-23', pickup_time: '08:20', note: '연하게', status: '접수' },
  { id: 'r2', name: '이출근', phone: '01033334444', menu: '카페라떼 (6,000원)', qty: 1, pickup_date: '2026-07-23', pickup_time: '08:40', note: null, status: '확정' },
  { id: 'r3', name: '박완료', phone: '01055556666', menu: '핸드드립 커피 (5,500원)', qty: 1, pickup_date: '2026-07-24', pickup_time: '09:00', note: null, status: '픽업완료' },
  { id: 'r4', name: '최취소', phone: '01077778888', menu: '카페라떼 (6,000원)', qty: 1, pickup_date: '2026-07-23', pickup_time: '09:10', note: null, status: '취소' },
];

async function installMocks(page) {
  await page.route(SB + '/**', async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();
    const headers = req.headers();
    const body = req.postData();

    if (url.includes('/auth/v1/token') && url.includes('grant_type=password')) {
      state.calls.push({ kind: 'login', body: JSON.parse(body) });
      if (state.loginMode === 'bad') {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error_description: 'Invalid login credentials' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'jwt_A', refresh_token: 'ref_A' }) });
    }
    if (url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token')) {
      state.calls.push({ kind: 'refresh', body: JSON.parse(body) });
      state.expireAccess = false; // 갱신 후엔 새 토큰 유효
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'jwt_B', refresh_token: 'ref_B' }) });
    }
    if (url.includes('/rest/v1/reservations')) {
      const auth = headers['authorization'] || '';
      if (state.expireAccess && auth === 'Bearer jwt_A') {
        state.calls.push({ kind: method.toLowerCase() + '_401' });
        return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'JWT expired' }) });
      }
      if (method === 'GET') {
        state.calls.push({ kind: 'get', auth });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.rows) });
      }
      if (method === 'PATCH') {
        state.calls.push({ kind: 'patch', url, body: JSON.parse(body), auth });
        return route.fulfill({ status: 204, body: '' });
      }
    }
    return route.fulfill({ status: 404, body: 'unmocked' });
  });
}

function callsOf(kind) { return state.calls.filter((c) => c.kind === kind); }

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  await installMocks(page);

  // ══ A1: 비로그인 → 로그인 화면, 목록·개인정보 없음 ══
  await page.goto(ADMIN);
  await page.waitForTimeout(400);
  const a1 = await page.evaluate(() => ({
    loginShown: !document.getElementById('loginView').hidden,
    adminHidden: document.getElementById('adminView').hidden,
    noData: !document.body.textContent.includes('김아침'),
  }));
  log('A1 비로그인 시 로그인 게이트 (목록 미노출)', a1.loginShown && a1.adminHidden && a1.noData, JSON.stringify(a1));

  // ══ A2: 잘못된 비밀번호 → 오류 표시 + 관리 화면 진입 불가 ══
  state.loginMode = 'bad';
  await page.fill('#loginEmail', 'boss@morningbrew.test');
  await page.fill('#loginPassword', 'wrong');
  await page.click('#loginBtn');
  await page.waitForTimeout(400);
  const a2 = await page.evaluate(() => ({
    err: document.getElementById('loginError').classList.contains('show'),
    adminHidden: document.getElementById('adminView').hidden,
  }));
  log('A2 잘못된 비밀번호 거절 + 오류 메시지', a2.err && a2.adminHidden, JSON.stringify(a2));

  // ══ A3: 로그인 성공 → JWT로 목록 조회 ══
  state.loginMode = 'ok';
  state.rows = ROWS;
  await page.fill('#loginPassword', 'correct');
  await page.click('#loginBtn');
  await page.waitForTimeout(600);
  const get1 = callsOf('get')[0];
  const a3 = await page.evaluate(() => ({
    adminShown: !document.getElementById('adminView').hidden,
    hasName: document.body.textContent.includes('김아침'),
    phoneFmt: document.body.textContent.includes('010-1111-2222'),
  }));
  log('A3 로그인 성공 → Bearer JWT 조회 + 목록 렌더 (전화 3-4-4)',
    get1 && get1.auth === 'Bearer jwt_A' && a3.adminShown && a3.hasName && a3.phoneFmt, JSON.stringify(a3));

  // ══ A4: 섹션 분리 — 진행(접수·확정) vs 완료(픽업완료·취소) + 날짜 탭 건수 ══
  const a4 = await page.evaluate(() => {
    const names = (el) => Array.from(el.querySelectorAll('.booking-info .name')).map((n) => n.textContent);
    return {
      active: names(document.getElementById('bookingList')),
      doneVisible: names(document.getElementById('doneList')),
      doneTabCount: document.querySelectorAll('#doneTabs .date-tab').length,
      activeTab: document.querySelector('#bookingTabs .date-tab.active') && document.querySelector('#bookingTabs .date-tab.active').textContent,
    };
  });
  // 완료 섹션: 7/23 탭(최취소) 기본 선택, 7/24 탭 클릭 시 박완료
  await page.click('#doneTabs .date-tab:nth-child(2)');
  await page.waitForTimeout(200);
  const doneSecond = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#doneList .booking-info .name')).map((n) => n.textContent));
  log('A4 진행/완료 분리 (취소→완료 쪽) + 날짜 탭 전환',
    a4.active.join(',') === '김아침,이출근' && a4.doneVisible.join(',') === '최취소' &&
    a4.doneTabCount === 2 && doneSecond.join(',') === '박완료' &&
    a4.activeTab && a4.activeTab.includes('2건'), JSON.stringify({ a4, doneSecond }));

  // ══ A5: 상태 변경 → PATCH (id 필터 + status·updated_at만) ══
  await page.selectOption('#bookingList .booking-card:first-child .status-select', '확정');
  await page.waitForTimeout(400);
  const patch = callsOf('patch')[0];
  const patchKeys = patch ? Object.keys(patch.body).sort().join(',') : '';
  log('A5 상태 변경 PATCH — id=eq.r1 + {status, updated_at}만 전송',
    patch && patch.url.includes('id=eq.r1') && patch.body.status === '확정' && patchKeys === 'status,updated_at',
    JSON.stringify({ url: patch && patch.url.split('?')[1], keys: patchKeys }));

  // ══ A6: 삭제 버튼 없음 (서버 정책상 DELETE 불가 — 의도) ══
  const delBtns = await page.evaluate(() => document.querySelectorAll('.btn-delete').length);
  log('A6 삭제 버튼 없음 (파기는 Table Editor)', delBtns === 0, `버튼 ${delBtns}개`);

  // ══ A7: 토큰 만료 → refresh → 재시도 성공 ══
  state.expireAccess = true;
  await page.click('#refreshBtn');
  await page.waitForTimeout(600);
  const a7ok = callsOf('refresh').length === 1 &&
    callsOf('get').some((c) => c.auth === 'Bearer jwt_B') &&
    await page.evaluate(() => !document.getElementById('adminView').hidden);
  log('A7 JWT 만료 시 자동 갱신 후 재시도', a7ok,
    `refresh ${callsOf('refresh').length}회, get_401 ${callsOf('get_401').length}회`);

  // ══ A8: 로그아웃 → 세션 제거 + 로그인 화면 ══
  await page.click('#logoutBtn');
  await page.waitForTimeout(300);
  const a8 = await page.evaluate(() => ({
    loginShown: !document.getElementById('loginView').hidden,
    session: sessionStorage.getItem('morningbrew.admin.session'),
  }));
  log('A8 로그아웃 → 세션 제거 + 게이트 복귀', a8.loginShown && a8.session === null, JSON.stringify(a8));

  // ══ A9: 375px 가로 스크롤 없음 + noindex ══
  const a9 = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    noindex: !!document.querySelector('meta[name="robots"][content*="noindex"]'),
  }));
  log('A9 375px 가로 스크롤 없음 + noindex', !a9.overflow && a9.noindex, JSON.stringify(a9));

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== 결과: ${passed}/${results.length} 통과 ===`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('테스트 실행 오류:', e); process.exit(2); });
