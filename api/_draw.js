/**
 * 올박스의 심장 — 박스 정의 · 확률 곡선 · 꽝 없음 하한 · 추첨.
 *
 * 확률표를 손으로 적지 않는다. 아래 두 곡선이 계산한 값을 화면도 추첨도 그대로 쓴다.
 * 크롤한 실제 시세(api/_pool.js)가 계산의 입력이므로, 크롤 결과가 바뀌면 확률이 바뀌고
 * 예산 제약을 넘으면 self-check가 깨진다.
 *
 * 실행:  node api/_draw.js     (확률표 출력 + 자체 검증)
 */
import POOL from './_pool.js'

// ─────────────────────────── 상수 ───────────────────────────
export const TEAM_MAX = 10
export const MAX_DRAWS_PER_PERSON = 5 // 과금 압박 상한. 의도적으로 낮게 둔다.
export const MARGIN = 0.05 // 회차 기여마진율

// 로지스틱 공통 파라미터. N0가 두 곡선의 변곡점을 한 지점에 겹쳐 놓는다.
export const K = 0.8
export const N0 = 5.5

// ① 매입 원가율 — 수량할인 계단(MOQ 임계)의 평활화.
//    산지·공장 직거래 단가표는 실제로 계단식이다. 임계 아래는 소매가에 가깝고(0.62),
//    넘으면 급격히 떨어져 대량 단가(0.38)로 수렴한다.
export const CR_MIN = 0.38
export const CR_MAX = 0.62

// ② 바이럴 회수 — Bass(1969) 확산모형의 모방(imitation) 항.
//    2~3명 팀은 대개 가족·동거인이라 신규 획득이 아니다. 지인 네트워크 바깥으로
//    나가는 임계를 넘어야 진짜 바이럴이 시작된다.
export const CAC = 12000 // 커머스 신규 고객 획득비용 (가정)
export const VIRAL_MAX = 0.65 // 팀원 중 신규 유입 상한 비율 (가정)
// 회수분을 참여비에 비례해 자른다. 2,000원 박스에 12,000원 CAC를 통째로 태우면
// 확률 예산이 폭주해 P(C)가 음수가 된다(1차 구현에서 실제로 그랬다).
export const CAC_CAP = 1.2

// 잉여 예산을 상위 티어에 나누는 비율
export const SPLIT = { S: 0.45, A: 0.35, B: 0.2 }
// 예산이 남아도 C 비중을 이 아래로 내리지 않는다. 재고·물류가 감당하지 못한다.
export const MIN_C_SHARE = 0.2

// 회차 고정비(정산·CS·물류 스케줄링) / 참여비.
// 확률 예산과는 별개의 회계이며, 회사 손익분기를 정하는 값이다.
export const FIXED_COST_RATIO = 0.28

// 참여비는 최고 상품가에 비례한다: entry = topRetail / PRICE_RATIO
export const PRICE_RATIO = 200
// 티어 밴드 — 참여비 배수. C의 하한이 1.0이라 어떤 티어를 뽑아도 시가 ≥ 참여비다.
export const BANDS = { C: [1, 1.5], B: [1.5, 6], A: [6, 40], S: [100, 250] }
export const MIN_TIER_ITEMS = 3
export const TIERS = ['S', 'A', 'B', 'C']

export const BOXES = [
  {
    id: 'starter',
    name: '오늘의 올박스',
    entry: 2000,
    topLabel: '하이클래스팩급',
    blurb: '기본은 늘 쓰는 생필품, 최고는 포켓몬 하이클래스팩',
    // 등급별로 어떤 그룹에서 뽑을지 제한한다. 최고 등급에 커피머신이 섞이면
    // "최고 등급 하이클래스팩"이라는 약속이 흐려진다.
    tierGroups: { S: ['card'], A: null, B: null, C: ['daily'] },
  },
  {
    id: 'charizard',
    name: '리자몽 올박스',
    entry: 5000,
    topLabel: 'PSA 10 리자몽급',
    blurb: '기본은 생필품, 최고는 오리파가 파는 바로 그 카드',
    tierGroups: { S: ['card'], A: null, B: null, C: ['daily'] },
  },
]

