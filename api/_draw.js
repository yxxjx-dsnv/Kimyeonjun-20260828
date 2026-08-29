/**
 * 올박스의 심장 — 캠페인 포맷 정의 · 확률 · 추첨.
 *
 * 올박스는 하나의 상품이 아니라 **여러 캠페인 포맷이 매주 교체되며 도는 엔진**이다.
 * 포맷마다 무엇이 무작위인지, 꽝이 있는지, 참여비가 얼마인지가 다르다.
 *
 *   ① 팀 뽑기 (team-draw)  — 등급별 개수가 정해진 뽑기 통. 전원 준비 → 즉시 개봉.
 *                            혼자보다 여럿이 하면 상위 등급 확률이 오른다. 꽝 없음.
 *   ② 데일리 100원 (daily) — 100원·하루 1회·재고 소진까지. **꽝 있음, 확률 전부 공개.**
 *   ③ 공동구매 (group-buy) — 상품은 확정, 확률은 '얼마를 내는가'에만. 꽝 없음.
 *
 * **확률을 손으로 적지 않는다.**
 *   ①은 재고 비율에서, ②는 단위경제에서, ③은 할인 여력에서 유도한다.
 *   크롤한 실제 시세(api/_pool.js)가 전부의 입력이라, 크롤이 바뀌면 확률이 바뀌고
 *   예산 제약을 넘으면 self-check가 깨진다.
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

/**
 * ① 팀 뽑기 — **고정 재고 뽑기 통**.
 *
 * 이전 구현은 "인원이 늘면 예산이 늘어 확률이 오르는" 무한 재고 모델이었다.
 * 실제 뽑기는 그렇지 않다. **등급별 상품 개수가 미리 정해져 있고**, 기본 확률은
 * 그 재고 비율 그대로다(S 1개 / 1,000개 = 0.1%). 확률을 지어낼 여지가 없다.
 *
 * 여럿이 모이면 상위 등급 확률에 **구매력 배수**를 곱한다. 그 배수의 재원은
 * 대량 매입 원가 절감(costRatio)과 신규 고객 획득비 회수(cacRecovered)이며,
 * 재고가 상한이라 예산이 남아도 확률을 임의로 더 올리지 못한다.
 */
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
    // 뽑기 통 — 이번 회차에 실제로 준비된 개수. 합이 곧 총 구좌 수다.
    stock: { S: 1, A: 6, B: 40, C: 953 },
    // 천장 — 연속 window회 S 미당첨이면 다음 회차 S 확률을 boostTo로 끌어올린다.
    // 게임산업법 시행령(2024.3.22)은 이런 천장(보장) 조건과 변동 확률도 공시 대상으로 명시한다.
    pity: { window: 10, boostTo: 0.05 },
  },
  {
    id: 'charizard',
    name: '리자몽 올박스',
    entry: 5000,
    topLabel: 'PSA 10 리자몽급',
    blurb: '기본은 생필품, 최고는 오리파가 파는 바로 그 카드',
    tierGroups: { S: ['card'], A: null, B: null, C: ['daily'] },
    stock: { S: 1, A: 4, B: 25, C: 970 },
    pity: { window: 10, boostTo: 0.05 },
  },
]

/**
 * ② 데일리 100원 — 재고 소진형. **꽝이 있다.**
 *
 * 올박스의 모든 포맷이 꽝 없음을 지키는 것은 아니다. 100원은 스피또 최저가(500원)의
 * 5분의 1이라 "잃어도 생활에 영향이 없는 금액"이고, 대신 **꽝 확률까지 그대로 공개**한다.
 * 정직성의 축이 '무손실'이 아니라 '완전 공개'로 옮겨가는 포맷이다.
 *
 * 당첨 확률은 지어내지 않는다. 상품 원가를 1인당 순수입으로 나눈 손익분기에서 유도한다.
 */
