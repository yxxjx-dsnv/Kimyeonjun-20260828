/**
 * 브라우저 E2E — 실제 클릭으로 코어 루프를 통과시킨다.
 *   npm run build && node tests/serve.mjs 3111 &
 *   node tests/browser.e2e.mjs [baseUrl]
 *
 * Playwright는 package.json에 넣지 않는다(패키지 4개 원칙).
 *   npm i -D playwright --no-save && npx playwright install chromium
 *
 * 여기서 쓰는 셀렉터·문구는 tests/render.test.mjs가 App.jsx에 실제로
 * 있는지 검사한다. 직전 과제에서 이 테스트가 UI와 어긋난 채 방치됐던
 * 부채를 그렇게 갚는다.
 */
const BASE = process.argv[2] || process.env.BASE || 'http://localhost:3111'
const { chromium } = await import('playwright')

let fail = 0
const check = (label, cond, extra = '') => {
  // 근거는 실패했을 때만 붙인다. 통과 로그에 붙으면 실패처럼 읽힌다.
  console.log(`${cond ? '✓' : '✗ 실패'} ${label}${!cond && extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

/**
 * 가로 넘침 검사 — 같은 원인(grid/flex 아이템의 min-width:auto)으로 두 번 화면이 깨졌다.
 * 처음엔 개봉 결과 카드, 다음엔 등급 스트립이 414px 안에서 664px로 그려졌다.
 * 검사가 한 화면만 보고 있어서 두 번째를 놓쳤으므로, 이제 모든 화면에서 부른다.
 *
 * 가로 스크롤 컨테이너 안의 자식이 밖으로 나가는 것은 정상이므로 제외한다.
 */
const spill = (page) =>
  page.evaluate(() => {
    const host = document.querySelector('.body')
    if (!host) return []
    const W = host.clientWidth
    const L = host.getBoundingClientRect().left
    const clipped = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ov = getComputedStyle(p).overflowX
        if (ov === 'auto' || ov === 'scroll' || ov === 'hidden') return true
        if (p === host) return false
      }
      return false
    }
    return [...host.querySelectorAll('*')]
      .filter((e) => {
        const b = e.getBoundingClientRect()
        return b.width > 0 && b.right > L + W + 1 && !clipped(e)
      })
      .slice(0, 5)
      .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}(+${Math.round(e.getBoundingClientRect().right - (L + W))}px)`)
  })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 414, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message)))
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text())
})

// 1. 진입 — 기대값은 서버에서 받아온다(하드코딩하면 상품이 바뀔 때마다 깨진다)
const meta = await (await fetch(`${BASE}/api/boxes`)).json()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.bcard', { timeout: 20000 })
check(`랜덤박스 ${meta.boxes.length}종 노출`, (await page.$$('.bcard')).length === meta.boxes.length)
// 래플·적금 카드도 .gbcard 셸을 쓰므로 '상품 확정' 태그로 공동구매만 센다
check(`공동구매 ${meta.groupbuys.length}종 노출`,
  (await page.$$('.gbcard__tag:not(.gbcard__tag--rf):not(.gbcard__tag--sv)')).length === meta.groupbuys.length)
check(`래플 ${meta.raffles.length}종 노출`, (await page.$$('.gbcard__tag--rf')).length === meta.raffles.length)
check(`적금 ${meta.saveups.length}종 노출`, (await page.$$('.gbcard__tag--sv')).length === meta.saveups.length)
check('탭바에 올박스', await page.isVisible('.tabbar__b.is-center'))

// 2. 박스 진입 — 상세는 '지금 확률' 한 카드만 보여준다
await page.click('.bcard')
await page.waitForSelector('.odds', { timeout: 10000 })
check('등급 막대 4개', (await page.$$('.odds .bars__row')).length === 4)
const oddsAlone = await page.textContent('.now__num')
check('자연빈도 병기', (await page.textContent('.now__nf')).includes('명 중 약'))
check('재고 요약 노출', /총 [\d,]+개/.test(await page.textContent('.odds__stock')))
check('가로 넘침 없음 — 박스 상세', (await spill(page)).length === 0, (await spill(page)).join(' | '))

// 상세 화면이 다시 15블록으로 불어나는 것을 막는다.
const blocks = await page.$$eval('.body > *', (e) => e.length)
check('상세 블록 7개 이하', blocks <= 7, `${blocks}블록`)

