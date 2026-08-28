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

// 1. 진입
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.bcard', { timeout: 20000 })
check('박스 3종 노출', (await page.$$('.bcard')).length === 3)
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

// 8. 정직성 시트
await page.click('.top__q')
await page.waitForSelector('.sheet', { timeout: 5000 })
const sheet = await page.textContent('.sheet')
check('수식 공개', sheet.includes('매입 원가율') && sheet.includes('고객 획득비 회수'))
check('가정 명시', sheet.includes('모델 가정'))
check('꽝 없는 이유 3층', sheet.includes('수집 단계에서'))

check('콘솔 에러 없음', errors.length === 0, errors.slice(0, 2).join(' | '))
await browser.close()
console.log(fail === 0 ? '\n✅ 전부 통과' : `\n❌ 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
