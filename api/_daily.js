/**
 * ③ 0원 응모 특가 — import 가능한 모듈이면서 실행 가능한 self-check다.
 *   node api/_daily.js
 *
 * ## 무엇이 확률인가
 * 상품도 가격도 확정이다. 확률이 작동하는 곳은 **누가 그 가격에 살 수 있는가**다.
 *
 *   확률 = 특가 수량 W ÷ 응모자 수 E
 *
 * ①②와 정확히 같은 규칙이다 — 재고 ÷ 구좌. 재고가 카드 → 환불 슬롯 → 특가 수량으로
 * 바뀌었을 뿐이고, 셋 다 화면에서 셀 수 있다.
 *
 * ## 왜 참가비를 받지 않는가 (산술이 그렇게 시켰다)
 * 처음 구상은 "참가비 100원 · 하루 300구좌 · 당첨 100개 → 33.3%"였다. 산술이 안 맞는다.
 *   수입 100원 × 300 = 30,000원인데 당첨 100개 × 시가 10,000원 = 1,000,000원.
 *   33.3%를 유지하려면 상품가가 300원 이하여야 한다 — 제품이 안 된다.
 * 참가비를 받으면 꽝일 때 **실제로 돈을 잃는다.** 그러면 SPEC §6의 꽝 없음 2층이 무너지고,
 * 루트박스 지출과 문제도박의 상관(D6, r=0.26)을 근거로 세운 설계가 자기부정이 된다.
 *
 * 그래서 응모를 0원으로 둔다. 안 되면 아무것도 잃지 않는다.
 * 확률형이되 **잃을 것이 구조적으로 없는** 형식이고, 재원은 참가비가 아니라 마케팅 예산이다.
 *
 * ## 왜 선착순이 아니라 추첨인가
 * 선착순은 알림·매크로 싸움이 되고, 확률이라는 축이 아예 사라진다.
 * 추첨이면 규칙이 ①②와 같아지고("재고 ÷ 구좌"), 늦게 들어온 사람도 같은 확률을 갖는다.
 */
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import pool from './_pool.js'
import { isPokemonCard, isNotCard, isOripa } from './_sources.js'
import { rng } from './_draw.js'

const isMain = () => {
  try { return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]) } catch { return false }
}

/** 특가 대상 — 크롤 실측 상품에서 결정적으로 고른다(I7). */
const CANDIDATES = pool.items.filter(
  (x) => x.group !== 'acc' && x.group !== 'oripa' &&
    !isOripa(x.name) && !isNotCard(x.name) && isPokemonCard(x.name) &&
    x.price >= 8000 && x.price <= 20000
).sort((a, b) => b.price - a.price || a.id.localeCompare(b.id))

export const ITEM = CANDIDATES[0]
export const LIST = ITEM ? ITEM.price : 0        // 정가 = 크롤 실측 최저가
export const DEAL = 1000                         // 특가
export const ENTRY = 0                           // 응모비 — 0원. 잃을 것이 없다
/** 하루 마케팅 예산 (설계 선택. SPEC §12) */
export const BUDGET = 300000
/** 특가 수량 = 재고. 예산이 정하는 것은 재고이지 확률이 아니다. */
export const SLOTS = Math.max(1, Math.floor(BUDGET / Math.max(1, LIST - DEAL)))

/**
 * 마감. 응모는 그날 자정(KST)에 닫히고 추첨한다. 마감이 실재하므로 카운트다운을 쓴다.
 * 다음 날은 새 회차이지 같은 타이머의 리셋이 아니다 — 재고도 응모자도 새로 시작한다.
 */
export const dayKeyOf = (now) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10)
export const closesAt = (now) => {
  const kst = now + 9 * 3600_000
  return Math.floor(kst / 86400_000) * 86400_000 + 86400_000 - 9 * 3600_000
}