// 3. 확률 근거 시트 — 곡선·표·뽑기통·천장은 전부 여기로 내렸다
await page.click('.odds__why')
await page.waitForSelector('.sheet__live', { timeout: 5000 })
check('시트에 확률 곡선', await page.isVisible('.curve__line'))
check('시트에 뽑기 통', (await page.$$('.sheet__live .bin__row')).length === 4)
check('시트에 천장 바', await page.isVisible('.sheet__live .pity'))
check('가로 넘침 없음 — 확률 근거 시트', (await spill(page)).length === 0, (await spill(page)).join(' | '))
await page.click('.more__btn')
await page.waitForSelector('.otable', { timeout: 5000 })
check('더보기 표 1~10명', (await page.$$('.otable tbody tr')).length === 10)
await page.click('.sheet .btn--ghost')
await page.waitForSelector('.sheet', { state: 'detached', timeout: 5000 })

// 4. 취향 대화 (ChatGPT) — 키가 없으면 규칙 기반으로 내려앉는다
await page.click('text=손주 줄 것도 넣어서')
// AI가 되물을 수 있다. 그 경우에도 칩은 항상 떠 있어야 하고(막다른 골목 금지),
// 한 번 더 고르면 결과 문장이 대화 안(.taste__done)에 떠야 한다.
for (let turn = 0; turn < 2; turn++) {
  try { await page.waitForSelector('.taste__done', { timeout: 40000 }); break } catch {
    const chip = await page.$('.taste__chips .chip')
    check('되묻기 상태에서도 칩이 떠 있다', Boolean(chip))
    if (!chip) break
    await chip.click()
  }
}
const done = await page.textContent('.taste__done')
check('취향 구성 반영이 대화 안에 뜬다', /좁혔|기본 구성/.test(done), done)
// 등급 스트립이 664px로 그려져 화면 밖으로 나갔던 자리다.
check('가로 넘침 없음 — 등급 스트립', (await spill(page)).length === 0, (await spill(page)).join(' | '))

// 5. 인원 모으기 — 곡선 위의 점이 움직인다
await page.click('text=바로')
await page.waitForFunction(() => document.querySelectorAll('.av.is-in').length === 10, null, { timeout: 20000 })
check('10명 모임', (await page.textContent('.rail__count')).includes('10'))
const oddsTeam = await page.textContent('.now__num')
check('팀이 커지자 확률 상승', parseFloat(oddsTeam) > parseFloat(oddsAlone), `${oddsAlone} → ${oddsTeam}`)

// 6. 전원 게이트 — 한 명이라도 안 누르면 안 열린다
await page.click('.btn--go')
await page.waitForTimeout(700)
const gate = await page.textContent('.btn--go')
check('게이트 진행 표시', /\d+\/10명 준비/.test(gate), gate.trim())
check('게이트 안내 문구', await page.isVisible('.gatenote'))

// 7. 개봉과 정산
await page.waitForSelector('.rvlist', { timeout: 60000 })
// 개봉은 전폭 장면으로 먼저 나온다. 탭하면 걷히고 팀 전체 결과가 드러난다.
check('개봉 장면 노출', await page.isVisible('.scene'))
check('장면에 등급과 정산', /낸 돈.*시가/s.test(await page.textContent('.scene__card')))
await page.click('.scene')
await page.waitForSelector('.scene', { state: 'detached', timeout: 5000 })
check('참여자 수만큼 결과', (await page.$$('.rv')).length === 10)
// '내가 받은 것' 요약 카드에도 정산이 있으므로 참여자 카드 안으로 한정한다.
const deltas = await page.$$eval('.rv .rv__delta, .rv .rv__even', (els) => els.map((e) => e.textContent))
check('정산 표기 10건', deltas.length === 10, deltas.slice(0, 3).join(' '))
check('음수 차액 없음', deltas.every((d) => !d.includes('-')), deltas.join(' '))
check('결과 불변 안내', (await page.textContent('.seed')).includes('변경되지 않아'))

check('가로 넘침 없음 — 개봉 결과', (await spill(page)).length === 0, (await spill(page)).join(' | '))