/**
 * 공동구매형 — 상품이 **확정**이고 확률은 '얼마를 내는가'에만 작동한다.
 *
 * 랜덤박스형이 "무엇을 받는가"를 확률에 맡긴다면, 이쪽은 주문한 그 유니폼이
 * 그대로 온다. 대신 팀이 커질수록 **무료 당첨 인원이 늘어난다**.
 * 안 당첨돼도 정가보다 싸게 산 유니폼이 오므로 잃을 것이 구조적으로 없고,
 * 그래서 사행성 논란에서 완전히 자유롭다.
 *
 * 유니폼은 사이즈·마킹 때문에 원래도 여럿이 모여 한 번에 발주하는 품목이라
 * 최소 주문 수량(minTeam)이 실제로 존재한다. 그 임계를 그대로 쓴다.
 */
export const FREE_SHARE = 0.15 // 할인 여력 중 무료 당첨에 배정하는 비율

export const GROUPBUYS = [
  {
    id: 'uniform',
    name: '유니폼 팀구매',
    blurb: '마킹까지 넣어 한 번에 발주합니다. 모일수록 싸지고, 몇 명은 공짜입니다.',
    match: /유니폼|저지/,
    minTeam: 20, // 이 인원을 넘어야 발주가 나간다
    teamMax: 60,
    // 유니폼 발주의 수량할인은 20~60장 구간에서 열린다. 박스보다 완만한 곡선.
    k: 0.12,
    n0: 30,
    crMin: 0.42,
    crMax: 0.78,
  },
]

// ───────────────────── 풀 → 티어 구성 ─────────────────────
const byId = new Map(POOL.items.map((i) => [i.id, i]))

/** 박스의 티어별 상품 목록. 밴드는 참여비 배수로 정의된다. */
export function tiersOf(box, pickedIds = null) {
  const pool = pickedIds ? POOL.items.filter((i) => pickedIds.includes(i.id)) : POOL.items
  const out = {}
  for (const t of TIERS) {
    const [lo, hi] = BANDS[t]
    const only = box.tierGroups?.[t] || null
    out[t] = pool.filter(
      (i) => i.price >= box.entry * lo && i.price < box.entry * hi && (!only || only.includes(i.group))
    )
  }
  return out
}

/** 티어 평균 시가. 하드코딩하지 않고 실제 크롤 가격에서 계산한다. */
export function tierMeanRetail(tiers) {
  const m = {}
  for (const t of TIERS) {
    const xs = tiers[t]
    m[t] = xs.length ? xs.reduce((s, i) => s + i.price, 0) / xs.length : 0
  }
  return m
}

/**
 * 큐레이션 결과로 티어가 비면 위 티어로만 승계한다. 아래로는 절대 안 내려간다.
 * 이것이 꽝 없음을 지키는 세 번째 층이다(첫째: 크롤 하한, 둘째: 밴드 정의).
 */
export function collapseUp(tiers) {
  const out = { ...tiers }
  for (let i = TIERS.length - 1; i > 0; i--) {
    const cur = TIERS[i]
    if (out[cur].length >= MIN_TIER_ITEMS) continue
    const up = TIERS[i - 1]
    out[up] = [...out[up], ...out[cur]]
    out[cur] = []
  }
  return out
}

// ─────────────────────── 곡선과 확률 ───────────────────────
/** 매입 원가율. m = 팀 총 뽑기 수(물량). 개인이 더 뽑으면 전원의 원가율이 내려간다. */
export const costRatio = (m) =>
  CR_MIN + (CR_MAX - CR_MIN) / (1 + Math.exp(K * (Math.min(TEAM_MAX, Math.max(1, m)) - N0)))

/** 1인당 CAC 회수. n = 팀 인원. 같은 사람이 더 뽑는다고 신규 고객이 늘지는 않는다. */
export const cacRecovered = (box, n) =>
  (Math.min(CAC, box.entry * CAC_CAP) * VIRAL_MAX) /
  (1 + Math.exp(-K * (Math.min(TEAM_MAX, Math.max(1, n)) - N0)))

/** 1인당 상품 예산(원가 기준). */
export const budgetOf = (box, n) => box.entry * (1 - MARGIN) + cacRecovered(box, n)