export const DAILIES = [
  {
    id: 'daily100',
    name: '오늘의 100원 뽑기',
    entry: 100,
    blurb: '하루 한 번, 100원. 재고가 소진되면 이번 회차는 끝납니다.',
    match: /홍삼|흑마늘/,
    totalStock: 100, // 이번 회차에 준비한 경품 수
    dailyLimit: 1,
    blank: true, // 꽝 있음 — 숨기지 않는다
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

/**
 * ④ 래플 — 선착순의 공정한 대안.
 *
 * 인기 상품 특가는 보통 선착순인데, 선착순은 봇과 새로고침 경쟁이 이긴다
 * (나이키가 SNKRS를 선착순에서 추첨으로 바꾼 이유). 올박스 래플은
 * **응모 무료·추첨 배분**이다. 낙첨해도 잃는 것이 0원이다.
 *
 * 특가의 재원: 래플 물량은 만석 공동구매와 같은 조건으로 **선발주가 확정된
 * 재고**다. 만석 원가율로 매입했으므로 만석가로 팔 수 있고, 수량만 재고로
 * 제한된다. 즉 할인율을 지어내지 않는다 — 같은 곡선의 끝값이다.
 */
export const RAFFLES = [
  {
    id: 'raffle-pack',
    name: '포켓몬 하이클래스팩 래플',
    blurb: '0원 응모. 당첨되면 특가에 살 수 있는 권리를 드려요.',
    match: /하이클래스/,
    group: 'card',
    stock: 3, // 특가로 풀리는 수량
    crAtFull: 0.62, // 선발주(만석) 매입 원가율 — 카드류는 유통 마진이 얇아 보수적으로
  },
]

/** 래플 상품 — 크롤 풀에서 매칭되는 가장 비싼 것. */
export const rfItem = (r) =>
  POOL.items.filter((i) => i.group === r.group && r.match.test(i.name)).sort((a, b) => b.price - a.price)[0]

/** 래플가 = 원가율 / (1 − 마진). 판매가에도 마진이 남는 지점 — 회사가 손해보지 않는 하한. */
export const rfPayRatio = (r) => r.crAtFull / (1 - MARGIN)
export const rfPrice = (r) => Math.round(rfItem(r).price * rfPayRatio(r))
export const rfDiscount = (r) => 1 - rfPayRatio(r)

/** 당첨 확률 = 수량 ÷ 응모자. 응모가 늘수록 내려간다 — 숨길 것 없는 나눗셈. */
export const rfOdds = (r, entrants) => Math.min(1, r.stock / Math.max(1, entrants))

/**
 * 래플 추첨 — 응모 순번(1..entrants) 중 stock개를 시드로 뽑는다.
 * 시드가 (래플, 날짜, 응모자 수)로 고정되어 마감 후 재추첨이 불가능하다.
 */
export function rfDraw(r, entrants, day) {
  const k = Math.min(r.stock, Math.max(0, entrants))
  const rnd = rngFor(`${r.id}|${day}|${entrants}`)
  const order = Array.from({ length: entrants }, (_, i) => i + 1)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return new Set(order.slice(0, k))
}

export const getRaffle = (id) => RAFFLES.find((x) => x.id === id) || null

/**
 * ⑤ 무손실 적금 — 이자를 모아 상금으로, 원금은 그대로.
 *
 * Prize-Linked Savings: 각자 받을 이자를 풀에 모아 추첨으로 한 명에게
 * 몰아준다. 낙첨자는 **원금을 전액 돌려받는다** — 기대값은 일반 적금과
 * 같고 분산만 재배분된다. 영국 Premium Bonds(1956~)가 이 구조로 국민
 * 저축상품이 됐고, 미국 Save to Win 실증에서 저축 유인이 확인됐다.
 *
 * 확률 = 내 적립 ÷ 전체 적립 (1,000원 = 티켓 1장, Premium Bonds 방식).
 * 상금 = 전체 적립 × 주간 이자율. 어느 것도 손으로 적지 않는다.
 */
export const SAVEUPS = [
  {
    id: 'saveup',
    name: '잃지 않는 올박스 적금',
    blurb: '이자만 모아 추첨해요. 꽝이어도 원금은 100% 그대로.',
    apr: 0.03, // 연 이자율 가정 — 시중 파킹통장 수준
    unit: 1000, // 티켓 1장 단위
    myMax: 10000, // 데모에서 1인 적립 상한
    // 데모용 시뮬 참여 풀. 실서비스에선 실제 적립 합계가 이 자리에 온다.
    sim: { members: 412, total: 3_296_000 },
  },
]

export const svPrize = (sv, total) => Math.round(total * (sv.apr / 52))
export const svOdds = (sv, my, total) => (total > 0 ? my / total : 0)

/**
 * 주간 추첨 — 당첨 티켓 하나를 뽑는다. 데모에서 내 티켓은 풀의 맨 뒤
 * 구간(가장 최근 적립)이다. 시드 = (적금, 주차, 전체액)으로 고정.
 */
export function svDraw(sv, my, total, week) {
  const rnd = rngFor(`${sv.id}|${week}|${total}`)
  const ticket = Math.floor(rnd() * total)
  return { ticket, win: ticket >= total - my }
}

export const getSaveup = (id) => SAVEUPS.find((x) => x.id === id) || null

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

/** 뽑기 통의 총 구좌 수. 등급별 재고의 합. */
export const stockTotal = (box) => TIERS.reduce((a, t) => a + (box.stock?.[t] || 0), 0)

/** 기본 확률 = 재고 비율. 지어낼 여지가 없다. */
export function baseOdds(box) {
  const tot = stockTotal(box)
  return Object.fromEntries(TIERS.map((t) => [t, (box.stock?.[t] || 0) / tot]))
}

/**
 * 구매력 배수 — 여럿이 모였을 때 상위 등급 확률에 곱하는 값.
 *
 * 재원은 두 곡선이다. 대량 매입으로 원가율이 내려가고(costRatio), 팀원 중
 * 신규 유입만큼 고객 획득비가 회수된다(cacRecovered). 그 둘이 만든 1인당
 * 구매력을 혼자일 때와 비교한 비율이 곧 배수다. n=1이면 정확히 1.0이다.
 */
export function teamBoost(box, n) {
  const power = (k) => budgetOf(box, k) / costRatio(k)
  return power(Math.min(TEAM_MAX, Math.max(1, n))) / power(1)
}

/**
 * 확률표 — 재고 비율에 구매력 배수를 곱하고, 기본 등급이 나머지를 흡수한다.
 *
 * pityMiss: 이 참여자의 연속 S 미당첨 횟수. window에 도달하면 S 확률을
 * box.pity.boostTo로 끌어올린다(천장). 그만큼 기본 등급에서 가져온다.
 */
export function oddsOf(box, teamSize, teamDraws = teamSize, tiers = null, pityMiss = 0) {
  const base = baseOdds(box)
  const boost = teamBoost(box, teamSize)
  const T = tiers || collapseUp(tiersOf(box))

  const P = {}
  let upper = 0
  for (const t of ['S', 'A', 'B']) {
    // 재고가 0이거나 해당 등급에 넣을 상품이 없으면 확률을 만들지 않는다.
    P[t] = T[t].length ? base[t] * boost : 0
    upper += P[t]
  }
  // 천장 — 임계에 도달했으면 S를 끌어올린다. 나머지는 기본 등급에서 뺀다.
  const pity = box.pity
  if (pity && pityMiss >= pity.window && T.S.length && P.S < pity.boostTo) {
    upper += pity.boostTo - P.S
    P.S = pity.boostTo
  }
  if (upper > 1 - MIN_C_SHARE) {
    const f = (1 - MIN_C_SHARE) / upper
    for (const t of ['S', 'A', 'B']) P[t] *= f
    upper = 1 - MIN_C_SHARE
  }
  P.C = 1 - upper
  return P
}

/** 천장까지 남은 횟수. 화면이 "S 미당첨 7/10"으로 보여준다. */
export const pityLeft = (box, pityMiss) =>
  box.pity ? Math.max(0, box.pity.window - pityMiss) : null

/** 팀 규모별 확률표 전체 (화면의 '더보기' 표가 이걸 그대로 쓴다). */
export const oddsTable = (box) =>
  Object.fromEntries(Array.from({ length: TEAM_MAX }, (_, i) => [i + 1, oddsOf(box, i + 1)]))

// ─────────────────────── 단위경제 ───────────────────────
/** 1인당 기대 수령 시가 ÷ 참여비. */
export function evMultiple(box, n, pityMiss = 0) {
  const T = collapseUp(tiersOf(box))
  const m = tierMeanRetail(T)
  const P = oddsOf(box, n, n, T, pityMiss)
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

// ─────────────────────── ② 데일리 100원 ───────────────────────
/**
 * 이 회차가 거는 경품. 크롤 풀에서 고른다(중앙값 근처를 대표로).
 * 상품이 실재하고 가격이 실측이라, 아래 확률도 실측에서 유도된다.
 */
export function dailyItem(d) {
  const xs = POOL.items.filter((i) => i.group === 'prize' && d.match.test(i.name))
  return xs.sort((a, b) => a.price - b.price)[Math.floor(xs.length / 2)] || xs[0]
}

/**
 * 당첨 확률 — 지어내지 않고 손익분기에서 유도한다.
 *
 *   경품 원가 = 시가 × 대량 매입 원가율
 *   1인당 순수입 = 참여비 × (1 − 마진)
 *   손익분기 참여 수 = 경품 원가 ÷ 1인당 순수입
 *   당첨 확률 = 1 ÷ 손익분기 참여 수
 *
 * 즉 "이 확률보다 후하면 회차가 적자"인 지점을 그대로 확률로 쓴다.
 * 재고 소진형이라 물량은 totalStock으로 이미 상한이 걸려 있다.
 */
export const dailyCost = (d) => dailyItem(d).price * costRatio(TEAM_MAX)
export const dailyNetPerPlay = (d) => d.entry * (1 - MARGIN)
export const dailyBreakEvenPlays = (d) => dailyCost(d) / dailyNetPerPlay(d)
export const dailyWinOdds = (d) => 1 / dailyBreakEvenPlays(d)
export const dailyBlankOdds = (d) => 1 - dailyWinOdds(d)
/** 재고를 다 털려면 평균 몇 번의 참여가 필요한가. 회차 길이의 근거. */
export const dailyPlaysToExhaust = (d) => Math.round(d.totalStock * dailyBreakEvenPlays(d))

/** 한 번의 데일리 뽑기. 당첨/꽝뿐이라 티어 추첨보다 단순하다. */
export function dailyDraw(d, seed) {
  const rnd = rngFor(seed)
  return rnd() < dailyWinOdds(d) ? { win: true, item: dailyItem(d) } : { win: false, item: null }
}

export const getDaily = (id) => DAILIES.find((x) => x.id === id) || null

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
  queries: POOL.queries?.length ?? 0,
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

      // 재고 불변식 — 확률은 재고 비율에 구매력 배수를 곱한 값이어야 한다
      const bo = baseOdds(box)
      const boost = teamBoost(box, n)
      for (const t of ['S', 'A', 'B'])
        if (T[t].length && P.C > MIN_C_SHARE + 1e-9)
          ok(`${box.id} n=${n} ${t} = 재고비율×배수`,
            Math.abs(P[t] - bo[t] * boost) < 1e-9,
            `${P[t]} != ${bo[t] * boost}`)
    }

    // S자 — 2차 차분의 부호가 양→음으로 정확히 한 번만 바뀐다(변곡점 유일)
    const signs = []
    for (let i = 2; i < inc.length; i++) signs.push(Math.sign(inc[i] - inc[i - 1]))
    const flips = signs.slice(1).filter((s, i) => s !== signs[i] && s !== 0).length
    ok(`${box.id} S자(변곡점 유일)`, flips === 1, `부호 전환 ${flips}회`)

    const maxIdx = inc.indexOf(Math.max(...inc.filter((x) => x !== null)))
    ok(`${box.id} 변곡점이 6→7명`, maxIdx === 6, `실제 ${maxIdx}→${maxIdx + 1}명`)
    ok(`${box.id} 확률 단조증가`, inc.slice(1).every((d) => d > 0))

    // ── 재고 ──────────────────────────────────────────────
    ok(`${box.id} 재고 합 = 총 구좌`,
      TIERS.reduce((a, t) => a + box.stock[t], 0) === stockTotal(box))
    ok(`${box.id} 재고 전부 양수`, TIERS.every((t) => box.stock[t] > 0))
    ok(`${box.id} 혼자일 때 배수 1.0`, Math.abs(teamBoost(box, 1) - 1) < 1e-12)
    ok(`${box.id} 혼자일 때 확률 = 재고비율`,
      TIERS.every((t) => !T[t].length || Math.abs(oddsOf(box, 1)[t] - baseOdds(box)[t]) < 1e-9))
    ok(`${box.id} 배수 단조증가`,
      Array.from({ length: TEAM_MAX - 1 }, (_, i) => teamBoost(box, i + 2) > teamBoost(box, i + 1)).every(Boolean))

    // ── 천장 ──────────────────────────────────────────────
    const pw = box.pity.window
    ok(`${box.id} 천장 미도달이면 확률 불변`,
      Math.abs(oddsOf(box, 1, 1, null, pw - 1).S - oddsOf(box, 1, 1, null, 0).S) < 1e-12)
    ok(`${box.id} 천장 도달하면 S 상승`,
      oddsOf(box, 1, 1, null, pw).S > oddsOf(box, 1, 1, null, 0).S)
    ok(`${box.id} 천장 값이 공시값과 일치`,
      Math.abs(oddsOf(box, 1, 1, null, pw).S - box.pity.boostTo) < 1e-9)
    ok(`${box.id} 천장 후에도 확률 합 1`,
      Math.abs(TIERS.reduce((a, t) => a + oddsOf(box, 1, 1, null, pw)[t], 0) - 1) < 1e-9)
    ok(`${box.id} 천장 남은 횟수 표기`, pityLeft(box, pw - 3) === 3)
    console.log(
      `  재고 ${TIERS.map((t) => `${t}:${box.stock[t]}`).join(' ')} = ${stockTotal(box)}구좌 · ` +
        `천장 ${pw}회 → S ${(box.pity.boostTo * 100).toFixed(0)}%`
    )

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

  // ── 데일리 100원 ────────────────────────────────────────
  console.log('')
  for (const d of DAILIES) {
    const it = dailyItem(d)
    ok(`${d.id} 경품 존재`, Boolean(it))
    const win = dailyWinOdds(d)
    const blank = dailyBlankOdds(d)

    ok(`${d.id} 확률 합 1`, Math.abs(win + blank - 1) < 1e-12)
    ok(`${d.id} 꽝이 있다`, blank > 0 && d.blank === true)
    ok(`${d.id} 당첨 확률 0~1`, win > 0 && win < 1)
    // 손익분기에서 유도했으므로, 손익분기 횟수만큼 참여하면 경품 원가를 정확히 회수한다
    ok(`${d.id} 손익분기 정합`,
      Math.abs(dailyBreakEvenPlays(d) * dailyNetPerPlay(d) - dailyCost(d)) < 1e-6)
    ok(`${d.id} 참여비가 경품보다 훨씬 싸다`, d.entry * 100 < it.price)
    ok(`${d.id} 하루 1회 제한`, d.dailyLimit === 1)
    ok(`${d.id} 재고 양수`, d.totalStock > 0)

    // 10만 회 실측이 공시 확률과 맞는가 (고정 시드라 flaky하지 않다)
    const N = 100000
    let wins = 0
    for (let i = 0; i < N; i++) if (dailyDraw(d, `chk|${d.id}|${i}`).win) wins++
    const exp = win * N
    const chi = ((wins - exp) ** 2) / exp + ((N - wins - (N - exp)) ** 2) / (N - exp)
    ok(`${d.id} 카이제곱 df=1 p>0.001`, chi < 10.83, `X²=${chi.toFixed(2)}`)

    // 같은 시드 = 같은 결과
    ok(`${d.id} 재추첨 불가`,
      dailyDraw(d, 'seedX').win === dailyDraw(d, 'seedX').win)

    console.log(`■ ${d.name} — ${it.name.slice(0, 34)} ${it.price.toLocaleString()}원`)
    console.log(
      `  참여비 ${d.entry}원 · 경품원가 ${Math.round(dailyCost(d)).toLocaleString()}원 · ` +
        `손익분기 ${Math.round(dailyBreakEvenPlays(d))}회/개`
    )
    console.log(
      `  당첨 ${(win * 100).toFixed(3)}% · 꽝 ${(blank * 100).toFixed(3)}% · ` +
        `재고 ${d.totalStock}개 → 약 ${dailyPlaysToExhaust(d).toLocaleString()}회 참여로 소진`
    )
    console.log(`  10만 회 실측 ${wins}회 = ${(wins / 1000).toFixed(3)}% (X²=${chi.toFixed(2)})`)
  }

  // ── 캠페인 id 전역 유일성 (시드 충돌 방지) ──────────────
  {
    const ids = [...BOXES, ...DAILIES, ...GROUPBUYS, ...RAFFLES, ...SAVEUPS].map((c) => c.id)
    ok('캠페인 id 전역 유일', new Set(ids).size === ids.length, ids.join(','))
  }

  // ── 공동구매형 ──────────────────────────────────────────
  console.log('')
  // ── ④ 래플 검사 ──
  for (const r of RAFFLES) {
    const it = rfItem(r)
    ok(`${r.id} 상품 존재`, Boolean(it), r.match.source)
    ok(`${r.id} 래플가 < 정가`, rfPrice(r) < it.price, `${rfPrice(r)} vs ${it.price}`)
    ok(`${r.id} 래플가에도 마진 보존`, rfPrice(r) >= it.price * r.crAtFull, '원가 밑으로 팔지 않는다')
    // 확률은 응모자에 단조감소, 수량 이하 응모면 전원 당첨
    let prev = 2
    for (const e of [1, 2, 3, 5, 10, 50, 500]) {
      const o = rfOdds(r, e)
      ok(`${r.id} 확률 단조감소(${e})`, o <= prev + 1e-12, `${o}`)
      prev = o
    }
    ok(`${r.id} 수량 이하 응모 = 전원 당첨`, rfOdds(r, r.stock) === 1)
    // 추첨: 결정론·당첨 수·범위
    const w1 = rfDraw(r, 40, 'dayX')
    ok(`${r.id} 같은 시드 = 같은 당첨`, [...rfDraw(r, 40, 'dayX')].join() === [...w1].join())
    ok(`${r.id} 당첨 수 = min(수량,응모)`, w1.size === Math.min(r.stock, 40), `${w1.size}`)
    ok(`${r.id} 당첨 번호 범위`, [...w1].every((x) => x >= 1 && x <= 40))
    // 10만 회 표본에서 개별 응모자의 당첨 빈도가 공시 확률과 맞는가
    let hit = 0
    const N = 20000
    for (let i = 0; i < N; i++) if (rfDraw(r, 40, `d${i}`).has(7)) hit++
    const exp = r.stock / 40
    ok(`${r.id} 실측 확률 ≈ 공시`, Math.abs(hit / N - exp) < 0.01, `${(hit / N * 100).toFixed(2)}% vs ${(exp * 100).toFixed(2)}%`)
  }

  // ── ⑤ 무손실 적금 검사 ──
  for (const sv of SAVEUPS) {
    const total = sv.sim.total + 5000
    ok(`${sv.id} 상금 = 이자풀`, svPrize(sv, total) === Math.round(total * sv.apr / 52))
    ok(`${sv.id} 상금이 원금을 침범하지 않음`, svPrize(sv, total) < total * sv.apr, '이자 범위 안')
    ok(`${sv.id} 확률 = 지분 비례`, Math.abs(svOdds(sv, 5000, total) - 5000 / total) < 1e-12)
    ok(`${sv.id} 전액이 내 돈이면 확률 1`, svOdds(sv, total, total) === 1)
    ok(`${sv.id} 같은 시드 = 같은 추첨`, svDraw(sv, 5000, total, 'w1').ticket === svDraw(sv, 5000, total, 'w1').ticket)
    // 실측: 내 지분 비율만큼 당첨되는가
    let win = 0
    const M2 = 20000
    for (let i = 0; i < M2; i++) if (svDraw(sv, 5000, total, `w${i}`).win) win++
    ok(`${sv.id} 실측 확률 ≈ 지분`, Math.abs(win / M2 - 5000 / total) < 0.005,
      `${(win / M2 * 100).toFixed(3)}% vs ${(5000 / total * 100).toFixed(3)}%`)
  }

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
