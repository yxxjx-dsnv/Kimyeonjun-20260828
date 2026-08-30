/**
 * 화면 테스트 — 프레임워크 없이. `npm run build:ssr && node tests/render.test.mjs`
 *
 * 두 종류를 섞어 쓴다.
 *   렌더 검사  실제 SSR HTML을 보고 문자열을 대조한다. 소스만 읽으면 못 잡는 것이 있다.
 *   소스 검사  금지 문구·하드코딩처럼 "없어야 하는 것"은 소스에서 본다.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { render, OddsTable, UpdateTable, TradeTable, CycleView, BoxGrid, GridLegend, SimBadge, TierShowcase } from '../dist-ssr/ssr.js'
import { BOX, TIERS, slotsOf } from '../api/_box.js'
import { allOdds, updateTable } from '../api/_draw.js'
import { buildDeals } from '../api/boxes.js'
import { ttc, completePrefs } from '../api/_trade.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = (f) => readFileSync(join(ROOT, f), 'utf8')
const APP = src('src/App.jsx')
const PARTS = src('src/parts.jsx')

/**
 * 주석을 벗긴 소스. "금지 문구가 없다"류 검사는 반드시 이것으로 한다.
 * 코드에는 "v1의 카운트다운을 왜 뺐는지"가 주석으로 적혀 있고, 원본을 그대로 훑으면
 * 그 설명이 위반으로 잡힌다. 재려는 것은 "화면에 그 문구가 나오는가"이지
 * "소스 어딘가에 그 단어가 적혀 있는가"가 아니다.
 */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
const APP_CODE = strip(APP)
const PARTS_CODE = strip(PARTS)

