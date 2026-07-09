// Day4 자동 점검 v2 — 고객 페이지(예약+내 예약 확인) & 관리자 페이지(목록·상태·삭제)
// 사용: node tests/day4-check.js [고객페이지 URL]  (관리자 URL은 같은 폴더 admin.html로 유도)
const { chromium } = require('playwright-core');

const CUSTOMER = process.argv[2] || 'file:///Users/junghyun/Project/kaist/day4/B-04-O1.html';
const ADMIN = CUSTOMER.replace(/[^/]*$/, 'admin.html');
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
  if (opts.dateIndex !== undefined) await page.selectOption('#pickupDate', { index: opts.dateIndex });
  if (opts.hour) await page.selectOption('#timeHour', opts.hour);
  if (opts.min) await page.selectOption('#timeMin', opts.min);
  for (let i = 1; i < (opts.qty || 1); i++) await page.click('#qtyPlus');
  await page.click('#submitBtn');
  if (opts.expectBlocked) {
    await page.waitForTimeout(400);
  } else {
    await page.waitForSelector('.success-box.show', { timeout: 4000 });
  }
}

async function overflowCheck(page) {
  return page.evaluate(() => {
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

  await page.goto(CUSTOMER);
  await page.evaluate((k) => localStorage.removeItem(k), KEY);
  await page.reload();

  // ═══════ 고객 페이지 ═══════

  // C1. 연락처: 숫자만 + 하이픈 표시
  await page.fill('#phone', '010abc1234!@#5678');
  const phoneShown = await page.inputValue('#phone');
  log('C1 연락처: 숫자 외 문자 차단 + 010-0000-0000 표시', phoneShown === '010-1234-5678', `표시="${phoneShown}"`);
  await page.fill('#phone', '');

  // C2. [C] 생성
  dialogs.length = 0;
  await addBooking(page, '김테스트', '010-1111-2222', { hour: '08', min: '20' });
  log('C2 [C] 생성: confirm→처리중→완료 피드백', dialogs.some((d) => d.type === 'confirm'),
    `confirm=${dialogs.some((d) => d.type === 'confirm')}`);

  // C3. localStorage 스키마 (+숫자만 저장)
  const store = await getStore(page);
  const b0 = store && store.bookings && store.bookings[0];
  const schemaOk = !!store && store.version === 1 && !!b0 &&
    /^bk_\d+$/.test(b0.id) && b0.name === '김테스트' && b0.phone === '01011112222' &&
    /^\d{4}-\d{2}-\d{2}$/.test(b0.pickupDate) && b0.time === '08:20' && b0.status === '접수' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/.test(b0.createdAt) &&
    b0.consentAt === b0.createdAt;
  log('C3 localStorage: 확정 JSON 구조 + 연락처 숫자만 저장', schemaOk,
    b0 ? `id=${b0.id}, phone=${b0.phone}` : '저장 없음');

  // C4. 새로고침 후 저장 유지
  await page.reload();
  const storeAfter = await getStore(page);
  log('C4 [R] 새로고침: 저장 유지 (영속성)', storeAfter && storeAfter.bookings.length === 1);

  // C5. 슬롯 상한 (같은 날짜·시간 3잔 초과 차단)
  dialogs.length = 0;
  await addBooking(page, '차초과', '010-9999-0000', { hour: '08', min: '20', qty: 3, expectBlocked: true });
  const blocked = dialogs.some((d) => d.type === 'alert' && d.msg.includes('가득'));
  log('C5 슬롯 상한: 10분당 3잔 초과 차단', blocked && (await getStore(page)).bookings.length === 1);

  // C6. 내 예약 확인 — 없는 예약
  await page.click('#lookupToggle');
  await page.fill('#lookupName', '없는사람');
  await page.fill('#lookupPhone', '010-0000-9999');
  await page.click('#lookupRun');
  await page.waitForTimeout(200);
  const noneMsg = await page.locator('#lookupResults .empty-state').innerText();
  log('C6 내 예약 확인: 없는 예약 안내', noneMsg.includes('예약이 없어요'), `"${noneMsg.split('\n')[0]}..."`);

  // C7. 내 예약 확인 — 있는 예약 조회
  await page.fill('#lookupName', '김테스트');
  await page.fill('#lookupPhone', '01011112222');
  await page.click('#lookupRun');
  await page.waitForTimeout(200);
  const resCard = page.locator('#lookupResults .booking-card');
  const found = (await resCard.count()) === 1;
  const resText = found ? await resCard.innerText() : '';
  const cancelBtnShown = found && (await resCard.locator('.btn-cancel-booking').count()) === 1;
  const ovC = await overflowCheck(page);
  log('C7 내 예약 확인: 본인 예약 표시 + 취소 버튼(접수) + 375px',
    found && resText.includes('김테스트') && resText.includes('접수') && cancelBtnShown && ovC.overflowX <= 0,
    `카드=${found}, 취소버튼=${cancelBtnShown}, overflowX=${ovC.overflowX}`);

  // C8. 고객 취소 (접수 → 취소)
  dialogs.length = 0;
  await resCard.locator('.btn-cancel-booking').click();
  await page.waitForTimeout(300);
  const cancelConfirm = dialogs.some((d) => d.type === 'confirm' && d.msg.includes('취소'));
  const storeCancel = await getStore(page);
  const badgeNow = await page.locator('#lookupResults .status-badge').innerText();
  const cancelBtnGone = (await page.locator('#lookupResults .btn-cancel-booking').count()) === 0;
  log('C8 고객 취소: confirm→상태 취소 저장→버튼 사라짐',
    cancelConfirm && storeCancel.bookings[0].status === '취소' && badgeNow === '취소' && cancelBtnGone,
    `저장상태=${storeCancel.bookings[0].status}, 배지=${badgeNow}`);

  // C9. 취소 = 슬롯 반납 (같은 슬롯 3잔 성공)
  await addBooking(page, '박반납', '010-7777-8888', { hour: '08', min: '20', qty: 3 });
  log('C9 슬롯 반납: 취소 후 같은 슬롯 3잔 예약 가능', (await getStore(page)).bookings.length === 2);

  // C9-1. 마감 슬롯 표시: 08:20에 3잔 찼으므로 옵션 disabled + '예약 마감' 라벨 + 선택 불가
  await page.selectOption('#timeHour', '08');
  const opt20 = page.locator('#timeMin option[value="20"]');
  const optDisabled = await opt20.evaluate((o) => o.disabled);
  const optLabel = await opt20.innerText();
  let selectBlocked = false;
  try { await page.selectOption('#timeMin', '20', { timeout: 1200 }); } catch (e) { selectBlocked = true; }
  const minNow = await page.inputValue('#timeMin');
  log('C9-1 마감 슬롯: disabled + 예약 마감 라벨 + 선택 차단',
    optDisabled && optLabel.includes('예약 마감') && selectBlocked && minNow !== '20',
    `라벨="${optLabel}", 선택차단=${selectBlocked}, 현재값=${minNow}`);

  // C10. 관리자 페이지 이동 (토스트 → 자동 이동)
  await page.click('#adminLink');
  const toastText = await page.locator('#toast').innerText();
  const toastShown = !(await page.locator('#toast').isHidden());
  await page.waitForURL(/admin\.html/, { timeout: 5000 });
  log('C10 관리자 버튼: 토스트 표시 후 admin.html 이동',
    toastShown && toastText === '관리자페이지로 이동합니다', `토스트="${toastText}"`);

  // ═══════ 관리자 페이지 ═══════

  // A1. 목록 공유: 고객이 만든 예약 표시 + 탭 건수 + 전화 포맷
  await page.waitForSelector('.booking-card', { timeout: 4000 });
  const aCards = await page.locator('#bookingList .booking-card').count();
  const aTab = await page.locator('#bookingTabs .date-tab').first().innerText();
  const aText = await page.locator('#bookingList').innerText();
  log('A1 관리자: 예약 목록 표시(저장소 공유) + 탭 건수 + 전화 포맷',
    aCards === 2 && aTab.includes('2건') && aText.includes('010-7777-8888'),
    `카드=${aCards}, 탭="${aTab}"`);

  // A2. [U] 상태 확정 + updatedAt + 새로고침 유지
  await page.waitForTimeout(1100);
  const bakCard = page.locator('.booking-card', { hasText: '박반납' });
  await bakCard.locator('.status-select').selectOption('확정');
  await page.waitForTimeout(200);
  const storeU = await getStore(page);
  const bakU = storeU.bookings.find((b) => b.name === '박반납');
  await page.reload();
  const badgeAfter = await page.locator('.booking-card', { hasText: '박반납' }).locator('.status-badge').innerText();
  log('A2 [U] 상태 확정 + updatedAt 갱신 + 새로고침 유지',
    bakU.status === '확정' && bakU.updatedAt > bakU.createdAt && badgeAfter === '확정');

  // A3. 삭제 잠금 + 툴팁 + 픽업완료 → 완료 섹션 이동
  const delDisabled = await page.locator('.booking-card', { hasText: '박반납' }).locator('.btn-delete').isDisabled();
  await page.locator('.booking-card', { hasText: '박반납' }).locator('.del-wrap.locked').hover();
  const tip = await page.evaluate(() => {
    const el = document.querySelector('.del-wrap.locked');
    return el ? getComputedStyle(el, '::after').content : '';
  });
  await page.locator('.booking-card', { hasText: '박반납' }).locator('.status-select').selectOption('픽업완료');
  await page.waitForTimeout(200);
  const inDone = (await page.locator('#doneList .booking-card').filter({ hasText: '박반납' }).count()) === 1;
  const doneTab = await page.locator('#doneTabs .date-tab').first().innerText();
  const ovA = await overflowCheck(page);
  log('A3 삭제 잠금(확정)+말풍선 + 픽업완료→완료 섹션 이동 + 375px',
    delDisabled && tip.includes('확정 이후 취소 불가능') && inDone && doneTab.includes('1건') && ovA.overflowX <= 0,
    `disabled=${delDisabled}, 툴팁=${tip.includes('확정 이후 취소 불가능')}, done탭="${doneTab}"`);

  // A4. 접수 복귀 → 예약 목록으로 + 삭제 가능
  await page.locator('#doneList .booking-card').locator('.status-select').selectOption('접수');
  await page.waitForTimeout(200);
  const backInActive = (await page.locator('#bookingList .booking-card').filter({ hasText: '박반납' }).count()) === 1;
  const delEnabled = !(await page.locator('.booking-card', { hasText: '박반납' }).locator('.btn-delete').isDisabled());
  log('A4 접수 복귀: 예약 목록 복귀 + 삭제 버튼 활성', backInActive && delEnabled);

  // A5. 날짜 탭: 고객 페이지에서 다른 날짜 예약 추가 → 관리자 탭 2개·전환
  await page.goto(CUSTOMER);
  await addBooking(page, '남다른날', '010-2222-3333', { hour: '09', min: '00', dateIndex: 1 });
  await page.goto(ADMIN);
  const tabTexts = await page.locator('#bookingTabs .date-tab').allInnerTexts();
  await page.locator('#bookingTabs .date-tab').nth(1).click();
  await page.waitForTimeout(200);
  const tab2Names = await page.locator('#bookingList .booking-card .name').allInnerTexts();
  log('A5 날짜 탭: 그룹핑 + 월/일·건수 라벨 + 전환',
    tabTexts.length === 2 && tabTexts.every((t) => /\d+\/\d+ \(.+\) · \d+건/.test(t)) && tab2Names.includes('남다른날'),
    `탭=[${tabTexts.join(' | ')}]`);

  // A6. [D] 삭제 + 모두 삭제 → 두 섹션 빈 상태 + 저장소 비움 + 새로고침 유지
  dialogs.length = 0;
  await page.locator('#bookingList .booking-card', { hasText: '남다른날' }).locator('.btn-delete').click();
  await page.waitForTimeout(300);
  while (await page.locator('.btn-delete:not([disabled])').count()) {
    await page.locator('.btn-delete:not([disabled])').first().click();
    await page.waitForTimeout(150);
  }
  const emptyBoth = (await page.locator('#bookingList .empty-state').isVisible()) &&
    (await page.locator('#doneList .empty-state').isVisible());
  const storeEnd = await getStore(page);
  await page.reload();
  const emptyAfterReload = await page.locator('#bookingList .empty-state').isVisible();
  log('A6 [D] 삭제·모두 삭제: 두 섹션 빈 상태 + 저장소 비움 + 새로고침 유지',
    dialogs.some((d) => d.type === 'confirm') && emptyBoth && storeEnd.bookings.length === 0 && emptyAfterReload);

  await browser.close();

  const fails = results.filter((r) => !r.pass);
  console.log('\n========== 요약 ==========');
  console.log(`총 ${results.length}개 중 통과 ${results.length - fails.length}, 실패 ${fails.length}`);
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error('RUNNER ERROR:', e.message); process.exit(2); });