/**
 * 확률표. 예산 제약을 등식으로 풀어 얻는다.
 *   예산 = cr · [ Σ_t P(t)·m(t) ]   그리고  Σ P(t) = 1
 *   ⇒ 예산/cr − m(C) = Σ_{t≠C} P(t)·( m(t) − m(C) )
 * 좌변(잉여시가)을 SPLIT 비율로 나눠 상위 티어 확률을 얻는다.
 */
export function oddsOf(box, teamSize, teamDraws = teamSize, tiers = null) {
  const T = tiers || collapseUp(tiersOf(box))
  const m = tierMeanRetail(T)
  const cr = costRatio(teamDraws)
  const surplus = budgetOf(box, teamSize) / cr - m.C

  const P = {}
  let upper = 0
  for (const t of ['S', 'A', 'B']) {
    // 티어가 비었거나 C와 시가 차이가 없으면 확률을 만들지 않는다.
    P[t] = T[t].length && m[t] > m.C ? Math.max(0, (surplus * SPLIT[t]) / (m[t] - m.C)) : 0
    upper += P[t]
  }
  if (upper > 1 - MIN_C_SHARE) {
    const f = (1 - MIN_C_SHARE) / upper
    for (const t of ['S', 'A', 'B']) P[t] *= f
    upper = 1 - MIN_C_SHARE
  }
  P.C = 1 - upper
  return P
}

/** 팀 규모별 확률표 전체 (화면의 '더보기' 표가 이걸 그대로 쓴다). */
export const oddsTable = (box) =>
  Object.fromEntries(Array.from({ length: TEAM_MAX }, (_, i) => [i + 1, oddsOf(box, i + 1)]))

// ─────────────────────── 단위경제 ───────────────────────
/** 1인당 기대 수령 시가 ÷ 참여비. */
export function evMultiple(box, n) {
  const T = collapseUp(tiersOf(box))
  const m = tierMeanRetail(T)
  const P = oddsOf(box, n, n, T)
  return TIERS.reduce((s, t) => s + P[t] * m[t], 0) / box.entry
}

/** 회차 기여이익 = n·참여비·마진 − 회차 고정비. 확률 예산과는 별개의 회계다. */
export const contribution = (box, n) => n * box.entry * MARGIN - box.entry * FIXED_COST_RATIO

/** 회사 손익분기 — 회차가 흑자로 돌아서는 인원. 참여비에 무관한 상수가 된다. */
export const companyBEP = () => Math.ceil(FIXED_COST_RATIO / MARGIN)

/** 고객 체감 분기 — 기대 수령 시가가 참여비의 2배를 넘는 인원. */
export function customerBEP(box, x = 2) {
  for (let n = 1; n <= TEAM_MAX; n++) if (evMultiple(box, n) >= x) return n
  return null
}

// ─────────────────────── 공동구매형 ───────────────────────
const clampTeam = (gb, n) => Math.min(gb.teamMax, Math.max(1, Math.floor(n) || 1))

/** 발주 수량이 늘수록 내려가는 매입 원가율. 박스와 같은 로지스틱, 파라미터만 다르다. */
export const gbCostRatio = (gb, n) =>
  gb.crMin + (gb.crMax - gb.crMin) / (1 + Math.exp(gb.k * (clampTeam(gb, n) - gb.n0)))

/** 정가 대비 내릴 수 있는 최대 폭. 올웨이즈가 공개한 20~60% 할인폭과 같은 자리다. */
export const gbHeadroom = (gb, n) => Math.max(0, 1 - gbCostRatio(gb, n) / (1 - MARGIN))

/** 그 여력을 전원 할인과 무료 당첨으로 나눈다. */
export const gbDiscount = (gb, n) => gbHeadroom(gb, n) * (1 - FREE_SHARE)
export const gbPayRatio = (gb, n) => 1 - gbDiscount(gb, n)
export const gbFreeOdds = (gb, n) => (gbHeadroom(gb, n) * FREE_SHARE) / gbPayRatio(gb, n)
export const gbFreeCount = (gb, n) => Math.floor(clampTeam(gb, n) * gbFreeOdds(gb, n))

/** 이 공동구매가 취급하는 상품. 크롤 풀에서 가장 비싼 것을 대표로 세운다. */
export const gbItem = (gb) =>
  POOL.items.filter((i) => i.group === 'uniform' && gb.match.test(i.name)).sort((a, b) => b.price - a.price)[0]