let pass = 0
const fails = []
const t = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`) }
  catch (e) { fails.push(name); console.log(`  ✗ ${name}\n      ${e.message}`) }
}

const ODDS = allOdds()
const N = 10

/**
 * SSR HTML은 엔티티를 이스케이프한다. C등급 팀 확률 ">99.999%"의 '>'가 '&gt;'가 되어
 * 순진하게 includes로 비교하면 렌더가 멀쩡한데도 실패한다. 사람이 읽는 텍스트로 되돌린다.
 */
const decode = (h) => h.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
                       .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")

console.log('─────── I4 화면 숫자 = 서버 숫자 (문자 단위) ───────')

const oddsHtml = decode(render(h(OddsTable, { odds: ODDS, n: N })))

t('모든 개인 확률 문자열이 서버 계산 그대로 렌더된다', () => {
  for (const o of ODDS) assert.ok(oddsHtml.includes(o.soloPct), `${o.tier} 개인 ${o.soloPct} 없음`)
})

t('모든 팀 확률 문자열이 서버 계산 그대로 렌더된다', () => {
  for (const o of ODDS) {
    const s = o.team[N - 1].pct
    assert.ok(oddsHtml.includes(s), `${o.tier} 팀 ${s} 없음`)
  }
})

t('모든 배수 문자열이 서버 계산 그대로 렌더된다', () => {
  for (const o of ODDS) assert.ok(oddsHtml.includes(o.team[N - 1].mul), `${o.tier} 배수 없음`)
})

t('자연빈도가 모든 확률 옆에 존재한다 (D10)', () => {
  for (const o of ODDS) {
    assert.ok(oddsHtml.includes(o.soloFreq), `${o.tier} 개인 자연빈도 없음`)
    assert.ok(oddsHtml.includes(o.team[N - 1].freq), `${o.tier} 팀 자연빈도 없음`)
  }
})

t('K=1 등급만 "정확히 n배"라고 적는다 (반올림 금지, I16)', () => {
  const exact = ODDS.filter((o) => o.exactlyLinear)
  assert.equal(exact.length, 1)
  assert.equal(exact[0].team[N - 1].mul, `${N}.00배`)
  const nearly = ODDS.find((o) => !o.exactlyLinear && o.K > 1)
  assert.notEqual(nearly.team[N - 1].mul, `${N}.00배`, 'K>1인데 정확히 n배로 표시되면 안 된다')
  assert.ok(oddsHtml.includes('재고가 1장이라 정확히 n배'))
  assert.ok(oddsHtml.includes('재고가 여러 장이라 n배보다 작다'))
})

t('성립 불가능한 갱신 상태는 —로 표시된다 (I17)', () => {
  const ups = Object.fromEntries(TIERS.map((g) => [g, updateTable(g, [0, 250, 500, 750, 900, 990])]))
  const html = decode(render(h(UpdateTable, { updates: ups, tiers: TIERS })))
  const impossible = ups.C.filter((r) => !r.possible)
  assert.ok(impossible.length > 0, '검사할 불가능 구간이 있어야 한다')
  assert.ok(html.includes('—'), '불가능 구간이 —로 나와야 한다')
  assert.ok(!html.includes('100.000%') || ups.S.some((r) => r.pct === '100.000%'),
    '불가능한 상태가 100%로 표시되면 안 된다')
})

console.log('\n─────── 텍스트 노드 분리 (v1에서 깨진 지점) ───────')

t('숫자와 단위가 한 노드에 붙어 있다 — <!-- -->로 쪼개지지 않는다', () => {
  const legend = decode(render(h(GridLegend, { tiers: BOX.tiers })))
  for (const tier of BOX.tiers) {
    const s = `${tier.K.toLocaleString('ko-KR')}장`
    assert.ok(legend.includes(s), `"${s}"가 통째로 있어야 한다`)
  }
  assert.ok(!/\d<!-- -->/.test(legend), '숫자 뒤에 주석 노드가 끼면 안 된다')
})

t('확률 셀에도 주석 노드가 끼지 않는다', () => {
  assert.ok(!/\d<!-- -->%/.test(oddsHtml))
  for (const o of ODDS) assert.ok(oddsHtml.includes(`>${o.soloPct}<`), `${o.soloPct}가 한 노드여야 한다`)
})

console.log('\n─────── 교환 뷰가 엔진 출력과 일치하는가 ───────')

const UNIVERSE = [...new Map(slotsOf().map((s) => [s.id, s])).values()]
const drawn = slotsOf().filter((_, i) => i % 97 === 0).slice(0, 6)
const parts = drawn.map((d, i) => ({
  id: `p${i}`, holding: d.id,
  prefs: completePrefs({ target: drawn[(i + 2) % drawn.length].id, universe: UNIVERSE }),
}))
const out = ttc(parts, 'render-test')
const byId = new Map(UNIVERSE.map((c) => [c.id, c]))
const tradeRows = out.results.map((x) => {
  const b = byId.get(x.before), a = byId.get(x.after)
  return {
    memberId: x.id, name: x.id,
    before: b && { id: b.id, name: b.name, price: b.price, tier: b.tier },
    after: a && { id: a.id, name: a.name, price: a.price, tier: a.tier },
    improved: x.improved, same: x.same, worse: x.worse, gain: x.gain, gotTarget: false,
  }
})
const tradeHtml = decode(render(h(TradeTable, { results: tradeRows })))

t('개선 여부가 _trade.js 출력과 일치한다', () => {
  const improved = out.results.filter((x) => x.improved).length
  const shown = (tradeHtml.match(/선호 \d+단계 개선/g) || []).length
  assert.equal(shown, improved, `엔진 ${improved}명 vs 화면 ${shown}명`)
})

t('교환 후 가격이 엔진이 준 값 그대로 렌더된다', () => {
  for (const r of tradeRows) {
    if (r.after) assert.ok(tradeHtml.includes(`${r.after.price.toLocaleString('ko-KR')}원`), `${r.after.price} 없음`)
  }
})

t('나빠진 사람이 없다 (I5) — 있으면 화면이 그것을 드러낸다', () => {
  assert.ok(out.results.every((x) => !x.worse))
  assert.ok(!tradeHtml.includes('나빠짐'), '나빠진 사람이 없으면 그 배지도 없어야 한다')
})

t('교환 사이클이 화살표로 그려진다', () => {
  const html = decode(render(h(CycleView, { cycles: out.tradeCycles.map((c) => c.map((id) => ({ id, name: id }))) })))
  if (out.tradeCycles.length) {
    assert.ok(html.includes('→'), '사이클이 있으면 화살표가 있어야 한다')
    for (const c of out.tradeCycles) for (const id of c) assert.ok(html.includes(id))
  }
})

console.log('\n─────── 통 그리드 ───────')

t(`${BOX.N}개 셀을 전부 그린다 (요약하지 않는다)`, () => {
  const html = render(h(BoxGrid, { slotTiers: slotsOf().map((s) => s.tier).join(''), drawn: [] }))
  assert.equal((html.match(/class="cell/g) || []).length, BOX.N)
})

t('등급별 셀 수가 재고와 정확히 같다', () => {
  const html = render(h(BoxGrid, { slotTiers: slotsOf().map((s) => s.tier).join(''), drawn: [] }))
  for (const tier of BOX.tiers) {
    const n = (html.match(new RegExp(`cell t-${tier.tier}(?![A-Z])`, 'g')) || []).length
    assert.equal(n, tier.K, `${tier.tier}등급 셀 ${n} vs 재고 ${tier.K}`)
  }
})

t('뽑힌 카드는 꺼진 상태로 그려진다 (비복원 시각화, I3)', () => {
  const html = render(h(BoxGrid, { slotTiers: slotsOf().map((s) => s.tier).join(''), drawn: [0, 5, 9] }))
  assert.equal((html.match(/ gone/g) || []).length, 3)
})

console.log('\n─────── I10 희소성 압박 금지 ───────')

/**
 * I10′ — 금지되는 것은 **감정 유도**이지 마감 표시 자체가 아니다.
 * 공동구매는 주문을 모아 발주하므로 마감이 실재하고, 그 시각을 숨기면 조건 은닉이 된다
 * (공정위가 테무를 제재한 사유가 조건 은닉이었다 — C2).
 * 그래서 "3일 12:04:33 남음" 같은 사실 표시는 허용하고, 아래 문구만 막는다.
 */
const FORBIDDEN = [
  '얼마 안 남', '서두르', '마감 임박', '곧 마감', '지금 바로', '놓치지', '품절 임박',
  '단 하루', '오늘만', '남았습니다!', '마지막 기회', '한정 특가', '서둘러',
]
t('희소성 압박 문구가 없다', () => {
  for (const w of FORBIDDEN) {
    assert.ok(!APP_CODE.includes(w), `App.jsx에 금지 문구 "${w}"`)
    assert.ok(!PARTS_CODE.includes(w), `parts.jsx에 금지 문구 "${w}"`)
  }
})

/**
 * I10′ 마감 시계 — 형식별 가드.
 * 1차 버전의 가드는 'sec-team'/'sec-pick' 앵커가 JSX에서 사라져 12자짜리 빈 조각을
 * 검사하고 있었다(죽은 가드). 앵커 문자열 대신 **서버 데이터와 컴포넌트 경계**로 다시 짠다.
 *   · 마감이 실재하지 않는 ①(팀)은 서버가 deadlineAt=null을 내린다 → 시계가 그려질 수 없다
 *   · 마감이 실재하는 ②③은 deadlineAt이 미래 시각이다 (숨기면 조건 은닉 — C2)
 *   · 시계 컴포넌트는 deadlineAt 없이는 null을 반환한다
 *   · 화면은 마감 시각을 계산하지 않는다 — 서버 필드를 그대로 넘길 뿐이다
 */
t('①팀 뽑기 딜에는 마감이 없다 — 서버가 null을 내린다 (I10′)', () => {
  const deals = buildDeals(Date.now())
  for (const d of deals.filter((x) => x.kind === 'team'))
    assert.equal(d.deadlineAt, null, `${d.id}에 마감이 있으면 안 된다`)
})

t('②③ 딜의 마감은 실재하고 미래다', () => {
  const now = Date.now()
  const deals = buildDeals(now)
  for (const d of deals.filter((x) => x.kind !== 'team')) {
    assert.equal(typeof d.deadlineAt, 'number', `${d.id} 마감이 시각이어야 한다`)
    assert.ok(d.deadlineAt > now, `${d.id} 마감이 과거다 — 회차가 안 굴렀다`)
  }
})

t('시계 컴포넌트는 마감 없이는 그려지지 않는다', () => {
  assert.ok(/if \(!deadlineAt\) return null/.test(PARTS_CODE), 'DeadlineTicker의 null 가드')
})

t('화면은 마감을 계산하지 않는다 — 서버 필드만 넘긴다', () => {
  assert.ok(!APP_CODE.includes('Date.now() +'), '만료 시각 계산이 화면에 있으면 안 된다')
  for (const m of APP_CODE.match(/<DeadlineTicker[^/>]*/g) ?? [])
    assert.ok(/deadlineAt=\{(deal|daily)\.deadlineAt\}/.test(m), `서버 필드가 아닌 값: ${m.slice(0, 60)}`)
})

t('①의 화면 조각에 시계가 없다', () => {
  // 팀 상세·팀 흐름 컴포넌트 본문 = function 선언 사이의 조각. 앵커가 실재하는지 먼저 확인한다.
  for (const [from, to] of [['function TeamDetail', 'function CheckoutScreen'], ['function TeamFlow', 'function OlboxTab']]) {
    const a = APP_CODE.indexOf(from), b = APP_CODE.indexOf(to)
    assert.ok(a > -1 && b > a, `앵커 소실: ${from} → ${to} — 이 가드가 죽었다`)
    assert.ok(!APP_CODE.slice(a, b).includes('DeadlineTicker'), `${from}에 시계가 있다`)
  }
})

t('재고 표시는 사실 표시로만 쓴다', () => {
  assert.ok(APP.includes('남은 카드'), '재고 개수의 사실 표시는 허용된다')
  assert.ok(!/남은 카드[^`'"]{0,20}!/.test(APP_CODE), '재고 표시에 감정 유도 부호가 붙으면 안 된다')
})

