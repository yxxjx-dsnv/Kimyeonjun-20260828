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
check(`공동구매 ${meta.groupbuys.length}종 노출`, (await page.$$('.gbcard')).length === meta.groupbuys.length)
check('탭바에 올박스', await page.isVisible('.tabbar__b.is-center'))

// 2. 박스 진입 — 확률 곡선과 등급 막대
await page.click('.bcard')
await page.waitForSelector('.curve__svg', { timeout: 10000 })
check('확률 곡선 렌더', await page.isVisible('.curve__line'))
check('등급 막대 4개', (await page.$$('.bars__row')).length === 4)
const oddsAlone = await page.textContent('.now__num')
check('자연빈도 병기', (await page.textContent('.now__nf')).includes('명 중 약'))

// 3. 더보기 표
await page.click('.more__btn')
await page.waitForSelector('.otable', { timeout: 5000 })
check('더보기 표 1~10명', (await page.$$('.otable tbody tr')).length === 10)
await page.click('.more__btn')

// 4. 취향 대화 (ChatGPT) — 키가 없으면 규칙 기반으로 내려앉는다
await page.click('text=손주 줄 것도 넣어서')
await page.waitForSelector('.tiers__note', { timeout: 40000 })
check('취향 구성 반영', (await page.textContent('.tiers__note')).includes('좁혔습니다'))

// 5. 인원 모으기 — 곡선 위의 점이 움직인다
await page.click('text=명 채우기')
await page.waitForFunction(() => document.querySelectorAll('.av.is-in').length === 10, null, { timeout: 20000 })
check('10명 모임', (await page.textContent('.rail__count')).includes('10'))
const oddsTeam = await page.textContent('.now__num')
check('팀이 커지자 확률 상승', parseFloat(oddsTeam) > parseFloat(oddsAlone), `${oddsAlone} → ${oddsTeam}`)

// 6. 전원 게이트 — 한 명이라도 안 누르면 안 열린다
await page.click('.btn--go')
await page.waitForTimeout(700)
const gate = await page.textContent('.btn--go')
check('게이트 진행 표시', /뽑기 \d+\/10/.test(gate), gate.trim())
check('게이트 안내 문구', await page.isVisible('.gatenote'))

// 7. 개봉과 정산
await page.waitForSelector('.rvlist', { timeout: 60000 })
check('참여자 수만큼 결과', (await page.$$('.rv')).length === 10)
// '내가 받은 것' 요약 카드에도 정산이 있으므로 참여자 카드 안으로 한정한다.
const deltas = await page.$$eval('.rv .rv__delta, .rv .rv__even', (els) => els.map((e) => e.textContent))
check('정산 표기 10건', deltas.length === 10, deltas.slice(0, 3).join(' '))
check('음수 차액 없음', deltas.every((d) => !d.includes('-')), deltas.join(' '))
check('재추첨 불가 안내', (await page.textContent('.seed')).includes('같은 방'))

// 가로 넘침 — 결과 카드가 뷰포트를 넘어 시가가 잘렸던 적이 있다(grid item의 min-width:auto).
// 눈으로만 잡히는 결함이라 검사로 못 박는다.
const spill = await page.evaluate(() => {
  const W = window.innerWidth
  return [...document.querySelectorAll('body *')]
    .filter((e) => Math.round(e.getBoundingClientRect().right) > W + 1)
    .slice(0, 4)
    .map((e) => `${e.tagName}.${String(e.className).slice(0, 30)}`)
})
check('가로 넘침 없음', spill.length === 0, spill.join(' | '))

// 8. 공동구매형 — 상품 확정, 확률은 '얼마를 내는가'에만
{
  const gb = meta.groupbuys[0]
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.click('.gbcard')
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
  const free = (await page.$$('.freetag')).length
  const all = (await page.$$('.rv')).length
  check('발주 결과에 무료 당첨자', free >= 1 && free < all, `${free}/${all}명`)
  const gd = await page.$$eval('.rv .rv__delta, .rv .rv__even', (els) => els.map((e) => e.textContent))
  check('공동구매도 손해 없음', gd.length === all && gd.every((d) => !d.includes('-')))
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
}

// 10. 뽑기 통과 천장
{
  // networkidle을 쓰지 않는다 — 데일리 화면을 거친 뒤로는 앱이 주기적으로
  // 상태를 확인해 idle이 오지 않는다. 필요한 요소가 뜨는 것으로 판단한다.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.blist li:nth-child(2) .bcard', { timeout: 20000 })
  await page.click('.blist li:nth-child(2) .bcard')
  await page.waitForSelector('.bin', { timeout: 10000 })
  check('뽑기 통 4등급', (await page.$$('.bin__row')).length === 4)
  const tot = await page.textContent('.bin__tot')
  check('총 구좌 표기', /[\d,]+구좌/.test(tot), tot)
  check('천장 바 존재', await page.isVisible('.pity'))
  await page.focus('.pity__sim input')
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(300)
  check('천장 도달 시 안내 변경', (await page.textContent('.pity__note')).includes('올라갑니다'))
}

// 11. 정직성 시트
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.top__q', { timeout: 20000 })
await page.click('.top__q')
await page.waitForSelector('.sheet', { timeout: 5000 })
const sheet = await page.textContent('.sheet')
check('수식 공개', sheet.includes('매입 원가율') && sheet.includes('고객 획득비 회수'))
check('가정 명시', sheet.includes('모델 가정'))
check('포맷별 정직성 설명', sheet.includes('일부 형식의 속성'))
check('꽝 없는 형식의 3층 구조', sheet.includes('수집 단계에서'))
check('꽝 있는 형식도 명시', sheet.includes('이 형식에는 꽝이 있습니다'))
check('확률 출처 3가지', sheet.includes('재고 비율') && sheet.includes('손익분기') && sheet.includes('할인 여력'))
check('천장은 공시 대상', sheet.includes('보장형 시스템'))

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
    const rail = (s) => document.querySelector(`.rail2--${s}`)?.getBoundingClientRect()
    const seen = (b) => Boolean(b) && b.height > 0 && b.bottom > 0 && b.top < window.innerHeight
    return {
      frame: Math.round(document.querySelector('.phone').getBoundingClientRect().height),
      vh: window.innerHeight,
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
      bodyScrolls: body.scrollHeight > body.clientHeight + 1,
      rails: seen(rail('left')) && seen(rail('right')),
    }
  })
  check('폰 프레임이 뷰포트를 넘지 않음', m.frame <= m.vh, `${m.frame}px / ${m.vh}px`)
  check('페이지가 아니라 본문이 스크롤', !m.pageScrolls && m.bodyScrolls,
    `page=${m.pageScrolls} body=${m.bodyScrolls}`)
  check('데스크톱 레일 노출', m.rails)
  await desk.close()
}

check('콘솔 에러 없음', errors.length === 0, errors.slice(0, 2).join(' | '))
await browser.close()
console.log(fail === 0 ? '\n✅ 전부 통과' : `\n❌ 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
