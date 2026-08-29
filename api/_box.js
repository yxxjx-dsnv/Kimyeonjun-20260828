/**
 * 통 구성 — 크롤 실측 데이터에서 통을 만든다.
 *   node api/_box.js     구성 결과와 self-check 출력
 *
 * 이 파일이 정하는 것은 **무엇이 통에 들어가는가**다.
 * 확률이 얼마인가는 정하지 않는다 — 그것은 재고 ÷ 구좌이고 api/_draw.js가 센다.
 * 사람이 확률을 적을 수 있는 자리가 이 코드에 없다는 것이 요점이다.
 */
import pool from './_pool.js'
import { isNotCard, isOripa, isPokemonCard } from './_sources.js'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'

// 경로에 한글이 있으면 import.meta.url은 퍼센트 인코딩되고 process.argv[1]은 안 된다.
// 문자열 비교로는 절대 같아지지 않아 self-check가 조용히 안 돌았다. 경로로 비교한다.
const isMain = () => {
  try { return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]) } catch { return false }
}

/**
 * 참여비 10,000원 — Phase 0 실측에서 유도했다. 임의로 고른 값이 아니다.
 *
 * 등급 경계를 참여비 배수로 두고(아래 BANDS) 카드만으로 네 등급이 전부 채워지는
 * 최저 참여비를 스캔한 결과다. `node crawler/report.mjs`가 그 표를 출력한다.
 *
 *    2,000원   C  2/30  ✗      8,000원   C 26/30  ✗
 *    5,000원   C 16/30  ✗     10,000원   C 38/30  ✓  ← 유일한 저가 성립점
 *                            20,000원   C 29/30  ✗
 *
 * v1은 참여비 2,000원에 맞추려다 카드로 하한을 못 채워 생필품을 섞었다.
 * 참여비를 데이터에 맞추면 상품 풀을 카드 안에 둘 수 있다(I6).
 */
export const FEE = 10000

/** 구좌 수. 확률의 분모다. */
export const N = 1000

/** 팀 정원. 설계 선택이며 근거는 UI 제약이다(SPEC §12). 확률식에는 개입하지 않는다. */
export const TEAM_MAX = 10

/** 등급 경계 — 참여비 대비 배수. C의 하한이 1.0인 것이 꽝 없음 1층이다. */
export const BANDS = { C: [1, 1.5], B: [1.5, 4], A: [4, 20], S: [20, Infinity] }
export const TIERS = ['S', 'A', 'B', 'C']

/**
 * 등급별 재고. **이것이 확률을 결정하는 유일한 손잡이이고, 그래서 전부 적어 둔다.**
 *
 *  K_S = 1    K=1일 때만 팀 확률이 **정확히** n배가 된다(P_team = n/N).
 *             제품의 핵심 주장이 화면에서 증명되려면 재고가 1이어야 한다.
 *  K_A = 4    K>1이면 정확히 n배가 아니다. n=10에서 9.85배다. 그 차이를 화면에
 *             그대로 보여주기 위한 대조군이다. 반올림해서 10배라고 쓰지 않는다.
 *  K_B = 25   S·A가 1구좌씩 유일 카드인 것과 달리 여러 종이 들어간다.
 *  K_C = 970  나머지 전부. Σ K_g = N을 self-check가 검사한다.
 *
 * 이 값들은 **설계 선택**이며 SPEC §12 가정 표에 그렇게 적혀 있다.
 * 확률은 여기서 나오지만, 확률에 곱해지는 배수·곡선·보정은 어디에도 없다.
 */
export const K = { S: 1, A: 4, B: 25, C: 970 }

/**
 * 통에 들어갈 수 있는 카드 — 액세서리·오리파·생태계 밖·타 TCG·굿즈를 뺀다(I6).
 * 판별은 api/_sources.js가 소유한다. 크롤러·판정기·서버가 같은 것을 쓴다(I15).
 */
export const candidates = pool.items.filter(
  (x) => x.group !== 'acc' && x.group !== 'oripa' &&
    !isOripa(x.name) && !isNotCard(x.name) && isPokemonCard(x.name)
)

const bandOf = (price) => {
  for (const g of TIERS) {
    const [lo, hi] = BANDS[g]
    if (price >= FEE * lo && price < (hi === Infinity ? Infinity : FEE * hi)) return g
  }
  return null
}

/**
 * 등급 안에서 어떤 카드를 고르는가.
 * 가격 내림차순으로 정렬한 뒤 **양 끝을 포함해 균등 간격**으로 뽑는다.
 * 비싼 쪽만 고르면 통이 실제보다 후해 보이고, 싼 쪽만 고르면 박해 보인다.
 * 균등 간격이 등급의 가격대를 있는 그대로 대표한다. 결정적이다(I7).
 * K=1이면 최고가를 고른다 — S는 통의 대표 상품이므로.
 */
function pick(sorted, k) {
  if (k >= sorted.length) return sorted.slice()
  if (k === 1) return [sorted[0]]
  return Array.from({ length: k }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (k - 1))])
}

/** 구좌를 카드에 나눈다. 나머지는 앞에서부터 한 장씩. 결정적이다. */
function spread(cards, slots) {
  const base = Math.floor(slots / cards.length)
  const extra = slots - base * cards.length
  return cards.map((c, i) => ({ ...c, slots: base + (i < extra ? 1 : 0) }))
}

