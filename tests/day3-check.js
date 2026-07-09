// Day3 체크리스트 자동 점검 — B-03-O1 / B-03-O2 (375px 모바일 뷰포트)
const { chromium } = require('playwright-core');

const O1 = 'file:///Users/junghyun/Project/kaist/day3/B-03-O1.html';
const O2 = 'file:///Users/junghyun/Project/kaist/day1/index.html'; // 통합 페이지(소개+예약) 검증
const SHOT_DIR = __dirname;

const results = [];
function log(page, item, pass, detail) {
  results.push({ page, item, pass, detail });
  console.log(`[${page}] ${pass ? 'PASS' : 'FAIL'} — ${item}${detail ? ' :: ' + detail : ''}`);
}

async function fillCommon(page, name, phone) {
  await page.fill('#name', name);
  await page.fill('#phone', phone);
}

async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const overflowX = doc.scrollWidth - doc.clientWidth;
    // 각 요소가 뷰포트 밖으로 튀어나오는지도 검사
    let poked = [];
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > doc.clientWidth + 1 || r.left < -1)) {
        poked.push(el.tagName + '.' + (el.className || '').toString().split(' ')[0]);
      }
    });
    return { overflowX, poked: poked.slice(0, 5) };
  });
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });

  // ───────────────────────── O1 ─────────────────────────
  {
    const page = await ctx.newPage();
    await page.goto(O1);

    // 1. 빈 상태
    const empty1 = await page.locator('.empty-state').isVisible();
    log('O1', '빈 상태: 처음 열었을 때 안내 문구', empty1,
      empty1 ? (await page.locator('.empty-state').innerText()).replace(/\n/g, ' ') : '안 보임');

    // 2. 정상 추가
    await fillCommon(page, '김테스트', '010-1111-2222');
    await page.selectOption('#timeHour', '08');
    await page.selectOption('#timeMin', '20');
    await page.click('#submitBtn, button[type="submit"]');
    const count1 = await page.locator('.booking-card').count();
    log('O1', '정상 추가: 제출하면 목록에 추가', count1 === 1, `카드 수=${count1}`);

    // 3. 여러 개 추가 (총 3건)
    await fillCommon(page, '이연속', '010-3333-4444');
    await page.selectOption('#timeMin', '30');
    await page.click('button[type="submit"]');
    await fillCommon(page, '박세번', '010-5555-6666');
    await page.selectOption('#timeHour', '09');
    await page.click('button[type="submit"]');
    const count3 = await page.locator('.booking-card').count();
    const names = await page.locator('.booking-card .name').allInnerTexts();
    log('O1', '여러 개 추가: 3건 연속에도 목록 정상', count3 === 3, `카드=${count3}, 이름=${names.join(',')}`);

    // 375px 겹침/가로 스크롤 검사 (내용 찬 상태)
    const ov1 = await noHorizontalOverflow(page);
    log('O1', '375px: 가로 넘침·겹침 없음', ov1.overflowX <= 0 && ov1.poked.length === 0,
      `overflowX=${ov1.overflowX}px poked=[${ov1.poked.join(',')}]`);
    await page.screenshot({ path: SHOT_DIR + '/O1-375-list.png', fullPage: true });

    // 4. 삭제: 두 번째(이연속)만 삭제
    await page.locator('.booking-card', { hasText: '이연속' }).locator('.btn-delete').click();
    const afterDel = await page.locator('.booking-card .name').allInnerTexts();
    log('O1', '삭제: 원하는 항목만 지워짐', afterDel.length === 2 && !afterDel.includes('이연속'),
      `남은=${afterDel.join(',')}`);

    // 5. 모두 삭제 → 빈 상태 복귀
    while (await page.locator('.btn-delete').count()) {
      await page.locator('.btn-delete').first().click();
    }
    const emptyAgain = await page.locator('.empty-state').isVisible();
    log('O1', '모두 삭제: 빈 상태 다시 표시', emptyAgain);

    // 6. 새로고침: 데이터 소실 = 정상
    await fillCommon(page, '휘발테스트', '010-7777-8888');
    await page.click('button[type="submit"]');
    await page.reload();
    const afterReload = await page.locator('.booking-card').count();
    const emptyAfterReload = await page.locator('.empty-state').isVisible();
    log('O1', '새로고침: 데이터 사라짐(정상)', afterReload === 0 && emptyAfterReload, `카드=${afterReload}`);
    await page.close();
  }

  // ───────────────────────── O2 ─────────────────────────
  {
    const page = await ctx.newPage();
    const dialogs = [];
    page.on('dialog', async d => {
      dialogs.push({ type: d.type(), msg: d.message().split('\n')[0] });
      await d.accept(); // confirm은 승인, alert은 닫기
    });
    await page.goto(O2);

    // 1. 빈 상태
    const empty1 = await page.locator('.empty-state').isVisible();
    log('O2', '빈 상태: 처음 열었을 때 안내 문구', empty1);

    // (개선1) 빈 칸 제출 → alert + 인라인 오류 (+동의 오류 포함)
    await page.click('#submitBtn');
    const gotAlert = dialogs.some(d => d.type === 'alert');
    const inlineErr = await page.locator('#nameError.show').isVisible();
    const consentErr1 = await page.locator('#consentError.show').isVisible();
    log('O2', '검증: 빈 칸 제출 차단(경고창+이유 표시)', gotAlert && inlineErr && consentErr1,
      `alert=${gotAlert}, 인라인오류=${inlineErr}, 동의오류=${consentErr1}`);

    // (추가) 이름·연락처 채우고 동의만 미체크 → 차단 + 동의 오류만 표시
    dialogs.length = 0;
    await fillCommon(page, '미동의', '010-0000-0000');
    await page.click('#submitBtn');
    await page.waitForTimeout(200);
    const consentOnlyErr = await page.locator('#consentError.show').isVisible();
    const nameErrGone = !(await page.locator('#nameError.show').isVisible());
    const noCardYet = (await page.locator('.booking-card').count()) === 0;
    log('O2', '동의 미체크: 제출 차단 + 동의 오류 표시', consentOnlyErr && nameErrGone && noCardYet,
      `동의오류=${consentOnlyErr}, 이름오류해제=${nameErrGone}, 카드=0:${noCardYet}`);

    // (추가) 동의 상세 펼쳐보기: 클릭해 열고 내용 확인
    await page.click('.consent-details summary');
    await page.waitForTimeout(100);
    const detailsOpen = await page.locator('.consent-details ul').isVisible();
    const detailsText = await page.locator('.consent-details').innerText();
    const hasAll = detailsText.includes('1개월') && detailsText.includes('이름, 연락처') && detailsText.includes('이용 목적');
    log('O2', '동의 문구: 펼쳐보기 동작 + 항목·목적·보유기간(1개월) 명시', detailsOpen && hasAll,
      `펼침=${detailsOpen}, 문구완비=${hasAll}`);
    await page.click('.consent-details summary'); // 다시 접기

    // (추가) 재고 소진 안내 문구 노출
    const hintVisible = await page.locator('.menu-hint').isVisible();
    log('O2', '재고 소진 안내 문구 노출', hintVisible);

    // 2. 정상 추가 (동의 체크 + confirm 승인 → 처리 중 → 완료)
    dialogs.length = 0;
    await fillCommon(page, '김테스트', '010-1111-2222');
    await page.check('#consent');
    await page.selectOption('#timeHour', '08');
    await page.selectOption('#timeMin', '20');
    await page.click('#submitBtn');
    const gotConfirm = dialogs.some(d => d.type === 'confirm');
    await page.waitForSelector('.booking-card', { timeout: 3000 });
    const success = await page.locator('.success-box.show').isVisible();
    const count1 = await page.locator('.booking-card').count();
    log('O2', '정상 추가: confirm→처리중→완료 피드백→목록', gotConfirm && success && count1 === 1,
      `confirm=${gotConfirm}, 완료박스=${success}, 카드=${count1}`);

    // (개선2) 슬롯 초과: 08:20에 이미 1잔 → 수량3 추가 시도 = 4잔 > 3
    dialogs.length = 0;
    await fillCommon(page, '차초과', '010-9999-0000');
    await page.check('#consent');
    await page.selectOption('#timeHour', '08');
    await page.selectOption('#timeMin', '20');
    await page.click('#qtyPlus'); await page.click('#qtyPlus'); // 수량 3
    await page.click('#submitBtn');
    await page.waitForTimeout(300);
    const slotAlert = dialogs.find(d => d.type === 'alert' && d.msg.includes('가득'));
    const stillOne = (await page.locator('.booking-card').count()) === 1;
    log('O2', '슬롯 상한: 10분당 3잔 초과 차단', !!slotAlert && stillOne,
      `alert="${slotAlert ? slotAlert.msg : '없음'}", 카드=${await page.locator('.booking-card').count()}`);

    // 3. 여러 개 추가 (다른 슬롯으로 2건 더)
    dialogs.length = 0;
    await fillCommon(page, '이연속', '010-3333-4444');
    await page.check('#consent');
    await page.selectOption('#timeMin', '30');
    await page.click('#submitBtn');
    await page.waitForFunction(() => document.querySelectorAll('.booking-card').length === 2, { timeout: 3000 });
    await fillCommon(page, '박세번', '010-5555-6666');
    await page.check('#consent');
    await page.selectOption('#timeHour', '09');
    await page.click('#submitBtn');
    await page.waitForFunction(() => document.querySelectorAll('.booking-card').length === 3, { timeout: 3000 });
    log('O2', '여러 개 추가: 3건 연속에도 목록 정상', true, '카드=3');

    // 10시 → 분은 00만 남는지
    await page.selectOption('#timeHour', '10');
    const minOpts = await page.locator('#timeMin option').allInnerTexts();
    log('O2', '10시 선택 시 분=00만 노출', minOpts.length === 1 && minOpts[0] === '00분', `옵션=[${minOpts.join(',')}]`);

    // 375px 겹침 검사
    const ov2 = await noHorizontalOverflow(page);
    log('O2', '375px: 가로 넘침·겹침 없음', ov2.overflowX <= 0 && ov2.poked.length === 0,
      `overflowX=${ov2.overflowX}px poked=[${ov2.poked.join(',')}]`);
    await page.screenshot({ path: SHOT_DIR + '/O2-375-list.png', fullPage: true });

    // 4. 삭제(confirm 포함): '이연속'만 삭제
    dialogs.length = 0;
    await page.locator('.booking-card', { hasText: '이연속' }).locator('.btn-delete').click();
    await page.waitForTimeout(200);
    const delConfirm = dialogs.some(d => d.type === 'confirm' && d.msg.includes('삭제'));
    const afterDel = await page.locator('.booking-card .name').allInnerTexts();
    log('O2', '삭제: 확인창 후 해당 항목만 삭제', delConfirm && afterDel.length === 2 && !afterDel.includes('이연속'),
      `confirm=${delConfirm}, 남은=${afterDel.join(',')}`);

    // 5. 모두 삭제
    while (await page.locator('.btn-delete').count()) {
      await page.locator('.btn-delete').first().click();
      await page.waitForTimeout(150);
    }
    log('O2', '모두 삭제: 빈 상태 다시 표시', await page.locator('.empty-state').isVisible());

    // 6. 새로고침
    await page.reload();
    log('O2', '새로고침: 데이터 사라짐(정상)', await page.locator('.empty-state').isVisible());
    await page.close();
  }

  await browser.close();

  const fails = results.filter(r => !r.pass);
  console.log('\n========== 요약 ==========');
  console.log(`총 ${results.length}개 중 통과 ${results.length - fails.length}, 실패 ${fails.length}`);
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('RUNNER ERROR:', e.message); process.exit(2); });