// 8. 공동구매형 — 상품 확정, 확률은 '얼마를 내는가'에만
{
  const gb = meta.groupbuys[0]
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.click('.gbcard:has(.gbcard__tag:not(.gbcard__tag--rf):not(.gbcard__tag--sv))')
  await page.waitForSelector('.gbnow', { timeout: 10000 })
  const read = async () => (await page.$$eval('.gbnow b', (e) => e.map((x) => x.textContent)))
  const at20 = await read()
  check(`최소 발주 ${gb.minTeam}명 기본값`, (await page.textContent('.gbslider b')).includes(String(gb.minTeam)))

  await page.focus('.gbslider input')
  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(400)
  const at45 = await read()
  check('인원이 늘면 내는 돈이 준다', parseInt(at45[0].replace(/\D/g, '')) < parseInt(at20[0].replace(/\D/g, '')), `${at20[0]} → ${at45[0]}`)
  check('인원이 늘면 무료 인원이 는다', parseInt(at45[2]) > parseInt(at20[2]), `${at20[2]} → ${at45[2]}`)

  await page.click('.btn--go')
  await page.waitForSelector('.rvlist', { timeout: 30000 })
  // 60명 결과를 전부 늘어놓지 않는다 — 당첨자와 나만 먼저, 나머지는 한 줄
  const collapsed = (await page.$$('.rv')).length
  const moreBtn = await page.$('.rv__more')
  check('결과가 접혀서 나온다', Boolean(moreBtn) && collapsed <= 12, `${collapsed}행`)
  if (moreBtn) { await moreBtn.click(); await page.waitForTimeout(200) }
  const free = (await page.$$('.freetag')).length
  const all = (await page.$$('.rv')).length
  check('발주 결과에 무료 당첨자', free >= 1 && free < all, `${free}/${all}명`)
  const gd = await page.$$eval('.rv .rv__delta, .rv .rv__even', (els) => els.map((e) => e.textContent))
  check('공동구매도 손해 없음', gd.length === all && gd.every((d) => !d.includes('-')))
  check('가로 넘침 없음 — 공동구매', (await spill(page)).length === 0, (await spill(page)).join(' | '))
}

// 9. 데일리 100원 — 꽝 있는 포맷, 확률 전부 공개
{
  const d = meta.dailies[0]
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.dcard', { timeout: 20000 })
  check(`데일리 ${meta.dailies.length}종 노출`, (await page.$$('.dcard')).length === meta.dailies.length)
  await page.click('.dcard')
  await page.waitForSelector('.gbnow', { timeout: 10000 })
  const stat = await page.$$eval('.gbnow b', (e) => e.map((x) => x.textContent))
  check('당첨 확률 공개', stat[0].includes(String(d.winOdds)))
  check('꽝 확률도 공개', stat[1].includes(String(d.blankOdds)))
  check('확률 계산 근거 4단계', (await page.$$('.deco__ol li')).length === 4)
  await page.click('.btn--go')
  await page.waitForSelector('.dres', { timeout: 20000 })
  const t = (await page.textContent('.dres b')).trim()
  check('당첨 또는 꽝이 나온다', ['당첨!', '꽝'].includes(t), t)
  check('투표 카드 등장', await page.isVisible('.vote'))
  check('가로 넘침 없음 — 데일리', (await spill(page)).length === 0, (await spill(page)).join(' | '))
}

// 9-b. ④ 래플 — 응모 무료·중복 409·낙첨 손실 0
{
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.gbcard__tag--rf', { timeout: 20000 })
  await page.click('.gbcard__tag--rf')
  await page.waitForSelector('.gbnow', { timeout: 10000 })
  check('래플: 정가 취소선 + 래플가', /↓/.test(await page.textContent('.gbhero__pr')))
  await page.click('text=무료로 응모하기')
  await page.waitForSelector('text=응모 완료', { timeout: 10000 })
  check('래플: 응모 번호 발급', /\d+번/.test(await page.textContent('.gatenote')))
  await page.click('text=추첨 결과 보기')
  await page.waitForSelector('.dres', { timeout: 10000 })
  const rfT = await page.textContent('.dres')
  check('래플: 당첨 또는 무손실 낙첨', /당첨|잃은 건 0원/.test(rfT), rfT.slice(0, 40))
  check('가로 넘침 없음 — 래플', (await spill(page)).length === 0, (await spill(page)).join(' | '))
}

// 9-c. ⑤ 무손실 적금 — 적립 → 확률 → 추첨 → 원금 보존
{
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.gbcard__tag--sv', { timeout: 20000 })
  await page.click('.gbcard__tag--sv')
  await page.waitForSelector('.gbnow', { timeout: 10000 })
  await page.click('.draws .chip:nth-child(3)')
  await page.waitForSelector('text=내 당첨 확률', { timeout: 10000 })
  check('적금: 적립하면 확률이 뜬다', /[\d.]+%/.test(await page.textContent('.gatenote')))
  await page.click('text=이번 주 추첨 보기')
  await page.waitForSelector('.dres', { timeout: 10000 })
  const svT = await page.textContent('.dres')
  check('적금: 원금 보존 명시', svT.includes('원금') && svT.includes('5,000'), svT.slice(0, 60))
  check('가로 넘침 없음 — 적금', (await spill(page)).length === 0, (await spill(page)).join(' | '))
}

