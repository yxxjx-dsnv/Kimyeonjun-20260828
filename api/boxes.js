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
} from './_draw.js'

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
      oddsByTeam: odds,
      evByTeam: Object.fromEntries(
        Array.from({ length: TEAM_MAX }, (_, i) => [i + 1, +evMultiple(box, i + 1).toFixed(3)])
      ),
      customerBEP: customerBEP(box),
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

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET만 허용합니다.' })
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).json({
    boxes: buildBoxes(),
    // 홈 탭 그리드용. 크롤 데이터가 올박스 밖에서도 화면에 쓰인다.
    sample: POOL.items.filter((i) => i.image).slice(0, 40),
    teamMax: TEAM_MAX,
    maxDrawsPerPerson: MAX_DRAWS_PER_PERSON,
    companyBEP: companyBEP(),
    formula: formula(),
    pool: poolMeta(),
  })
}
