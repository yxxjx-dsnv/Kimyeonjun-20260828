/**
 * 단위 경제 — 이 구조가 성립하려면 무엇이 참이어야 하는가.
 *   node api/_econ.js
 *
 * ## 왜 이 파일이 필요했나
 * 확률 엔진은 맞았지만 **원가 모델이 없었다.** 그래서 "박스 시가 합계가 참여비
 * 총액을 넘는다"를 한계로만 적어두고 넘어갔는데, 그건 곧 매 박스마다 적자라는 뜻이다.
 *
 * ## 확률로는 풀 수 없다 — 정리
 * 모든 구좌의 지급액 p_i ≥ 참여비 f 이면  Σp_i ≥ N·f = 총수입.
 * 즉 **꽝 없음 1층을 지키는 한, 소매가로 지급하면 반드시 적자다.**
 * 등호는 모든 p_i = f 일 때뿐이고 그때 이익은 0이다.
 * K(재고 분포)를 어떻게 바꿔도 마찬가지다 — 실제로 지급액을 지배하는 것은
 * 잭팟이 아니라 **C등급 970장**이다(스탠다드에서 수입의 120%).
 *
 * ## 그래서 마진은 확률이 아니라 매입에서 나온다
 * 원가 = 소매가 × r (r = 매입률). 손익분기 r* = 수입 ÷ 지급.
 * 이 파일은 r*를 **유도**한다. r을 지어내지 않는다 — 실제 매입 계약이 있어야
 * 정해지는 값이고, 우리가 할 수 있는 것은 "얼마 이하여야 하는가"를 계산하는 것뿐이다.
 *
 * ## 확률을 조여 이익을 만들지 않는다
 * 그렇게 하면 꽝 없음이 깨지고, 그건 이 제품이 비판하는 바로 그것이 된다.
 */
import { BOXES, slotsOf, TIERS } from './_box.js'
import { fileURLToPath } from 'node:url'
import { realpathSync, readFileSync } from 'node:fs'

const isMain = () => {
  try { return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]) } catch { return false }
}

/** 박스 하나의 단위 경제. 매입률 r을 주면 손익까지 낸다. */
export function econOf(box, r = null) {
  const slots = slotsOf(box)
  const revenue = box.fee * box.N
  const payout = slots.reduce((s, x) => s + x.price, 0)   // 소매가 기준 지급
  const breakEven = revenue / payout                       // 이 비율 이하로 매입해야 흑자
  const byTier = Object.fromEntries(TIERS.map((g) => {
    const t = slots.filter((s) => s.tier === g)
    return [g, { n: t.length, value: t.reduce((s, x) => s + x.price, 0) }]
  }))
  return {
    id: box.id, name: box.name, fee: box.fee, N: box.N,
    revenue, payout, breakEven, byTier,
    ...(r === null ? {} : { cost: payout * r, profit: revenue - payout * r, margin: (revenue - payout * r) / revenue }),
  }
}

/** TCG 도매 매입률의 통상 범위. 계약이 없으므로 **가정**이고 그렇게 표기한다. */
export const WHOLESALE_RANGE = [0.60, 0.75]

const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`
const pct = (x) => `${(x * 100).toFixed(1)}%`

export function check() {
  const fails = []
  check.total = 0
  const ok = (n, c, d) => { check.total++; if (!c) fails.push(n); console.log(`  ${c ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`) }
  console.log('─────── self-check ───────')

  for (const box of BOXES) {
    const e = econOf(box)
    // 정리: 꽝 없음이면 소매가 지급은 반드시 수입 이상이다
    ok(`${box.name} — 소매가 지급이 수입 이상 (꽝 없음의 귀결)`, e.payout >= e.revenue,
      `${won(e.payout)} ≥ ${won(e.revenue)}`)
    // 손익분기 매입률이 현실 도매 범위 안에 들어오는가
    ok(`${box.name} — 손익분기 매입률이 도매 상한 이하`, e.breakEven <= WHOLESALE_RANGE[1],
      `${pct(e.breakEven)} ≤ ${pct(WHOLESALE_RANGE[1])}`)
  }

  // 확률로는 못 푼다는 것을 수치로 고정한다 — 잭팟이 아니라 C가 지배한다
  const e0 = econOf(BOXES[0])
  ok('지급액을 지배하는 것은 잭팟이 아니라 최하 등급',
    e0.byTier.C.value > e0.byTier.S.value + e0.byTier.A.value + e0.byTier.B.value,
    `C ${pct(e0.byTier.C.value / e0.revenue)} vs 상위 합 ${pct((e0.byTier.S.value + e0.byTier.A.value + e0.byTier.B.value) / e0.revenue)} (수입 대비)`)

  // 매입률을 주면 손익이 계산된다 — 도매 하단이면 흑자여야 한다
  const lo = econOf(BOXES[0], WHOLESALE_RANGE[0])
  ok('도매 하단(60%)에서 흑자', lo.profit > 0, `${won(lo.profit)} · 마진 ${pct(lo.margin)}`)

  // 반대 방향도 막는다 — 경제 파라미터가 **확률 경로로 새어들면** 안 된다.
  // 마진을 맞추려고 확률을 조이는 순간 꽝 없음이 깨지고 논지 전체가 무너진다.
  const probPath = ['_box.js', '_draw.js'].map((f) =>
    readFileSync(new URL(`./${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' '))
  const leaked = probPath.some((src) =>
    /(const|let|var|function)\s+(margin|profit|cost|wholesale|breakEven|매입)/i.test(src))
  ok('확률 경로에 원가·마진 파라미터가 없다', !leaked,
    '경제는 확률을 만지지 않는다 — 소매가×매입률로만 계산한다')

  console.log(`  ${check.total}개 항목 · ${fails.length ? `${fails.length}건 실패: ${fails.join(', ')}` : '전부 통과'}`)
  return fails
}

if (isMain()) {
  console.log('═'.repeat(74))
  console.log('단위 경제 — 확률이 아니라 매입에서 마진이 나온다')
  console.log('═'.repeat(74))
  console.log('\n박스        수입          지급(소매)      손익분기 매입률   도매 60%일 때 마진')
  for (const box of BOXES) {
    const e = econOf(box, WHOLESALE_RANGE[0])
    console.log(`  ${e.name.padEnd(6)} ${won(e.revenue).padStart(13)} ${won(e.payout).padStart(15)}` +
      `   ${pct(e.breakEven).padStart(8)}      ${pct(e.margin).padStart(8)} (${won(e.profit)})`)
  }
  const e0 = econOf(BOXES[0])
  console.log('\n스탠다드 등급별 지급 (수입 대비)')
  for (const g of TIERS) {
    const t = e0.byTier[g]
    console.log(`  ${g} ${String(t.n).padStart(4)}장 ${won(t.value).padStart(13)}  ${pct(t.value / e0.revenue).padStart(7)}`)
  }
  console.log('\n  ※ 잭팟(S)은 수입의 15.7%뿐이다. 지급을 지배하는 것은 C등급 970장이고,')
  console.log('    그래서 **확률을 조여도 경제가 개선되지 않는다.** 마진은 매입에서 나온다.')
  console.log(`  ※ 매입률 ${pct(WHOLESALE_RANGE[0])}~${pct(WHOLESALE_RANGE[1])}는 TCG 도매의 통상 범위를 가정한 것이고,`)
  console.log('    실제 계약이 없으므로 **가정**이다. 우리가 유도한 것은 손익분기 매입률뿐이다.')
  console.log()
  const fails = check()
  if (fails.length) process.exitCode = 1
}
