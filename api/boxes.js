/**
 * GET /api/boxes — 박스 목록과 팀 규모별 확률표.
 *
 * 이 엔드포인트의 존재 이유는 하나다: 화면이 보여주는 확률과 서버가 추첨에 쓰는
 * 확률이 같은 모듈(_draw.js)에서 나오게 하는 것. 두 벌로 관리하면 반드시 어긋난다.
 */
import {
  BOXES, TEAM_MAX, MAX_DRAWS_PER_PERSON, TIERS, BANDS,
  collapseUp, tiersOf, tierMeanRetail, oddsTable, evMultiple,
  customerBEP, companyBEP, costRatio, cacRecovered, budgetOf, poolMeta,
  CR_MIN, CR_MAX, K, N0, CAC, VIRAL_MAX, CAC_CAP, MARGIN, SPLIT,
  MIN_C_SHARE, FIXED_COST_RATIO, PRICE_RATIO, POOL,
  GROUPBUYS, FREE_SHARE, gbItem, gbCostRatio, gbDiscount, gbPayRatio, gbFreeOdds, gbFreeCount,
  DAILIES, dailyItem, dailyCost, dailyNetPerPlay, dailyBreakEvenPlays, dailyWinOdds,
  dailyBlankOdds, dailyPlaysToExhaust, baseOdds, teamBoost, stockTotal, pityLeft,
} from './_draw.js'
import { readVotes, VOTE_LABEL } from './room.js'

const SAMPLES = 6

export function buildBoxes() {
  return BOXES.map((box) => {
    const T = collapseUp(tiersOf(box))
    const m = tierMeanRetail(T)
    const odds = oddsTable(box)
    return {
      id: box.id,
      name: box.name,
      entry: box.entry,
      blurb: box.blurb,
      topLabel: box.topLabel,
      // 참여비는 최고 상품가에 비례한다 — 임의로 정한 값이 아님을 화면에서 보인다.
      topRetail: Math.round(box.entry * PRICE_RATIO),
      tiers: TIERS.map((t) => ({
        tier: t,
        band: BANDS[t].map((x) => Math.round(box.entry * x)),
        count: T[t].length,
        meanRetail: Math.round(m[t]),
        // 상위 티어는 비싼 것부터, 하위 티어는 대표적인 것부터 보여준다.
        samples: [...T[t]]
          .sort((a, b) => (t === 'S' || t === 'A' ? b.price - a.price : a.price - b.price))
          .slice(0, SAMPLES),
      })),
      // 재고를 그대로 내려보낸다 — 확률이 어디서 왔는지 화면이 직접 보여준다
      stock: box.stock,
      stockTotal: stockTotal(box),
      baseOdds: baseOdds(box),
      boostByTeam: Object.fromEntries(
        Array.from({ length: TEAM_MAX }, (_, i) => [i + 1, +teamBoost(box, i + 1).toFixed(4)])
      ),
      pity: box.pity,
      oddsByTeam: odds,
      evByTeam: Object.fromEntries(
        Array.from({ length: TEAM_MAX }, (_, i) => [i + 1, +evMultiple(box, i + 1).toFixed(3)])
      ),
      customerBEP: customerBEP(box),
    }
  })
}

/**
 * 공동구매형 — 상품이 확정이고 확률은 '얼마를 내는가'에만 작동한다.
 * 인원별 표를 통째로 내려보내 화면이 서버와 같은 값을 쓰게 한다.
 */
export function buildGroupbuys() {
  return GROUPBUYS.map((gb) => {
    const item = gbItem(gb)
    const steps = []
    for (let n = gb.minTeam; n <= gb.teamMax; n++) {
      steps.push({
        n,
        pay: Math.round(item.price * gbPayRatio(gb, n)),
        discount: +(gbDiscount(gb, n) * 100).toFixed(1),
        freeOdds: +(gbFreeOdds(gb, n) * 100).toFixed(2),
        freeCount: gbFreeCount(gb, n),
        costRatio: +gbCostRatio(gb, n).toFixed(4),
      })
    }
    return {
      id: gb.id, name: gb.name, blurb: gb.blurb,
      minTeam: gb.minTeam, teamMax: gb.teamMax,
      item, listPrice: item.price, freeShare: FREE_SHARE, steps,
    }
  })
}

/**
 * ② 데일리 100원 — 꽝 확률까지 그대로 내려보낸다.
 * 이 포맷은 무손실이 아니라 **완전 공개**로 정직성을 지킨다.
 */