t('가격 블록 — 취소선·할인율은 서버가 내려준 것만 그린다 (I4)', () => {
  const deals = buildDeals(Date.now())
  for (const d of deals.filter((x) => x.kind === 'team')) {
    assert.equal(d.price.strike, null, '뽑기에는 정가가 없다 — 취소선 금지')
    assert.equal(d.price.discount, null, '뽑기에 할인율을 만들면 지어낸 수다')
  }
  const g = deals.find((x) => x.kind === 'group')
  assert.equal(g.price.strike, null, '공동구매가 = 정가(웃돈 0) — 할인율 0%에 취소선을 그리면 거짓이다')
  const dd = deals.find((x) => x.kind === 'daily')
  assert.ok(/^-\d+%$/.test(dd.price.discount), '0원 응모의 할인율은 서버가 계산한 문자열')
  // 화면 소스에 % 리터럴로 할인율을 박아넣지 않았는지는 아래 하드코딩 탐지가 같이 잡는다
})

console.log('\n─────── I11 · I12 고지 ───────')

t('팀 인원이 늘면 무엇이 달라지는지가 본문에 있다 (툴팁·더보기 아님)', () => {
  assert.ok(APP.includes('친구를 부르면 뭐가 달라지나요'), '고지 제목이 본문에 있다')
  assert.ok(APP.includes('notice'), '고지가 전용 블록으로 렌더된다')
  assert.ok(!/title=\{?['"`][^'"`]*친구를 부르면/.test(APP), 'title 속성(툴팁)에 숨기면 안 된다')
  assert.ok(!/<details[\s\S]{0,400}친구를 부르면/.test(APP), 'details(더보기)에 숨기면 안 된다')
})

t('초대자 추가 보상이 없다는 것을 명시한다 (I12)', () => {
  assert.ok(APP.includes('초대한 사람이 더 받는 건 없어요'), '초대자 개별 보상 없음이 본문에')
})

t('문제 제시와 타깃이 브리프 레일에 있다', () => {
  // 앱 셸 복원 후 구조가 바뀌었다 — 폰 안은 유저 화면, 문제 정의는 좌 레일이 맡는다.
  const brief = APP.slice(APP.indexOf('function BriefRail'), APP.indexOf('function OpsRail'))
  assert.ok(brief.includes('검증 불가능성'), '문제 한 줄')
  assert.ok(brief.includes('30~40대 부모'), '타깃')
  assert.ok(brief.includes('oripa.probNum'), '실측 수치를 서버에서 받아 쓴다')
  assert.ok(brief.includes('왜 올웨이즈인가'), '정착 논거')
})

console.log('\n─────── 하드코딩 탐지 ───────')

t('화면 소스에 확률·배수 리터럴이 없다', () => {
  for (const [f, src2] of [['App.jsx', APP], ['parts.jsx', PARTS]]) {
    // 주석은 제외한다 — v1에서 무엇을 왜 뺐는지 적어 둔 곳에 숫자가 나온다.
    const code = src2.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const hits = code.match(/['"`][^'"`]*\d+\.\d+\s*(%|배)[^'"`]*['"`]/g) || []
    assert.equal(hits.length, 0, `${f}에 하드코딩: ${hits.join(', ')}`)
  }
})

t('화면이 확률을 스스로 계산하지 않는다 (I4)', () => {
  for (const [f, s] of [['App.jsx', APP], ['parts.jsx', PARTS]]) {
    assert.ok(!/toFixed\s*\(/.test(s), `${f}에서 toFixed를 부르면 서버와 두 벌이 된다`)
    assert.ok(!/Math\.(pow|log|exp)/.test(s), `${f}에서 확률 계산을 하면 안 된다`)
  }
})

t('대조 뷰의 혼자·팀 칸이 실제 엔진 결과를 쓴다', () => {
  const cmp = APP.slice(APP.indexOf('className="tablewrap compare"'), APP.indexOf('오리파 칸이 물음표로'))
  assert.ok(cmp.includes('odds[0].soloPct'), '혼자 칸이 서버 확률')
  assert.ok(cmp.includes('odds[0].team['), '팀 칸이 서버 확률')
  assert.ok(cmp.includes('myResult'), '받은 것이 실제 추첨 결과')
  assert.ok(cmp.includes('myTrade'), '교환 후가 실제 교환 결과')
  assert.ok(!/['"`][^'"`]*\d\.\d+%/.test(cmp), '대조 뷰에 하드코딩된 확률이 있으면 안 된다')
})

t('대조 뷰의 오리파 칸은 물음표로 남는다 (추정치로 채우지 않는다)', () => {
  const cmp = APP.slice(APP.indexOf('className="tablewrap compare"'), APP.indexOf('오리파 칸이 물음표로'))
  const unknowns = (cmp.match(/className="unknown"/g) || []).length
  assert.ok(unknowns >= 4, `오리파 칸이 최소 4개는 물음표여야 한다 (현재 ${unknowns})`)
})

t('교환 전환율 표가 측정 파일에서 온다', () => {
  assert.ok(APP.includes('conversion.models.heterogeneous.rows'))
  assert.ok(APP.includes('conversion.models.homogeneous.rows'))
})

console.log('\n─────── I13 시뮬 배지 · E2E 셀렉터 ───────')

t('시뮬레이션인 것에 배지가 붙는다', () => {
  assert.ok((APP.match(/<SimBadge/g) || []).length >= 3, '시뮬 지점마다 배지')
  assert.ok(render(h(SimBadge, { what: 'x' })).includes('시뮬'))
})

const SELECTORS = ['.phone', '.tabbar', '.brief', '.ops', '.boxgrid', '.cell', '.compare',
  '.notice', '.cycle', '.tshow', '.scene', '.sheet', '.verify', '.simtag']
t(`E2E 셀렉터 ${SELECTORS.length}개가 실제로 존재한다`, () => {
  const css = src('src/index.css')
  for (const s of SELECTORS) {
    const cls = s.replace(/^\./, '').split('.').pop()
    assert.ok(css.includes(`.${cls}`), `CSS에 ${s} 없음`)
    assert.ok(APP.includes(cls) || PARTS.includes(cls), `JSX에 ${s} 없음`)
  }
})

console.log('\n─────── CSS 캐스케이드 함정 ───────')

t('데스크톱 폰 프레임이 실제 기기 비율로 고정된다', () => {
  const css = src('src/index.css')
  // 어느 탭을 눌러도 같은 크기여야 한다. grid 중간 트랙이 auto면 내용이 짧은 탭에서
  // 267px로 쪼그라들었다. 실제로 그렇게 깨져 있었다.
  assert.ok(/grid-template-columns:\s*300px\s+430px\s+320px/.test(css), 'grid 중간 트랙이 폰 폭으로 고정')
  assert.ok(/aspect-ratio:\s*430\s*\/\s*932/.test(css), '실제 기기 비율(iPhone 15 Pro Max)')
  assert.ok(/\.phone\s*\{[^}]*width:\s*430px/s.test(css) || /width:\s*430px/.test(css), '폰 폭 고정')
})

t('좌우 레일은 데스크톱에서만 뜬다', () => {
  const css = src('src/index.css')
  assert.ok(/\.brief\s*\{\s*display:\s*none/.test(css), '.brief 기본 숨김')
  assert.ok(/\.ops\s*\{\s*display:\s*none/.test(css), '.ops 기본 숨김')
  assert.ok(css.includes('min-width: 1180px'), '1180px 이상에서만 3단')
})

console.log(`\n  ${pass}개 통과${fails.length ? ` · ${fails.length}건 실패: ${fails.join(', ')}` : ''}`)
if (fails.length) process.exitCode = 1
