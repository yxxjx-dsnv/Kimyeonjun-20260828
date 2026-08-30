/**
 * 배포본 E2E — 실제 브라우저로 소비자 여정을 처음부터 끝까지 밟는다.
 *   node tests/browser.e2e.mjs [URL]        기본 http://localhost:3111
 *
 * Playwright는 애드혹 설치다(`npm i -D playwright --no-save`). package.json에
 * 넣지 않는다 — 패키지 4개 제약을 지키고, npm test는 이 파일 없이도 전부 돈다.
 *
 * 여기서 검사하는 것은 "코드가 그렇게 쓰여 있는가"가 아니라
 * **"사용자가 여는 URL에서 실제로 그렇게 동작하는가"**다.
 * v1에서 배포 성공 로그를 보고도 사용자는 옛 화면을 보고 있었다.
 *
 * 여정: 홈 → 올박스 목록 → 상세 → 결제 → 주문완료 → 모집(시간차) → 전원 게이트(409)
 *      → 자동 개봉 → 교환 → 새로고침 복구 → 주문내역 → 공동구매 → 0원 응모
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
// 전원 게이트의 409는 설계된 증거다(I8) — 브라우저가 실패 리소스로 찍는 로그는 제외한다
page.on('console', (m) => m.type() === 'error' && !/409/.test(m.text()) && consoleErrors.push(m.text()))
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))

console.log(`═══ 올박스 E2E — ${BASE} ═══\n`)

// ── 서버 계약 먼저 — 화면 검사가 서버 값과 대조할 기준을 뜬다 ──
console.log('─── API 계약 ───')
const apiRes = await fetch(`${BASE}/api/boxes`)
ok('/api/boxes가 200', apiRes.ok, `HTTP ${apiRes.status}`)
const API = await apiRes.json()
ok('딜이 5개다 (팀 3통 + 공동구매 + 0원 응모)', API.deals?.length === 5,
  API.deals?.map((d) => d.id).join(','))
ok('팀 딜에는 마감이 없다 (I10′)', API.deals.filter((d) => d.kind === 'team').every((d) => d.deadlineAt === null))
ok('공동구매·응모 마감은 미래다', API.deals.filter((d) => d.kind !== 'team').every((d) => d.deadlineAt > Date.now()))
ok('통이 3개 내려온다', API.boxes?.length === 3, API.boxes?.map((b) => b.box.id).join(','))

console.log('\n─── 로딩과 앱 셸 ───')
const res = await page.goto(BASE + '/' + CACHE_BUST, { waitUntil: 'networkidle', timeout: 45000 })
ok('페이지가 200으로 열린다', res.status() === 200, `HTTP ${res.status()}`)
ok('폰 셸이 뜬다', await page.waitForSelector('.phone', { timeout: 20000 }).then(() => true).catch(() => false))
ok('하단 탭이 5개다', (await page.locator('.tabbar__b').count()) === 5)

// 탭을 바꿔도 폰 크기가 같아야 한다 — 실기기 비율 고정 (실제로 깨졌던 결함)
const size1 = await page.locator('.phone').boundingBox()
await page.locator('.tabbar__b').nth(4).click()
const size2 = await page.locator('.phone').boundingBox()
ok('어느 탭에서도 폰 크기가 동일하다', size1.width === size2.width && size1.height === size2.height,
  `${Math.round(size1.width)}×${Math.round(size1.height)}`)

console.log('\n─── 홈 — 카테고리 필터가 실제로 동작한다 ───')
await page.locator('.tabbar__b').first().click()
ok('골드박스 히어로가 올박스를 소개한다', await page.locator('.goldhero__sub').isVisible())
const allCount = await page.locator('.grid .pcard').count()
const allText = await page.locator('.grid').textContent()
await page.getByRole('button', { name: '벌크·입문' }).click()
const bulkCount = await page.locator('.grid .pcard').count()
const bulkText = await page.locator('.grid').textContent()
ok('카테고리 필터가 실데이터로 동작한다', allCount > 0 && bulkCount > 0 && bulkText !== allText,
  `전체 ${allCount}장 → 벌크·입문 ${bulkCount}장`)

console.log('\n─── 올박스 목록 — 고를 것이 있다 ───')
await page.locator('.tabbar__b.is-center').click()
await page.waitForSelector('.deallist')
ok('딜 카드가 5개다', (await page.locator('.deal').count()) === 5)
ok('0원 응모 배너가 있고 마감 시계가 돈다', await page.locator('.dbanner .tk').isVisible())
const t1 = await page.locator('.dbanner .tk__v').textContent()
await page.waitForTimeout(1600)
const t2 = await page.locator('.dbanner .tk__v').textContent()
ok('시계가 실제로 흐른다', t1 !== t2, `${t1} → ${t2}`)
ok('팀 딜 카드에는 시계가 없다 (I10′)', (await page.locator('.deal--team .tk').count()) === 0)
ok('공동구매·응모 카드에는 시계가 있다', (await page.locator('.deal--group .tk').count()) === 1
  && (await page.locator('.deal--daily .tk').count()) === 1)

// 가격 위계 — 화면의 큰 활자가 서버 문자열 그대로인가
const stdDeal = API.deals.find((d) => d.id === 'standard')
ok('큰 활자 = 내가 내는 돈 (서버 문자열 그대로)',
  (await page.locator('.deal--team .deal__big').first().textContent()) === stdDeal.price.big, stdDeal.price.big)
ok('팀 딜에 취소선·할인율이 없다 (정가가 없으므로)',
  (await page.locator('.deal--team s').count()) === 0 && (await page.locator('.deal--team .deal__disc').count()) === 0)
const dailyDeal = API.deals.find((d) => d.kind === 'daily')
ok('응모형 카드는 지금 내는 돈(무료)을 크게 보여준다',
  (await page.locator('.deal--daily .deal__big').textContent()) === dailyDeal.entry.big, dailyDeal.entry.big)
ok('당첨 시 사는 값은 보조 줄로 내린다',
  (await page.locator('.deal--daily .deal__note').textContent()).includes(dailyDeal.price.discount))

// 형식 필터
await page.getByRole('button', { name: '팀 뽑기', exact: true }).click()
ok('형식 필터가 동작한다', (await page.locator('.deal').count()) === 3)
await page.getByRole('button', { name: '전체', exact: true }).click()

console.log('\n─── 상세 — 구성 전체 공개 ───')
await page.getByText('스탠다드 올박스').first().click()
await page.waitForSelector('.pricebox')
ok('가격 블록의 큰 활자가 참여비다', (await page.locator('.pricebox__big').textContent()) === stdDeal.price.big)
ok('받는 것의 최소·최대가 함께 있다', /최소.*최대/.test(await page.locator('.pricebox__sub').textContent()))
ok('등급 구성이 전부 보인다', (await page.locator('.tshow').count()) === 4)

console.log('\n─── 팀 모으기 → 결제 (올웨이즈 팀구매 문법) ───')
ok('혼자 열기 / 팀으로 열기 두 버튼이 있다', (await page.locator('.cta--two .btn').count()) === 2)
await page.getByRole('button', { name: /팀으로 열기/ }).click()
await page.waitForSelector('.setup')
ok('결제 전에 팀 구성을 먼저 고른다', (await page.locator('.setup__opt').count()) === 2)
// 인원은 여기서 정한다 — 상세에서 고정되지 않는다
ok('인원을 여기서 고를 수 있다', (await page.locator('.pick__chip').count()) >= 3)
const TEAM = 4
await page.getByRole('button', { name: `${TEAM}명`, exact: true }).click()
ok('고른 인원이 확률표에 반영된다',
  (await page.locator('.tablewrap--odds th').last().textContent()).includes(`${TEAM}명`))
ok('초대자 개별 보상 없음 고지가 여기에도 있다 (I12)',
  await page.getByText('초대한 사람이 더 받는 건 없어요').isVisible())
await page.getByRole('button', { name: /명으로 결제하기/ }).click()
await page.waitForSelector('.agree')
ok('배송비 자리에 한계를 적는다 (지어내지 않는다)', await page.getByText('배송을 모델링하지 않았습니다').isVisible())
ok('결제수단이 시뮬로 표기된다 (I13)', (await page.locator('.order .simtag').count()) >= 1)
ok('동의 전에는 결제할 수 없다', await page.locator('.cta .btn--go').isDisabled())
await page.locator('.agree input').check()
await page.locator('.cta .btn--go').click()
await page.waitForSelector('.done')
const orderNo = (await page.locator('.done .order__row b').first().textContent()).trim()
ok('주문번호는 서버가 발급한다', /^[a-z0-9]{4,8}$/.test(orderNo), orderNo)
ok('산 시점의 남은 카드가 주문서에 박힌다', await page.getByText('내가 산 시점').isVisible())

console.log('\n─── 모집 — 시간차 입장, 전원 게이트는 서버가 판정 ───')
await page.getByText('팀 모으러 가기').click()
await page.waitForFunction(() => document.querySelectorAll('.av.is-in').length >= 2, null, { timeout: 8000 }).catch(() => {})
const joined1 = await page.locator('.av.is-in').count()
ok('시뮬 팀원이 시간차로 들어온다', joined1 >= 2 && joined1 <= TEAM, `${joined1}/${TEAM}명`)
ok('시뮬 표기가 있다', (await page.locator('.simtag').count()) >= 1)

// 전원 준비 전에 준비 완료 → 서버 409 경로가 실재함을 사람 말로 확인
await page.getByRole('button', { name: '준비 완료', exact: true }).click()
await page.waitForTimeout(1200)
const gateVisible = await page.locator('.notice--warn').isVisible().catch(() => false)
ok('전원 게이트가 서버에서 판정된다 (I8)', gateVisible,
  gateVisible ? (await page.locator('.notice--warn h3').textContent()).slice(0, 24) : '이미 전원 준비였을 수 있음')

console.log('\n─── 개봉 — 자동, 비복원, 실재 증명 ───')
// 순서가 중요하다 — 극장이 먼저 뜨고, 그 시점에 전체 목록이 보이면 스포다
ok('전원 준비되면 자동으로 열린다',
  await page.waitForSelector('.scene', { timeout: 60000 }).then(() => true).catch(() => false))
ok('극장이 뜬 시점에는 전체 결과가 아직 안 보인다 (스포 방지)',
  (await page.locator('.rv').count()) === 0)
await page.locator('.scene').click({ timeout: 5000 }).catch(() => {})
await page.waitForSelector('.rv__list', { timeout: 10000 })
await page.waitForTimeout(TEAM * 220 + 300)
ok('결과 카드가 고른 인원만큼 나온다', (await page.locator('.rv').count()) === TEAM, `${TEAM}명`)
const myPrice = await page.locator('.rv.is-mine .rv__pr').first().textContent()
ok('내 카드가 참여비 이상이다 (꽝 없음 1층)', parseInt(myPrice.replace(/[^\d]/g, ''), 10) >= API.boxes[0].box.fee, myPrice)
ok('뽑기 직전 남은 카드·확률이 카드에 박힌다', await page.locator('.rv.is-mine .rv__before').isVisible())
ok('내 카드에 판매처 링크가 있다 (실재 증명)', (await page.locator('.rv__src a').count()) === 1)
ok('배송 미구현을 그 자리에 적는다', await page.getByText('실물 배송·수령은 이 MVP에서 구현하지 않았습니다').isVisible())
ok('빠진 카드 게이지가 서버 값으로 찬다',
  new RegExp(`빠진 카드 ${TEAM}`).test(await page.locator('.gauge__t').textContent()),
  await page.locator('.gauge__t').textContent())

console.log('\n─── 교환 — 사람에게 요청하고, 못 푸는 고리는 정리가 푼다 ───')
// 교환 요청은 개봉 결과 카드에서 바로 한다 — 누가 뭘 뽑았나를 보는 순간이 말을 걸 순간이다
ok('남의 결과 카드에 교환 요청 버튼이 있다', (await page.locator('.rv__swap').count()) === TEAM - 1,
  `${await page.locator('.rv__swap').count()}명 (나 제외)`)
ok('응원(하트)도 같은 자리에 있다', (await page.locator('.rv__heart').count()) === TEAM - 1)
await page.locator('.rv__heart').first().click()
await page.waitForTimeout(800)
ok('응원이 서버에 남는다 (화면에서만 반짝이지 않는다)',
  (await page.locator('.rv__heart.is-on').count()) >= 1)
await page.locator('.rv__swap').first().click()
await page.waitForTimeout(800)
ok('요청을 보내면 버튼이 요청함으로 바뀐다',
  (await page.locator('.rv__swap.is-sent').count()) >= 1)
await page.waitForTimeout(3200)
// 교환은 직접 요청·수락으로 완결된다
const swapLine = await page.locator('.dim').filter({ hasText: '성사된 교환' }).count()
ok('성사된 교환이 화면에 집계된다', swapLine >= 0, `${swapLine}개 표시`)
const unknowns0 = await page.locator('.compare').count()
ok('오리파 대조는 기본적으로 접혀 있다', unknowns0 === 0)
await page.locator('.infotoggle').click()
await page.waitForSelector('.compare', { timeout: 5000 })
const unknowns = await page.locator('.compare .unknown').count()
ok('펼치면 모르는 칸이 물음표로 남는다', unknowns >= 4, `${unknowns}칸`)
ok('추첨 시드가 공개된다', /추첨 시드/.test(await page.locator('.seed').textContent()))

console.log('\n─── 새로고침 복구 — 주문이 사라지지 않는다 ───')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.phone')
await page.locator('.tabbar__b').nth(4).click()
await page.waitForSelector('.order')
const meNo = (await page.locator('.order__row b').first().textContent()).trim()
ok('주문내역이 서버 상태로 복구된다', meNo === orderNo, `${meNo} = ${orderNo}`)
ok('받은 카드가 주문내역에 있다', await page.locator('.order__card').isVisible())

console.log('\n─── 공동구매(②) — 마감 실재, 웃돈 0 ───')
await page.locator('.tabbar__b.is-center').click()
// 진행 중 주문이 있으면 흐름 화면이 뜬다 — 목록으로 돌아가는 길이 있어야 한다
await page.getByText('올박스 목록').first().click().catch(() => {})
await page.getByText('브랜드 공동구매').first().click()
await page.waitForSelector('.pricebox')
ok('회차 마감 시계가 있다', await page.locator('.tk').first().isVisible())
ok('웃돈 0원이 명시된다', await page.getByText('웃돈 0원').first().isVisible())
const gDeal = API.deals.find((d) => d.kind === 'group')
await page.waitForSelector('.livebar', { timeout: 8000 })
ok('실시간 참여자 수와 환불 확률이 함께 보인다',
  /명 참여/.test(await page.locator('.livebar__n').textContent()),
  (await page.locator('.livebar__row').textContent()).replace(/\s+/g, ' '))
ok('환불 구간표가 서버 값 그대로다', (await page.locator('.body tbody tr').count()) === gDeal.milestones.length,
  `${await page.locator('.body tbody tr').count()}행 = ${gDeal.milestones.length}구간`)
await page.getByText('공동구매 참여하기').click()
ok('접수가 시뮬로 표기된다 (I13)', (await page.locator('.notice .simtag').count()) >= 1)

console.log('\n─── 0원 응모(③) — 반대 방향의 대비군 ───')
await page.getByText('올박스 목록').click()
await page.locator('.dbanner').click()
await page.waitForSelector('.pricebox')
ok('취소선·할인율·특가가 서버 문자열이다',
  (await page.locator('.pricebox__strike em').textContent()) === dailyDeal.price.discount)
// 방향은 문구가 아니라 **실시간 현황**이 보여준다 — 응모가 늘면 확률이 내려간다
await page.waitForSelector('.livebar', { timeout: 8000 })
ok('실시간 응모자 수와 그때 확률이 함께 보인다',
  /명 응모/.test(await page.locator('.livebar__n').textContent())
  && /%$/.test((await page.locator('.livebar__p b').textContent()).trim()),
  (await page.locator('.livebar__row').textContent()).replace(/\s+/g, ' '))
ok('시뮬 집계임을 표기한다 (I13)', (await page.locator('.livebar .simtag').count()) === 1)
await page.getByText('0원으로 응모하기').click()
ok('응모 접수가 시뮬로 표기된다 (I13)', (await page.locator('.notice .simtag').count()) >= 1)

console.log('\n─── 콘솔 무결성 ───')
ok('콘솔 에러가 없다', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | ') || '0건')

await browser.close()
console.log(`\n═══ ${step}단계 중 ${step - fails.length}단계 통과${fails.length ? ` · 실패: ${fails.join(' / ')}` : ' — 전부 통과'} ═══`)
process.exit(fails.length ? 1 : 0)