export function buildDailies() {
  return DAILIES.map((d) => {
    const item = dailyItem(d)
    return {
      id: d.id, name: d.name, blurb: d.blurb,
      entry: d.entry, dailyLimit: d.dailyLimit, blank: d.blank,
      item, itemPrice: item.price, totalStock: d.totalStock,
      winOdds: +(dailyWinOdds(d) * 100).toFixed(3),
      blankOdds: +(dailyBlankOdds(d) * 100).toFixed(3),
      // 확률이 어디서 나왔는지 계산 과정을 그대로 노출한다
      economics: {
        itemCost: Math.round(dailyCost(d)),
        netPerPlay: dailyNetPerPlay(d),
        breakEvenPlays: Math.round(dailyBreakEvenPlays(d)),
        playsToExhaust: dailyPlaysToExhaust(d),
      },
    }
  })
}

/** 화면의 '정직성 시트'가 그대로 렌더하는 수식 파라미터. 숨기지 않는다. */
export const formula = () => ({
  costRatio: { CR_MIN, CR_MAX, K, N0, note: '수량할인 계단(MOQ 임계)의 로지스틱 평활화' },
  cac: { CAC, VIRAL_MAX, CAC_CAP, K, N0, note: 'Bass(1969) 확산모형의 모방 항' },
  budget: { MARGIN, SPLIT, MIN_C_SHARE, note: '예산 = 참여비×(1−마진) + CAC회수' },
  economics: { FIXED_COST_RATIO, companyBEP: companyBEP() },
  curve: Array.from({ length: TEAM_MAX }, (_, i) => ({
    n: i + 1,
    costRatio: +costRatio(i + 1).toFixed(4),
  })),
  assumptions: [
    'CR_MIN·CR_MAX·N0·K·CAC는 모델 가정입니다. 실제 매입 단가표와 코호트 데이터로 바꾸면 확률표가 확정됩니다.',
    'Metcalfe의 n²는 쓰지 않았습니다 — Briscoe·Odlyzko·Tilly(2006)가 반증했기 때문입니다. 다만 그 반증도 Netnomics(2014)에서 재반박됐고, 저희는 확률이 더 낮게 나오는 보수적인 쪽을 택했습니다.',
    '확률은 Gigerenzer·Hoffrage(1995)에 따라 자연빈도를 병기합니다.',
  ],
})

/** 그룹별 등간격 추출 — curate.js가 티어 후보를 고를 때 쓰는 방식과 같다. */
export function homeSample(per = 24) {
  return ['daily', 'home', 'card', 'prize', 'uniform'].flatMap((g) => {
    const xs = POOL.items.filter((i) => i.image && i.group === g)
    const step = Math.max(1, Math.ceil(xs.length / per))
    return xs.filter((_, k) => k % step === 0)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 허용합니다.' })
  // s-maxage=3600을 걸었다가 배포해도 화면이 한 시간 동안 안 바뀌었다
  // (x-vercel-cache: HIT, age 3372). 이 응답은 코드와 크롤 데이터로 정해지므로
  // **배포할 때마다 내용이 바뀐다**. 긴 캐시를 걸 대상이 아니었다.
  // 60초 + SWR로 트래픽 급증만 막고, 배포는 1분 안에 보이게 한다.
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600')
  res.setHeader('X-Pool-Crawled-At', poolMeta().crawledAt)
  return res.status(200).json({
    boxes: buildBoxes(),
    groupbuys: buildGroupbuys(),
    dailies: buildDailies(),
    votes: await readVotes(),
    voteLabel: VOTE_LABEL,
    // 홈 탭 그리드용. 크롤 데이터가 올박스 밖에서도 화면에 쓰인다.
    //
    // 앞의 slice(0,40)은 풀이 가격 오름차순이라 40건 중 39건이 daily였고
    // 가격대가 2,020~8,280원에 갇혔다. 홈이 '최저가 생필품 가게'로 보인 원인.
    // 그룹별로 등간격 추출해 다섯 카테고리가 전부 실제 데이터로 채워지게 한다.
    sample: homeSample(),
    teamMax: TEAM_MAX,
    maxDrawsPerPerson: MAX_DRAWS_PER_PERSON,
    companyBEP: companyBEP(),
    formula: formula(),
    pool: poolMeta(),
  })
}
