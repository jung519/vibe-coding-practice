// Day4 자동 점검 — B-04-O1 (localStorage 영속화 + CRUD), 375px 모바일 뷰포트
const { chromium } = require('playwright-core');

// 대상: 기본은 로컬 통합 페이지. 인자로 URL을 주면 그 주소(예: 배포 URL)를 검사한다.
const PAGE = process.argv[2] || 'file:///Users/junghyun/Project/kaist/day1/index.html';
const KEY = 'morningbrew.bookings';

const results = [];
function log(item, pass, detail) {
  results.push({ item, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${item}${detail ? ' :: ' + detail : ''}`);
}

async function getStore(page) {
  return page.evaluate((k) => {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  }, KEY);
}

async function addBooking(page, name, phone, opts) {
  opts = opts || {};
  await page.fill('#name', name);
  await page.fill('#phone', phone);
  await page.check('#consent');
  if (opts.hour) await page.selectOption('#timeHour', opts.hour);
  if (opts.min) await page.selectOption('#timeMin', opts.min);
  for (let i = 1; i < (opts.qty || 1); i++) await page.click('#qtyPlus');
  const before = await page.locator('.booking-card').count();
  await page.click('#submitBtn');
  if (!opts.expectBlocked) {
    await page.waitForFunction(
      (n) => document.querySelectorAll('.booking-card').length === n,
      before + 1, { timeout: 4000 }
    );
  } else {
    await page.waitForTimeout(400);
  }
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();

  const dialogs = [];
  page.on('dialog', async (d) => {
    dialogs.push({ type: d.type(), msg: d.message().split('\n')[0] });
    await d.accept();
  });

  await page.goto(PAGE);
  // 시작 전 저장소 비우기 (반복 실행 대비)
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload();

  // 1. 빈 상태
  log('빈 상태: 첫 로드 안내 문구', await page.locator('.empty-state').isVisible());

  // 2. 날짜 옵션: 월요일 휴무 제외
  const dateLabels = await page.locator('#pickupDate option').allInnerTexts();
  const hasMonday = dateLabels.some((t) => t.includes('(월)'));
  log('픽업 날짜: 월요일(휴무) 옵션 제외', !hasMonday && dateLabels.length >= 6, `옵션=[${dateLabels.join(' | ')}]`);

  // 3. [C] 생성 → 카드 + 완료 피드백
  dialogs.length = 0;
  await addBooking(page, '김테스트', '010-1111-2222', { hour: '08', min: '20' });
  const created = (await page.locator('.booking-card').count()) === 1;
  const successShown = await page.locator('.success-box.show').isVisible();
  log('[C] 생성: confirm→저장→목록+완료 피드백', created && successShown,
    `카드=1, confirm=${dialogs.some(d => d.type === 'confirm')}`);

  // 4. localStorage 확정 JSON 구조 검증
  const store = await getStore(page);
  const b0 = store && store.bookings && store.bookings[0];
  const schemaOk = !!store && store.version === 1 && Array.isArray(store.bookings) && !!b0 &&
    /^bk_\d+$/.test(b0.id) && b0.name === '김테스트' && b0.qty === 1 &&
    /^\d{4}-\d{2}-\d{2}$/.test(b0.pickupDate) && b0.time === '08:20' &&
    b0.status === '접수' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/.test(b0.createdAt) &&
    b0.consentAt === b0.createdAt && b0.updatedAt === b0.createdAt;
  log('localStorage: 확정 JSON 구조(version·id·status·타임스탬프 3종)', schemaOk,
    b0 ? `id=${b0.id}, status=${b0.status}, createdAt=${b0.createdAt}` : '저장 없음');

  // 5. [R] 새로고침 후 데이터 유지 (오늘의 핵심!)
  await page.reload();
  const persisted = (await page.locator('.booking-card').count()) === 1;
  const nameKept = (await page.locator('.booking-card .name').first().innerText()) === '김테스트';
  log('[R] 새로고침: 예약이 유지된다 (영속성)', persisted && nameKept);

  // 6. [U] 상태 변경: 접수 → 확정, updatedAt 갱신, 새로고침에도 유지
  await page.waitForTimeout(1100); // updatedAt 차이 확보 (초 단위 이상)
  await page.locator('.status-select').first().selectOption('확정');
  await page.waitForTimeout(200);
  const badgeText = await page.locator('.status-badge').first().innerText();
  const store2 = await getStore(page);
  const updatedLater = store2.bookings[0].updatedAt > store2.bookings[0].createdAt;
  await page.reload();
  const badgeAfterReload = await page.locator('.status-badge').first().innerText();
  log('[U] 수정: 상태 확정 + updatedAt 갱신 + 새로고침 유지',
    badgeText === '확정' && updatedLater && badgeAfterReload === '확정',
    `badge=${badgeText}→reload→${badgeAfterReload}, updatedAt>createdAt=${updatedLater}`);

  // 7. 슬롯 상한: 같은 날짜·시간(08:20)에 3잔 추가 → 초과(1+3=4) 차단
  dialogs.length = 0;
  await addBooking(page, '차초과', '010-9999-0000', { hour: '08', min: '20', qty: 3, expectBlocked: true });
  const blocked = dialogs.some((d) => d.type === 'alert' && d.msg.includes('가득'));
  const stillOne = (await page.locator('.booking-card').count()) === 1;
  log('슬롯 상한: 같은 날짜+시간 3잔 초과 차단', blocked && stillOne,
    `alert=${blocked}, 카드=${await page.locator('.booking-card').count()}`);

  // 8. 취소는 슬롯 반납: 기존 예약을 취소로 바꾸면 같은 슬롯에 3잔 가능
  await page.locator('.status-select').first().selectOption('취소');
  await page.waitForTimeout(200);
  dialogs.length = 0;
  await addBooking(page, '박반납', '010-7777-8888', { hour: '08', min: '20', qty: 3 });
  const nowTwo = (await page.locator('.booking-card').count()) === 2;
  log('슬롯 반납: 취소된 예약 자리는 다시 예약 가능', nowTwo, `카드=${await page.locator('.booking-card').count()}`);

  // 8-1. 삭제 잠금: 확정·픽업완료 상태는 삭제 불가 (접수·취소만 가능)
  const bakCard = page.locator('.booking-card', { hasText: '박반납' });
  await bakCard.locator('.status-select').selectOption('확정');
  await page.waitForTimeout(200);
  const delDisabledConfirmed = await page.locator('.booking-card', { hasText: '박반납' }).locator('.btn-delete').isDisabled();
  // 말풍선 툴팁: locked 래퍼에 hover 시 ::after 로 문구 표시
  await page.locator('.booking-card', { hasText: '박반납' }).locator('.del-wrap.locked').hover();
  const tipText = await page.evaluate(() => {
    const el = document.querySelector('.del-wrap.locked');
    return el ? getComputedStyle(el, '::after').content : '';
  });
  const lockHintShown = tipText.includes('확정 이후 취소 불가능');
  await page.locator('.booking-card', { hasText: '박반납' }).locator('.status-select').selectOption('픽업완료');
  await page.waitForTimeout(200);
  const delDisabledDone = await page.locator('.booking-card', { hasText: '박반납' }).locator('.btn-delete').isDisabled();
  await page.locator('.booking-card', { hasText: '박반납' }).locator('.status-select').selectOption('접수');
  await page.waitForTimeout(200);
  const delEnabledBack = !(await page.locator('.booking-card', { hasText: '박반납' }).locator('.btn-delete').isDisabled());
  log('삭제 잠금: 확정·픽업완료는 삭제 버튼 비활성 + 안내, 접수 복귀 시 활성',
    delDisabledConfirmed && lockHintShown && delDisabledDone && delEnabledBack,
    `확정=${delDisabledConfirmed}, 안내=${lockHintShown}, 픽업완료=${delDisabledDone}, 접수복귀=${delEnabledBack}`);

  // 9. 375px 겹침·가로 넘침 (컨트롤 포함 카드 2장 상태)
  const ov = await page.evaluate(() => {
    const doc = document.documentElement;
    let poked = [];
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) {
        poked.push(el.tagName + '.' + (el.className || '').toString().split(' ')[0]);
      }
    });
    return { overflowX: doc.scrollWidth - doc.clientWidth, poked: poked.slice(0, 5) };
  });
  log('375px: 가로 넘침·겹침 없음', ov.overflowX <= 0 && ov.poked.length === 0,
    `overflowX=${ov.overflowX}px poked=[${ov.poked.join(',')}]`);
  await page.screenshot({ path: __dirname + '/day4-375-list.png', fullPage: true });

  // 10. [D] 삭제: confirm 후 해당 건만 제거, 새로고침에도 삭제 유지
  dialogs.length = 0;
  await page.locator('.booking-card', { hasText: '박반납' }).locator('.btn-delete').click();
  await page.waitForTimeout(300);
  const delConfirm = dialogs.some((d) => d.type === 'confirm' && d.msg.includes('삭제'));
  await page.reload();
  const namesAfter = await page.locator('.booking-card .name').allInnerTexts();
  const store3 = await getStore(page);
  log('[D] 삭제: confirm→제거→새로고침에도 삭제 유지', delConfirm && !namesAfter.includes('박반납') && store3.bookings.length === 1,
    `남은=${namesAfter.join(',')}, 저장소 건수=${store3.bookings.length}`);

  // 11. 모두 삭제 → 빈 상태 + 저장소 빈 배열
  while (await page.locator('.btn-delete').count()) {
    await page.locator('.btn-delete').first().click();
    await page.waitForTimeout(150);
  }
  const emptyAgain = await page.locator('.empty-state').isVisible();
  const store4 = await getStore(page);
  await page.reload();
  const emptyAfterReload = await page.locator('.empty-state').isVisible();
  log('모두 삭제: 빈 상태 + 저장소 빈 배열 + 새로고침 유지',
    emptyAgain && store4.bookings.length === 0 && emptyAfterReload);

  await browser.close();

  const fails = results.filter((r) => !r.pass);
  console.log('\n========== 요약 ==========');
  console.log(`총 ${results.length}개 중 통과 ${results.length - fails.length}, 실패 ${fails.length}`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('RUNNER ERROR:', e.message); process.exit(2); });