export function buildBox() {
  const byTier = Object.fromEntries(TIERS.map((g) => [g, []]))
  for (const c of candidates) {
    const g = bandOf(c.price)
    if (g) byTier[g].push(c)
  }
  const tiers = TIERS.map((g) => {
    const sorted = byTier[g].sort((a, b) => b.price - a.price || a.id.localeCompare(b.id))
    const chosen = pick(sorted, K[g])
    const cards = spread(chosen, K[g])
    return {
      tier: g,
      K: K[g],
      available: sorted.length,
      cards: cards.map((c) => ({ id: c.id, name: c.name, price: c.price, image: c.image, url: c.url, slots: c.slots })),
      minPrice: Math.min(...cards.map((c) => c.price)),
      maxPrice: Math.max(...cards.map((c) => c.price)),
      band: [FEE * BANDS[g][0], BANDS[g][1] === Infinity ? Infinity : FEE * BANDS[g][1]],
    }
  })
  return { fee: FEE, N, teamMax: TEAM_MAX, crawledAt: pool.crawledAt, tiers }
}

export const BOX = buildBox()

/** 구좌 하나하나를 펼친 배열. 추첨은 이 위에서 비복원으로 일어난다. */
export function slotsOf(box = BOX) {
  const out = []
  for (const t of box.tiers) for (const c of t.cards) for (let i = 0; i < c.slots; i++) out.push({ tier: t.tier, id: c.id, name: c.name, price: c.price, image: c.image })
  return out
}

// ─────────────────────────── self-check ───────────────────────────
export function check(box = BOX) {
  const fails = []
  const ok = (name, cond, detail) => { if (!cond) fails.push(name); console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`) }
  const won = (n) => n.toLocaleString('ko-KR') + '원'

  const sumK = box.tiers.reduce((s, t) => s + t.K, 0)
  ok('Σ K_g = N', sumK === box.N, `${box.tiers.map((t) => `${t.tier}:${t.K}`).join(' + ')} = ${sumK}`)

  const slots = slotsOf(box)
  ok('펼친 구좌 수 = N', slots.length === box.N, `${slots.length}`)
  for (const t of box.tiers) {
    const n = slots.filter((s) => s.tier === t.tier).length
    ok(`  ${t.tier}등급 구좌 = K_${t.tier}`, n === t.K, `${n}/${t.K}`)
  }

  // 꽝 없음 1층 — 모든 등급의 최저가가 참여비 이상 (SPEC §6)
  for (const t of box.tiers) {
    ok(`꽝없음 1층 ${t.tier}등급 최저가 ≥ 참여비`, t.minPrice >= box.fee, `${won(t.minPrice)} ≥ ${won(box.fee)}`)
  }

  // I6 — 통 안에 카드가 아닌 것이 없는가
  ok('I6 통이 전부 포켓몬 TCG 카드',
    slots.every((s) => isPokemonCard(s.name) && !isNotCard(s.name) && !isOripa(s.name)))

  // 등급 밴드가 겹치지 않고 빈틈도 없는가
  ok('등급 밴드 연속·비중첩',
    TIERS.slice(1).every((g, i) => BANDS[TIERS[i]][0] === BANDS[g][1]))

  // 등급별 가격이 실제로 자기 밴드 안에 있는가
  for (const t of box.tiers) {
    const inBand = t.cards.every((c) => c.price >= t.band[0] && c.price < t.band[1])
    ok(`  ${t.tier}등급 카드가 밴드 안`, inBand, `${won(t.minPrice)} ~ ${won(t.maxPrice)}`)
  }

  ok('전 카드가 크롤 실측 상품', slots.every((s) => candidates.some((c) => c.id === s.id)))
  ok('결정성 — 2회 구성이 동일', JSON.stringify(buildBox()) === JSON.stringify(buildBox()))

  return fails
}

if (isMain()) {
  const won = (n) => n.toLocaleString('ko-KR') + '원'
  console.log('═'.repeat(70))
  console.log(`통 구성 — 참여비 ${won(FEE)} · ${N}구좌 · 정원 ${TEAM_MAX}명`)
  console.log(`크롤 ${BOX.crawledAt} · 후보 카드 ${candidates.length}건`)
  console.log('═'.repeat(70))
  for (const t of BOX.tiers) {
    console.log(`\n■ ${t.tier}등급  재고 ${t.K}구좌  ·  카드 ${t.cards.length}종  ·  후보 ${t.available}건`)
    console.log(`  밴드 ${won(t.band[0])} ~ ${t.band[1] === Infinity ? '∞' : won(t.band[1])}   실제 ${won(t.minPrice)} ~ ${won(t.maxPrice)}`)
    for (const c of t.cards.slice(0, 3)) console.log(`    ${won(c.price).padStart(12)} × ${String(c.slots).padStart(3)}구좌  ${c.name.slice(0, 46)}`)
    if (t.cards.length > 3) console.log(`    … 외 ${t.cards.length - 3}종`)
  }
  const slots = slotsOf()
  const value = slots.reduce((s, x) => s + x.price, 0)
  console.log(`\n■ 통 시가 합계 ${won(value)}  ·  참여비 총액 ${won(FEE * N)}  ·  비율 ${(value / (FEE * N) * 100).toFixed(1)}%`)
  console.log('  ※ 100%를 넘는 것은 꽝 없음 1층(모든 등급 최저가 ≥ 참여비)의 구조적 귀결이다.')
  console.log('    다나와 최저가는 소매가이고 실제 매입가는 다르다. MVP는 매입가를 모델링하지')
  console.log('    않았다 — SPEC §12에 가정으로 적혀 있다. 이 숫자를 사업성 근거로 읽지 말 것.')
  console.log('\n─────────── self-check ───────────')
  const fails = check()
  console.log(`\n  ${fails.length === 0 ? '전부 통과' : `${fails.length}건 실패: ${fails.join(', ')}`}`)
  if (fails.length) process.exitCode = 1
}