// 10. 뽑기 통과 천장
{
  // networkidle을 쓰지 않는다 — 데일리 화면을 거친 뒤로는 앱이 주기적으로
  // 상태를 확인해 idle이 오지 않는다. 필요한 요소가 뜨는 것으로 판단한다.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.blist li:nth-child(2) .bcard', { timeout: 20000 })
  await page.click('.blist li:nth-child(2) .bcard')
  await page.waitForSelector('.odds__why', { timeout: 10000 })
  await page.click('.odds__why')
  await page.waitForSelector('.bin', { timeout: 10000 })
  check('뽑기 통 4등급', (await page.$$('.bin__row')).length === 4)
  const tot = await page.textContent('.bin__tot')
  check('총 구좌 표기', /[\d,]+구좌/.test(tot), tot)
  check('천장 바 존재', await page.isVisible('.pity'))
  const pityBefore = await page.textContent('.pity__note')
  await page.focus('.pity__sim input')
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(300)
  const pityAfter = await page.textContent('.pity__note')
  check('천장 도달 시 안내 변경', pityBefore !== pityAfter, `${pityBefore} → ${pityAfter}`)
}

// 11. 확률 안내 시트 — 유저와 같은 경로(상세 화면의 '확률 안내')로 진입
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.bcard', { timeout: 20000 })
await page.click('.bcard')
await page.waitForSelector('.odds__why', { timeout: 10000 })
await page.click('.odds__why')
await page.waitForSelector('.sheet', { timeout: 5000 })
const sheet = await page.textContent('.sheet')
check('수식 공개', sheet.includes('매입 원가율') && sheet.includes('고객 획득비 회수'))
check('가정 명시', sheet.includes('모델 가정'))
check('포맷별 정직성 설명', sheet.includes('일부 형식의 속성'))
check('꽝 없는 형식의 3층 구조', sheet.includes('수집 단계에서'))
check('꽝 있는 형식도 명시', sheet.includes('이 형식에는 꽝이 있습니다'))
check('확률 출처 3가지', sheet.includes('재고 비율') && sheet.includes('손익분기') && sheet.includes('할인 여력'))
check('천장은 공시 대상', sheet.includes('천장(보장)'))