/** 당첨자 선정. 방·상품·회차 시드로 고정되므로 다시 열어도 같은 사람이 당첨된다. */
export function gbDraw(gb, memberIds, roomId) {
  const n = memberIds.length
  const k = Math.min(n, gbFreeCount(gb, n))
  const rnd = rngFor(`${roomId}|${gb.id}|${n}`)
  // Fisher-Yates로 섞어 앞에서 k명. 인원이 바뀌면 시드가 바뀌어 결과도 바뀐다
  // (발주 전이라 아직 확정이 아니라는 뜻이고, 화면에도 그렇게 적는다).
  const order = [...memberIds]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return new Set(order.slice(0, k))
}

export const getGroupbuy = (id) => GROUPBUYS.find((g) => g.id === id) || null

// ─────────────────────── 추첨 (서버 전용) ───────────────────────
// 시드 = (roomId, boxId, memberId, drawIndex). 같은 방을 다시 열면 같은 결과가 나온다.
// 재추첨이 불가능하다는 것을 방 ID 자체가 증명한다.
function xmur3(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}
function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export const rngFor = (seed) => mulberry32(xmur3(String(seed))())

/** 한 번의 추첨. 티어를 뽑고, 그 티어 안에서 상품을 뽑는다. 둘 다 서버에서만. */
export function drawOne(box, P, tiers, seed) {
  const rnd = rngFor(seed)
  const r = rnd()
  let acc = 0
  let tier = 'C'
  for (const t of TIERS) {
    acc += P[t]
    if (r < acc) {
      tier = t
      break
    }
  }
  let pool = tiers[tier]
  // 방어: 뽑힌 티어가 비어 있으면 **아래로** 내려간다.
  // 위로 올리면 싼 등급을 뽑은 사람에게 비싼 상품을 주게 되어 단위경제가 무너진다
  // (큐레이션이 기저 등급을 비웠을 때 실제로 그런 상자가 만들어졌다).
  if (!pool.length) {
    const i = TIERS.indexOf(tier)
    for (let j = i + 1; j < TIERS.length && !pool.length; j++)
      if (tiers[TIERS[j]].length) { tier = TIERS[j]; pool = tiers[tier] }
    for (let j = i - 1; j >= 0 && !pool.length; j--)
      if (tiers[TIERS[j]].length) { tier = TIERS[j]; pool = tiers[tier] }
  }
  const item = pool[Math.floor(rnd() * pool.length)]
  return { tier, item }
}

// ─────────────────────── 표기 ───────────────────────
/**
 * 자연빈도 병기 — Gigerenzer & Hoffrage(1995, Psychological Review 102, 684–704).
 * 확률 형식은 오인되고 빈도 형식은 덜 오인된다는 것이 검증된 유일한 결과다.
 */
export function naturalFrequency(p, base = 1000) {
  const n = p * base
  if (n >= 1) return `${base.toLocaleString()}명이 뽑으면 약 ${Math.round(n).toLocaleString()}명`
  const need = Math.round(1 / p)
  return `${need.toLocaleString()}명이 뽑으면 약 1명`
}

export const getBox = (id) => BOXES.find((b) => b.id === id) || null
export const poolMeta = () => ({
  crawledAt: POOL.crawledAt,
  source: POOL.source,
  size: POOL.items.length,
  minPrice: POOL.minPrice,
})
export { byId, POOL }