export const oddsAt = (entries) => (entries > 0 ? Math.min(1, SLOTS / entries) : 1)
export const fmtPct = (p) => `${(p * 100).toFixed(2)}%`
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`

/** 화면이 쓰는 구간표. 응모자가 늘수록 확률이 내려간다 — 그것을 숨기지 않는다. */
export const table = (es = [50, 100, 200, 500, 1000]) =>
  es.map((E) => ({ E, p: oddsAt(E), pct: fmtPct(oddsAt(E)), freq: `${E.toLocaleString('ko-KR')}명 중 ${Math.min(SLOTS, E)}명` }))

/** 마감 후 추첨. 비복원 — 뽑힌 사람은 빠진다. 같은 날 같은 응모자면 같은 결과(I7). */
export function draw(dayKey, entrantIds) {
  const pool2 = entrantIds.slice().sort()
  const r = rng(`daily|${dayKey}`)
  const winners = []
  const left = pool2.slice()
  const n = Math.min(SLOTS, left.length)
  for (let i = 0; i < n; i++) {
    const k = Math.floor(r() * left.length)
    winners.push(left[k])
    left.splice(k, 1)
  }
  return { winners: winners.sort(), losers: left.sort(), odds: oddsAt(entrantIds.length) }
}

// ─────────────────────────── self-check ───────────────────────────
export function check() {
  const fails = []
  let count = 0
  const ok = (name, cond, detail) => {
    count++
    if (!cond) fails.push(name)
    console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  ok('특가 상품이 크롤 실측 상품', !!ITEM && pool.items.some((x) => x.id === ITEM.id),
    ITEM ? `${ITEM.name.slice(0, 34)} ${won(ITEM.price)}` : '없음')
  ok('응모가 0원 — 안 돼도 잃는 것이 없다', ENTRY === 0)
  ok('특가 < 정가', DEAL < LIST, `${won(DEAL)} < ${won(LIST)}`)

  // 예산이 정하는 것은 재고다. 확률이 아니다.
  ok('특가 수량 × 회사 부담 ≤ 예산', SLOTS * (LIST - DEAL) <= BUDGET,
    `${SLOTS}개 × ${won(LIST - DEAL)} = ${won(SLOTS * (LIST - DEAL))} ≤ ${won(BUDGET)}`)

  // 응모자가 늘면 확률이 내려간다. 그것을 숨기지 않고 검사로 못박는다.
  let mono = true
  for (let E = 2; E <= 5000; E++) if (oddsAt(E) > oddsAt(E - 1) + 1e-12) mono = false
  ok('응모자가 늘면 확률이 내려간다 (E=1..5000)', mono, `${fmtPct(oddsAt(SLOTS))} → ${fmtPct(oddsAt(5000))}`)
  ok('응모자 ≤ 수량이면 전원 당첨', oddsAt(Math.max(1, SLOTS - 1)) === 1)
  ok('확률이 [0, 1] 안', Array.from({ length: 3000 }, (_, i) => oddsAt(i + 1)).every((p) => p >= 0 && p <= 1))

  // 예산(BUDGET)이 정한 것이 재고인지 확률인지를 가르는 검사.
  let identity = true
  for (let E = SLOTS; E <= 5000; E++) if (Math.abs(oddsAt(E) * E - SLOTS) > 1e-9) identity = false
  ok('확률 × 구좌 = 재고 (예산이 확률을 만지지 않았다)', identity, `응모자 ${SLOTS}..5000`)

  // 추첨 — 비복원, 결정적
  const ids = Array.from({ length: 400 }, (_, i) => `u${i}`)
  const d1 = draw('2026-08-30', ids)
  const d2 = draw('2026-08-30', ids)
  ok('당첨자 수 = min(수량, 응모자)', d1.winners.length === Math.min(SLOTS, ids.length), `${d1.winners.length}명`)
  ok('비복원 — 당첨자 중복 없음', new Set(d1.winners).size === d1.winners.length)
  ok('당첨 + 탈락 = 전체 응모자', d1.winners.length + d1.losers.length === ids.length)
  // 마감이 실재하는지
  const noon = Date.UTC(2026, 7, 30, 3, 0, 0)   // KST 정오
  ok('마감이 그날 자정(KST)', new Date(closesAt(noon) + 9 * 3600_000).toISOString().slice(11, 16) === '00:00',
    new Date(closesAt(noon) + 9 * 3600_000).toISOString().slice(0, 16))
  ok('마감이 미래이고 24시간 이내', closesAt(noon) > noon && closesAt(noon) - noon <= 86400_000,
    `${((closesAt(noon) - noon) / 3600_000).toFixed(1)}시간 남음`)
  ok('다음 날은 새 회차 (같은 타이머의 리셋이 아니다)',
    dayKeyOf(noon) !== dayKeyOf(noon + 86400_000))

  ok('결정성 — 같은 날 같은 응모자면 같은 결과 (I7)', JSON.stringify(d1) === JSON.stringify(d2))
  ok('다른 날은 다른 결과', JSON.stringify(draw('2026-08-31', ids).winners) !== JSON.stringify(d1.winners))

  // 균등성 — 특정 응모자가 유리하지 않은가 (선착순이 아니라는 것의 증명)
  const TRIALS = 20000
  const hit = new Array(20).fill(0)
  for (let t = 0; t < TRIALS; t++) {
    const small = Array.from({ length: 20 }, (_, i) => `p${i}`)
    for (const w of draw(`fair-${t}`, small).winners) hit[Number(w.slice(1))]++
  }
  const exp = TRIALS * Math.min(SLOTS, 20) / 20
  const chi = hit.reduce((s, o) => s + (o - exp) ** 2 / exp, 0)
  ok(`균등 추첨 카이제곱 χ²=${chi.toFixed(2)} < 43.77 (df=19, α=0.001)`, chi < 43.77,
    '먼저 응모한 사람이 유리하지 않다')

  return { fails, count }
}

if (isMain()) {
  console.log('═'.repeat(72))
  console.log('③ 0원 응모 특가 — 확률 = 특가 수량 ÷ 응모자 수')
  console.log('═'.repeat(72))
  console.log(`\n상품   ${ITEM?.name.slice(0, 50)}`)
  console.log(`가격   정가 ${won(LIST)} → 특가 ${won(DEAL)}   (응모 ${won(ENTRY)})`)
  console.log(`재원   하루 예산 ${won(BUDGET)} · 회사 부담 ${won(LIST - DEAL)}/명`)
  console.log(`유도   특가 수량 = ⌊${BUDGET} / ${LIST - DEAL}⌋ = ${SLOTS}개`)
  console.log('\n■ 응모자별 확률')
  console.log('     응모자        확률      자연빈도')
  for (const t of table([50, 100, 200, 500, 1000, 2000])) {
    console.log(`   ${String(t.E).padStart(6)}명   ${t.pct.padStart(8)}   ${t.freq}`)
  }
  console.log('\n  ※ ①②와 반대로 여기서는 **사람이 많을수록 내 확률이 내려갑니다.**')
  console.log('    숨기지 않고 그대로 표시합니다. 대신 응모가 0원이라 안 돼도 잃는 것이 없습니다.')
  console.log('    ①의 팀 효과가 진짜인 이유가 여기서 대비로 드러납니다 — 같은 통을 나눠 갖는')
  console.log('    구조라야 인원이 늘 때 좋아지고, 한정 수량을 나눠 갖는 구조는 반대가 됩니다.')
  console.log('\n─────────────────────────── self-check ───────────────────────────')
  const { fails, count } = check()
  console.log(`\n  ${count}개 항목 · ${fails.length === 0 ? '전부 통과' : `${fails.length}건 실패: ${fails.join(', ')}`}`)
  if (fails.length) process.exitCode = 1
}
