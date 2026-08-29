/**
 * 배포본 E2E — 실제 브라우저로 클릭해서 확인한다.
 *   node tests/browser.e2e.mjs [URL]        기본 http://localhost:3111
 *
 * Playwright는 애드혹 설치다(`npm i -D playwright --no-save`). package.json에
 * 넣지 않는다 — 패키지 4개 제약을 지키고, npm test는 이 파일 없이도 전부 돈다.
 *
 * 여기서 검사하는 것은 "코드가 그렇게 쓰여 있는가"가 아니라
 * **"사용자가 여는 URL에서 실제로 그렇게 동작하는가"**다.
 * v1에서 배포 성공 로그를 보고도 사용자는 옛 화면을 보고 있었다.
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] || 'http://localhost:3111').replace(/\/$/, '')
const CACHE_BUST = `?v=${Math.random().toString(36).slice(2)}`

let step = 0
const fails = []
const ok = (name, cond, detail) => {
  step++
  if (!cond) fails.push(name)
  console.log(`  ${cond ? '✓' : '✗'} ${String(step).padStart(2)}. ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const consoleErrors = []
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

console.log(`═══ 올박스 E2E — ${BASE} ═══\n`)
console.log('─── 로딩과 첫 화면 ───')

const res = await page.goto(BASE + '/' + CACHE_BUST, { waitUntil: 'networkidle', timeout: 45000 })
ok('페이지가 200으로 열린다', res.status() === 200, `HTTP ${res.status()}`)
ok('통이 렌더될 때까지 도달한다', await page.waitForSelector('.boxgrid', { timeout: 20000 }).then(() => true).catch(() => false))

const h1 = await page.locator('h1').first().textContent()
ok('첫 화면이 문제를 제시한다', /통이 안 보입니다/.test(h1), h1?.slice(0, 30))
ok('타깃이 첫 화면에 명시된다', await page.getByText('30~40대 부모').first().isVisible())

const measure = await page.locator('.measure').textContent()
ok('오리파 실측이 첫 화면에 있다', /확률을 적어 둔 상품/.test(measure) && /\d+ \/ \d+건/.test(measure),
  measure.match(/\d+ \/ \d+건/)?.[0])
ok('실측의 한계를 함께 적는다', /중개 링크라 판매자 상세 페이지에 도달할 수 없었습니다/.test(measure))

console.log('\n─── 통 공개 ───')
const cells = await page.locator('.cell').count()
ok('구좌를 전부 그린다 (요약하지 않는다)', cells === 1000, `${cells}칸`)
const [s, a, b, c] = await Promise.all(['S', 'A', 'B', 'C'].map((t) => page.locator(`.cell.t-${t}`).count()))
ok('등급별 칸 수가 재고와 같다', s === 1 && a === 4 && b === 25 && c === 970, `S${s} A${a} B${b} C${c}`)
ok('통 안 카드가 실제 상품 이미지와 함께 보인다', (await page.locator('.cardpick img').count()) > 0,
  `${await page.locator('.cardpick img').count()}장`)

console.log('\n─── 팀 확률과 고지 (I11 · I12) ───')
const teamNotice = await page.getByText('팀 인원이 늘면 무엇이 어떻게 달라지는지').isVisible()
ok('팀 효과 고지가 화면 본문에 있다 (툴팁·더보기 아님)', teamNotice)
ok('초대자 추가 보상 없음을 명시한다', await page.getByText('초대한 사람에게 추가 보상은 없습니다').isVisible())
const oddsText = await page.locator('table').first().textContent()
ok('확률 옆에 자연빈도가 병기된다 (D10)', /\d{1,3}(,\d{3})*명 중/.test(oddsText), oddsText.match(/[\d,]+명 중 [^\s]+/)?.[0])
ok('초기하분포 식이 화면에 노출된다', await page.locator('.formula').first().isVisible())
const mulCells = await page.locator('table').first().textContent()
ok('K=1은 정확히 n배, K>1은 아니라고 적는다',
  /재고가 1장이라 정확히 n배/.test(mulCells) && /재고가 여러 장이라 n배보다 작다/.test(mulCells))

console.log('\n─── 팀 만들기 · 지목 · ChatGPT ───')
await page.getByRole('button', { name: /명으로 팀 만들기/ }).click()
await page.waitForSelector('text=내 지목', { timeout: 30000 })
ok('방이 만들어지고 참여 화면이 열린다', await page.getByText('내 지목').isVisible())

await page.locator('.cardpick').first().click()
await page.waitForTimeout(800)
ok('통 안 카드를 지목할 수 있다', (await page.locator('.cardpick[aria-pressed="true"]').count()) > 0)

await page.getByRole('button', { name: '팀원들 취향 정하기' }).click()
await page.waitForTimeout(3000)
ok('팀원 지목이 집계된다', /명 지목/.test(await page.locator('.cardlist').first().textContent()))

await page.getByRole('button', { name: '2순위 이하 순위 만들기' }).click()
await page.waitForSelector('.badge.ai, .badge.rule', { timeout: 40000 })
const aiBadge = await page.locator('.panel').filter({ hasText: 'AI에게 순위 맡기기' }).locator('.badge').first().textContent()
ok('AI 순위 생성이 응답하고 출처를 배지로 밝힌다', /ChatGPT|규칙 기반/.test(aiBadge), aiBadge)

console.log('\n─── 전원 게이트 (I8) — 서버가 판정한다 ───')
await page.getByRole('button', { name: '통 열기' }).click()
const gate = await page.waitForSelector('text=/서버 응답 409/', { timeout: 15000 }).then(() => true).catch(() => false)
ok('준비 전 개봉이 서버 409로 막힌다 (프론트 방어가 아니다)', gate)
const gateText = gate ? await page.locator('.notice').filter({ hasText: '서버 응답' }).textContent() : ''
ok('누가 안 눌렀는지 서버가 알려준다', /아직 안 누른 사람/.test(gateText))

await page.getByRole('button', { name: '전원 준비시키기' }).click()
await page.waitForTimeout(4000)
await page.getByRole('button', { name: '통 열기' }).click()
await page.waitForSelector('text=뽑힌 카드는 통에서 빠집니다', { timeout: 20000 })
ok('전원 준비 후에는 열린다', await page.getByText('뽑힌 카드는 통에서 빠집니다').isVisible())

console.log('\n─── 비복원 (I3) ───')
await page.waitForTimeout(3500)
const gone = await page.locator('.cell.gone').count()
ok('뽑힌 구좌가 통에서 꺼진다', gone === 10, `${gone}칸`)
const topbar = await page.locator('.topbar-count').textContent()
ok('남은 구좌가 줄어든 것이 상단에 보인다', /990/.test(topbar), topbar?.trim())
const openTable = await page.locator('table').filter({ hasText: '뽑기 직전 남은 구좌' }).textContent()
ok('뽑을 때마다 확률이 갱신된 것이 기록된다', /1,000구좌/.test(openTable) && /991구좌/.test(openTable))
const first = openTable.match(/0\.100%/), later = openTable.match(/0\.101%/)
ok('갱신된 확률이 실제로 다르다', !!first && !!later, '0.100% → 0.101%')
const upd = await page.locator('table').filter({ hasText: '구좌 소진' }).textContent()
ok('성립 불가능한 갱신 상태는 —로 표시된다 (I17)', upd.includes('—'))

console.log('\n─── 교환 (I5) ───')
await page.getByRole('button', { name: '교환 실행' }).click()
await page.waitForSelector('text=이 교환에서 아무도 손해 보지 않습니다', { timeout: 20000 })
const cycles = await page.locator('.cycle').count()
ok('교환 고리가 화면에 그려진다', cycles > 0, `${cycles}개`)
const cycleText = cycles ? await page.locator('.cycle').first().textContent() : ''
ok('고리가 A → B → A 형태로 보인다', (cycleText.match(/→/g) || []).length >= 2, cycleText.replace(/\s+/g, ' ').slice(0, 40))
const tradeText = await page.locator('table').filter({ hasText: '교환 전' }).textContent()
ok('교환 전/후와 개선 여부가 참여자별로 보인다', /선호 \d+단계 개선|그대로/.test(tradeText))
ok('나빠진 사람이 없다', !tradeText.includes('나빠짐'))
ok('개별 합리성의 출처를 밝힌다', /Gale의 Top Trading Cycles/.test(await page.locator('.notice').filter({ hasText: '손해' }).textContent()))
const convText = await page.locator('table').filter({ hasText: '같은 걸 원한 사람' }).textContent()
ok('교환 전환율 표가 있고 100%가 아니다', /%/.test(convText) && !/100\.0%/.test(convText))
ok('선호가 같을 때와 다를 때를 나란히 보여준다', /선호가 서로 다를 때/.test(convText) && /선호가 모두 같을 때/.test(convText))

console.log('\n─── 대조 뷰 ───')
const cmp = await page.locator('.compare').textContent()
ok('오리파 / 혼자 / 팀 세 칸이 있다', /오리파 \(실제 시장\)/.test(cmp) && /혼자 열기/.test(cmp) && /팀으로 열기/.test(cmp))
const unknowns = await page.locator('.compare .unknown').count()
ok('오리파 칸이 물음표로 남는다 (추정치로 채우지 않았다)', unknowns >= 4, `${unknowns}칸`)
ok('혼자·팀 칸은 실제 엔진 결과다', /0\.100%/.test(cmp) && /1\.000%/.test(cmp))
const seed = await page.locator('.mono').filter({ hasText: '추첨 시드' }).textContent()
ok('시드가 노출돼 재현 가능하다', /추첨 시드 \S+\|\S+\|\S+\|\d/.test(seed), seed?.trim().slice(0, 46))

console.log('\n─── 근거 시트 · 금지 (I10) ───')
const ev = await page.locator('.section').last().textContent()
ok('무엇이 정의·정리·실측·가정·미검증인지 구분한다',
  /정의/.test(ev) && /정리/.test(ev) && /실측/.test(ev) && /가정/.test(ev) && /미검증/.test(ev))
ok('시뮬레이션 범위를 밝힌다', /팀원 · 교환 상대 · 10만 회 분포는 시뮬레이션/.test(ev))
const body = await page.locator('body').textContent()
const FORBIDDEN = ['얼마 안 남', '서두르', '마감 임박', '지금 바로', '놓치지', '마지막 기회']
const found = FORBIDDEN.filter((w) => body.includes(w))
ok('희소성 압박 문구가 화면에 없다', found.length === 0, found.join(', ') || '없음')
ok('시뮬 배지가 화면에 있다 (I13)', (await page.locator('.badge.sim').count()) > 0)

console.log('\n─── 응답 헤더 · 콘솔 ───')
const boxesRes = await page.request.get(`${BASE}/api/boxes${CACHE_BUST}`)
const cc = boxesRes.headers()['cache-control'] || ''
ok('/api/boxes 캐시가 s-maxage=60', /s-maxage=60/.test(cc), cc)
ok('/api/boxes에 stale-while-revalidate가 있다', /stale-while-revalidate=600/.test(cc))
const bj = await boxesRes.json()
ok('배포본이 이번 크롤 데이터를 쓴다', bj.box?.crawledAt?.startsWith('2026-08-29'), bj.box?.crawledAt)
ok('통 구성이 코드와 일치한다', bj.box?.N === 1000 && bj.box?.tiers?.length === 4)

const realErrors = consoleErrors.filter((e) => !/409/.test(e))
ok('예상치 못한 콘솔 에러가 없다 (409는 게이트 시연이므로 제외)',
  realErrors.length === 0, realErrors.slice(0, 2).join(' / ') || '없음')

console.log(`\n  ${step - fails.length}/${step}단계 통과${fails.length ? ` · 실패: ${fails.join(', ')}` : ''}`)
await browser.close()
if (fails.length) process.exitCode = 1
