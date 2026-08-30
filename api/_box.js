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

const bandOf = (price, fee) => {
  for (const g of TIERS) {
    const [lo, hi] = BANDS[g]
    if (price >= fee * lo && price < (hi === Infinity ? Infinity : fee * hi)) return g
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

/**
 * 통 정의 — fee(참여비)와 groups(포함할 크롤 그룹)만 다르고 규칙은 전부 같다.
 * 등급 밴드가 참여비 **배수**로 정의돼 있어(BANDS) fee가 바뀌면 밴드가 따라 움직인다.
 * K(재고 분포)는 모든 통에서 같다 — 통마다 확률이 달라지는 유일한 이유가
 * "어떤 카드가 그 가격대에 실재하는가"가 되도록. 손잡이를 늘리지 않는다.
 *
 * C등급 종 수 기준을 30(전체 풀)에서 낮춘 이유: 테마 통은 풀이 좁아 종이 적은 것이
 * 당연하고, 실제 지켜야 할 것은 꽝 없음 1층(최저가 ≥ 참여비)이다. 종 수는 화면에
 * 그대로 표시되어 소비자가 직접 본다 — 숨기는 값이 아니므로 기준이 아니라 표시다.
 */
export const BOX_DEFS = [
  { id: 'standard', name: '스탠다드', desc: '카드 생태계 전체', fee: 10000, groups: null },
  { id: 'starter', name: '입문', desc: '덱·단품·벌크', fee: 5000, groups: ['deck', 'bulk'] },
  { id: 'premium', name: '프리미엄', desc: '그레이딩·봉인 박스', fee: 30000, groups: ['grade', 'sealed'] },
]

export function buildBox(def = BOX_DEFS[0]) {
  const fee = def.fee
  const cand = def.groups ? candidates.filter((c) => def.groups.includes(c.group)) : candidates
  const byTier = Object.fromEntries(TIERS.map((g) => [g, []]))
  for (const c of cand) {
    const g = bandOf(c.price, fee)
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
      cards: cards.map((c) => ({ id: c.id, name: c.name, price: c.price, image: c.image, url: c.url, group: c.group, seller: c.seller ?? null, slots: c.slots })),
      minPrice: Math.min(...cards.map((c) => c.price)),
      maxPrice: Math.max(...cards.map((c) => c.price)),
      band: [fee * BANDS[g][0], BANDS[g][1] === Infinity ? Infinity : fee * BANDS[g][1]],
    }
  })
  return { id: def.id, name: def.name, desc: def.desc, fee, N, teamMax: TEAM_MAX, crawledAt: pool.crawledAt, tiers }
}

export const BOXES = BOX_DEFS.map((d) => buildBox(d))
/** 기본 통 — 기존 소비자(문서·검사·라우트)와의 호환 지점. BOXES[0]과 동일 객체다. */
export const BOX = BOXES[0]
export const boxById = (id) => BOXES.find((b) => b.id === id) || null

/**
 * 구좌 하나하나를 펼친 배열. 추첨은 이 위에서 비복원으로 일어난다.
 *
 * 각 구좌에 안정적인 인덱스 i를 준다. 통 구성이 결정적이므로(self-check가 확인한다)
 * i는 재실행해도 같은 구좌를 가리킨다. 덕분에 방 상태에 1,000구좌를 통째로 저장하지
 * 않고 **뽑힌 인덱스만** 남겨도 남은 통을 정확히 복원할 수 있다.
 * KV에 100KB를 밀어 넣지 않아도 되고, 저장된 것과 계산된 것이 어긋날 여지도 없다.
 */
export function slotsOf(box = BOX) {
  const out = []
  let i = 0
  for (const t of box.tiers) for (const c of t.cards) for (let k = 0; k < c.slots; k++) {
    out.push({ i: i++, tier: t.tier, id: c.id, name: c.name, price: c.price, image: c.image, url: c.url, seller: c.seller })
  }
  return out
}

/** 뽑힌 인덱스 집합에서 남은 통을 복원한다. */
export const remainingFrom = (drawnIdx, box = BOX) => {
  const taken = new Set(drawnIdx)
  return slotsOf(box).filter((s) => !taken.has(s.i))
}

/** 남은 통의 등급별 재고. 확률은 이것을 구좌 수로 나눈 것이다. */
export const tierCountsOf = (remaining) =>
  Object.fromEntries(TIERS.map((g) => [g, remaining.filter((s) => s.tier === g).length]))

// ─────────────────────────── self-check ───────────────────────────
export function check(box = BOX) {
  const fails = []
  // 검사 총 건수를 세어 둔다 — 문서가 건수를 손으로 적지 않고 실행에서 가져가게 한다
  check.total = 0
  const ok = (name, cond, detail) => { check.total++; if (!cond) fails.push(name); console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`) }
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
  const def = BOX_DEFS.find((d) => d.id === box.id) || BOX_DEFS[0]
  ok('결정성 — 2회 구성이 동일', JSON.stringify(buildBox(def)) === JSON.stringify(buildBox(def)))
  // 전 카드가 실측 후보인가 — 테마 통은 후보가 부분집합이므로 전체 candidates로 검사
  ok('통 id·이름이 정의와 일치', box.id === def.id && box.name === def.name)

  return fails
}

if (isMain()) {
  const won = (n) => n.toLocaleString('ko-KR') + '원'
  let total = 0
  const allFails = []
  for (const box of BOXES) {
    console.log('═'.repeat(70))
    console.log(`통 「${box.name}」 (${box.desc}) — 참여비 ${won(box.fee)} · ${box.N}구좌 · 정원 ${box.teamMax}명`)
    console.log('═'.repeat(70))
    for (const t of box.tiers) {
      console.log(`\n■ ${t.tier}등급  재고 ${t.K}구좌  ·  카드 ${t.cards.length}종  ·  후보 ${t.available}건`)
      console.log(`  밴드 ${won(t.band[0])} ~ ${t.band[1] === Infinity ? '∞' : won(t.band[1])}   실제 ${won(t.minPrice)} ~ ${won(t.maxPrice)}`)
      for (const c of t.cards.slice(0, 2)) console.log(`    ${won(c.price).padStart(12)} × ${String(c.slots).padStart(3)}구좌  ${c.name.slice(0, 46)}`)
      if (t.cards.length > 2) console.log(`    … 외 ${t.cards.length - 2}종`)
    }
    const slots = slotsOf(box)
    const value = slots.reduce((s, x) => s + x.price, 0)
    console.log(`\n■ 통 시가 합계 ${won(value)}  ·  참여비 총액 ${won(box.fee * box.N)}  ·  비율 ${(value / (box.fee * box.N) * 100).toFixed(1)}%`)
    console.log('\n─────────── self-check ───────────')
    const fails = check(box)
    total += check.total
    allFails.push(...fails.map((f) => `${box.id}:${f}`))
  }
  console.log('  ※ 시가 합계가 참여비 총액을 넘는 것은 꽝 없음 1층의 구조적 귀결이다.')
  console.log('    다나와 최저가는 소매가이고 실제 매입가는 다르다. MVP는 매입가를 모델링하지')
  console.log('    않았다 — SPEC §12에 가정으로 적혀 있다. 이 숫자를 사업성 근거로 읽지 말 것.')
  console.log(`\n  ${total}개 항목 · ${allFails.length === 0 ? '전부 통과' : `${allFails.length}건 실패: ${allFails.join(', ')}`}`)
  if (allFails.length) process.exitCode = 1
}