// ─────────────────────── 자체 검증 ───────────────────────
// 이 파일은 import되는 모듈이면서 동시에 실행 가능한 테스트다.
if (process.argv[1]?.endsWith('_draw.js')) {
  const { strict: assert } = await import('node:assert')
  let checks = 0
  const ok = (label, cond, extra = '') => {
    checks++
    if (!cond) throw new Error(`✗ ${label}${extra ? ' — ' + extra : ''}`)
  }

  console.log(`풀 ${POOL.items.length}건 · 크롤 ${POOL.crawledAt}\n`)

  for (const box of BOXES) {
    const T = collapseUp(tiersOf(box))
    const m = tierMeanRetail(T)
    console.log(`■ ${box.name}  참여비 ${box.entry.toLocaleString()}원`)
    console.log(
      `  티어 ${TIERS.map((t) => `${t}:${T[t].length}건/${Math.round(m[t]).toLocaleString()}원`).join('  ')}`
    )
    console.log('   n   P(S)      P(A)     P(B)     P(C)    기대배수  증분(%p)')

    let prev = null
    const inc = []
    for (let n = 1; n <= TEAM_MAX; n++) {
      const P = oddsOf(box, n)
      const s = P.S * 100
      const d = prev === null ? null : s - prev
      prev = s
      inc.push(d)
      console.log(
        `  ${String(n).padStart(2)} ${s.toFixed(4).padStart(8)}% ${(P.A * 100).toFixed(2).padStart(7)}% ` +
          `${(P.B * 100).toFixed(2).padStart(7)}% ${(P.C * 100).toFixed(2).padStart(7)}% ` +
          `${evMultiple(box, n).toFixed(2).padStart(7)}배 ${d === null ? '     —' : ('+' + d.toFixed(4)).padStart(9)}`
      )

      // 확률의 기본 성질
      ok(`${box.id} n=${n} 확률 합 1`, Math.abs(TIERS.reduce((a, t) => a + P[t], 0) - 1) < 1e-9)
      ok(`${box.id} n=${n} 확률 음수 없음`, TIERS.every((t) => P[t] >= 0))
      ok(`${box.id} n=${n} C 하한 유지`, P.C >= MIN_C_SHARE - 1e-9, `P(C)=${P.C}`)

      // 예산 제약 — 상품에 쓰는 원가가 1인당 예산을 넘지 않는다
      const spend = TIERS.reduce((a, t) => a + P[t] * m[t], 0) * costRatio(n)
      ok(`${box.id} n=${n} 예산 제약`, spend <= budgetOf(box, n) + 1e-6,
        `지출 ${Math.round(spend)} > 예산 ${Math.round(budgetOf(box, n))}`)

      // 꽝 없음 — 어떤 티어를 뽑아도 최저 시가가 참여비 이상
      for (const t of TIERS)
        for (const it of T[t])
          ok(`${box.id} ${t} 하한`, it.price >= box.entry, `${it.name} ${it.price}`)

      // 팀이 커지면 실제로 이득이 커진다
      if (n > 1) ok(`${box.id} EV 단조증가`, evMultiple(box, n) > evMultiple(box, n - 1))
    }

    // S자 — 2차 차분의 부호가 양→음으로 정확히 한 번만 바뀐다(변곡점 유일)
    const signs = []
    for (let i = 2; i < inc.length; i++) signs.push(Math.sign(inc[i] - inc[i - 1]))
    const flips = signs.slice(1).filter((s, i) => s !== signs[i] && s !== 0).length
    ok(`${box.id} S자(변곡점 유일)`, flips === 1, `부호 전환 ${flips}회`)

    const maxIdx = inc.indexOf(Math.max(...inc.filter((x) => x !== null)))
    ok(`${box.id} 변곡점이 6→7명`, maxIdx === 6, `실제 ${maxIdx}→${maxIdx + 1}명`)
    ok(`${box.id} 확률 단조증가`, inc.slice(1).every((d) => d > 0))

    console.log(
      `  상승폭 ${(oddsOf(box, 10).S / oddsOf(box, 1).S).toFixed(2)}배 · ` +
        `최대 증분 ${maxIdx}→${maxIdx + 1}명 · 고객 체감 분기 ${customerBEP(box)}명 · ` +
        `S 자연빈도(10명) ${naturalFrequency(oddsOf(box, 10).S)}\n`
    )
  }

  ok('회사 손익분기 6명', companyBEP() === 6, `실제 ${companyBEP()}명`)
  ok('회사 손익분기 이전은 적자', contribution(BOXES[1], 5) < 0)
  ok('회사 손익분기부터 흑자', contribution(BOXES[1], 6) > 0)

  // 10만 회 추첨 — 공표 확률과 실제 배출이 일치하는가 (고정 시드라 flaky하지 않다)
  const box = getBox('charizard')
  const T = collapseUp(tiersOf(box))
  const P = oddsOf(box, 10)
  const N = 100000
  const obs = { S: 0, A: 0, B: 0, C: 0 }
  let minPrice = Infinity
  for (let i = 0; i < N; i++) {
    const { tier, item } = drawOne(box, P, T, `chk|${box.id}|${i}`)
    obs[tier]++
    if (item.price < minPrice) minPrice = item.price
  }
  const chi = TIERS.reduce((a, t) => {
    const e = P[t] * N
    return a + ((obs[t] - e) * (obs[t] - e)) / e
  }, 0)
  ok('카이제곱 df=3 p>0.001', chi < 16.27, `X²=${chi.toFixed(2)}`)
  ok('10만 회 전건 꽝 없음', minPrice >= box.entry, `최저 ${minPrice} < ${box.entry}`)

  // 같은 시드 = 같은 결과 (재추첨 불가)
  const a1 = drawOne(box, P, T, 'room7|ipad|m1|0')
  const a2 = drawOne(box, P, T, 'room7|ipad|m1|0')
  ok('같은 시드 = 같은 결과', a1.tier === a2.tier && a1.item.id === a2.item.id)

  // collapseUp은 위로만 승계한다
  const holed = { ...tiersOf(box), C: [] }
  const fixed = collapseUp(holed)
  ok('collapseUp 후에도 하한 유지',
    TIERS.every((t) => fixed[t].every((i) => i.price >= box.entry)))

  // ── 공동구매형 ──────────────────────────────────────────
  console.log('')
  for (const gb of GROUPBUYS) {
    const it = gbItem(gb)
    ok(`${gb.id} 대표 상품 존재`, Boolean(it))
    console.log(`■ ${gb.name} — ${it.name.slice(0, 38)} ${it.price.toLocaleString()}원`)
    console.log('   n   원가율   전원할인   실지불      무료확률  무료인원')
    let prevOdds = -1
    for (let n = gb.minTeam; n <= gb.teamMax; n++) {
      const cr = gbCostRatio(gb, n)
      const pay = gbPayRatio(gb, n)
      const odds = gbFreeOdds(gb, n)
      const k = gbFreeCount(gb, n)

      ok(`${gb.id} n=${n} 항상 할인`, pay < 1, `지불비율 ${pay}`)
      ok(`${gb.id} n=${n} 무료 확률 단조증가`, odds > prevOdds, `${prevOdds} → ${odds}`)
      prevOdds = odds
      ok(`${gb.id} n=${n} 최소 1명 무료`, k >= 1, `${k}명`)
      ok(`${gb.id} n=${n} 당첨자가 팀보다 적다`, k < n)
      // 예산 제약 — 받은 돈으로 상품 원가와 당첨자 몫을 모두 감당하는가
      const revenue = n * pay * (1 - MARGIN)
      const cost = (n + k) * cr
      ok(`${gb.id} n=${n} 예산 제약`, revenue >= cost - 1e-9,
        `수입 ${revenue.toFixed(3)} < 원가 ${cost.toFixed(3)}`)

      if ([gb.minTeam, 30, 40, gb.teamMax].includes(n))
        console.log(
          `  ${String(n).padStart(2)} ${cr.toFixed(4)}   ${(gbDiscount(gb, n) * 100).toFixed(1)}%    ` +
            `${Math.round(it.price * pay).toLocaleString().padStart(9)}원  ${(odds * 100).toFixed(2)}%     ${k}명`
        )
    }
    // 당첨자 선정의 결정론성
    const ids = Array.from({ length: 30 }, (_, i) => `m${i}`)
    const w1 = gbDraw(gb, ids, 'roomA')
    const w2 = gbDraw(gb, ids, 'roomA')
    ok(`${gb.id} 같은 방 = 같은 당첨자`, [...w1].join() === [...w2].join())
    ok(`${gb.id} 당첨 인원 = 계산값`, w1.size === gbFreeCount(gb, 30), `${w1.size}`)
    ok(`${gb.id} 다른 방 = 다른 당첨자`, [...gbDraw(gb, ids, 'roomB')].join() !== [...w1].join())
  }

  console.log(
    `\n10만 회 추첨: S ${obs.S} A ${obs.A} B ${obs.B} C ${obs.C} · X²=${chi.toFixed(2)} · 최저 시가 ${minPrice.toLocaleString()}원`
  )
  const pct = (x) => +(x * 100).toFixed(1)
  console.log(`회사 손익분기 ${companyBEP()}명 (회차 고정비 ${pct(FIXED_COST_RATIO)}% / 마진 ${pct(MARGIN)}%)`)
  console.log(`\n✓ ${checks.toLocaleString()}개 검사 통과`)
}