// 12. 데스크톱 셸 — 폰이 '기기'로 보여야 한다.
// 프레임에 높이 상한이 없어 홈 그리드에서 3,885px까지 자랐던 적이 있다.
// 실제 앱은 화면이 고정되고 스크롤은 본문 안에서만 일어난다.
{
  const desk = await browser.newContext({ viewport: { width: 1512, height: 950 } })
  const dp = await desk.newPage()
  await dp.goto(BASE, { waitUntil: 'domcontentloaded' })
  await dp.waitForSelector('.bcard', { timeout: 20000 })
  await dp.click('.tabbar__b:nth-child(1)')          // 홈 — 내용이 가장 긴 탭
  await dp.waitForTimeout(600)
  const m = await dp.evaluate(() => {
    const body = document.querySelector('.body')
    return {
      frame: Math.round(document.querySelector('.phone').getBoundingClientRect().height),
      vh: window.innerHeight,
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
      bodyScrolls: body.scrollHeight > body.clientHeight + 1,
    }
  })
  check('폰 프레임이 뷰포트를 넘지 않음', m.frame <= m.vh, `${m.frame}px / ${m.vh}px`)
  check('페이지가 아니라 본문이 스크롤', !m.pageScrolls && m.bodyScrolls,
    `page=${m.pageScrolls} body=${m.bodyScrolls}`)

  // 실무자 모니터(OPS) — 유저 폰에서 뒤로 내린 확률 세부는 우측 패널이
  // 실시간으로 전부 보여준다. 폰과 같은 서버 값을 쓰는지, 참여자가 늘면
  // 실제로 갱신되는지 잠근다.
  await dp.click('.tabbar__b:nth-child(3)')
  await dp.waitForSelector('.bcard', { timeout: 10000 })
  // 좌측 배경 레일 — 채용 담당자가 읽는 자리. 데이터 수치는 서버에서 온다.
  check('좌측 브리프 레일 노출', await dp.isVisible('.brief__h'))
  check('브리프에 실제 수집 건수', /\d{3}건/.test(await dp.textContent('.brief')))
  // 박스 미선택 상태에서도 패널이 비지 않는다
  check('OPS 기본 상태 안내', (await dp.textContent('.ops')).includes('형식마다'))
  await dp.click('.bcard')
  await dp.waitForSelector('.ops__kpis', { timeout: 10000 })
  const opsS1 = (await dp.textContent('.ops__kpis')).match(/([\d.]+%)/)?.[1]
  const userS = (await dp.textContent('.now__num')).trim()
  check('OPS와 유저 화면의 확률이 문자 단위로 일치', opsS1 === userS, `${opsS1} vs ${userS}`)
  await dp.click('text=바로')
  await dp.waitForFunction(() => document.querySelectorAll('.av.is-in').length === 10, null, { timeout: 20000 })
  await dp.waitForTimeout(400)
  const opsS2 = (await dp.textContent('.ops__kpis')).match(/([\d.]+%)/)?.[1]
  check('참여자가 늘면 OPS가 실시간 갱신', opsS2 !== opsS1, `${opsS1} → ${opsS2}`)
  check('OPS에 곡선 렌더', await dp.isVisible('.ops .curve__line'))
  // 수식·이유·이점이 실시간 값과 함께 붙어 있어야 한다
  const opsText = await dp.textContent('.ops')
  check('OPS에 확률 수식', opsText.includes('P(S) = 재고비율 × 부스트'))
  check('OPS 수식이 실시간 값', (await dp.textContent('.opsw__eq')).includes(opsS2))
  check('OPS에 설계 이유', opsText.includes('부스트는 어디서 나오나'))
  check('OPS에 이점 설명', opsText.includes('이 설계의 이점'))
  check('OPS에 학술·규제 근거', opsText.includes('Bass (1969)') && opsText.includes('게임산업법'))
  // CTA가 스크롤 중 본문 바닥에 딱 붙는지 — 캐스케이드 순서 버그로 72px 떠 있던 적이 있다
  await dp.evaluate(() => { document.querySelector('.body').scrollTop = 300 })
  await dp.waitForTimeout(250)
  const ctaGap = await dp.evaluate(() => {
    const cta = document.querySelector('.cta').getBoundingClientRect()
    const body = document.querySelector('.body').getBoundingClientRect()
    return Math.round(body.bottom) - Math.round(cta.bottom)
  })
  check('CTA가 본문 바닥에 밀착', Math.abs(ctaGap) <= 1, `${ctaGap}px 떠 있음`)
  await desk.close()
}

// 13. 홈 탭 — 실제 올웨이즈 구조를 따라가는지. 눌러도 아무 일 없는 컨트롤이 없어야 한다.
{
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.bcard', { timeout: 20000 })
  await page.click('.tabbar__b:nth-child(1)')
  await page.waitForSelector('.pcard', { timeout: 10000 })
  check('Alwayz 워드마크', (await page.textContent('.top__logo')) === 'Alwayz')
  check('카테고리 6개', (await page.$$('.cats__b')).length === 6)
  check('퀵메뉴 6개', (await page.$$('.quick__t')).length === 6)
  check('섹션 헤더 존재', (await page.$$('.shead')).length >= 3)

  const before = (await page.$$('.pcard')).length
  await page.fill('.hsearch input', '리자몽')
  await page.waitForTimeout(400)
  const after = (await page.$$('.pcard')).length
  check('검색이 실제로 동작', after > 0 && after < before, `${before} → ${after}건`)

  await page.fill('.hsearch input', '')
  await page.click('.cats__b:nth-child(4)')
  await page.waitForTimeout(400)
  check('카테고리 전환 동작', (await page.textContent('.shead h2')).includes('포켓몬'))
  check('카드에 별점 렌더', (await page.$$('.pcard__rate')).length > 0)
  check('카드에 스펙 칩 렌더', (await page.$$('.chip2')).length > 0)
  check('가로 넘침 없음 — 홈', (await spill(page)).length === 0, (await spill(page)).join(' | '))
}

check('콘솔 에러 없음', errors.length === 0, errors.slice(0, 2).join(' | '))
await browser.close()
console.log(fail === 0 ? '\n✅ 전부 통과' : `\n❌ 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
