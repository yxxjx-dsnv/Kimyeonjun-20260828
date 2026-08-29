/**
 * GET /api/boxes — 통 구성과 확률표.
 *
 * 화면이 확률을 계산하지 않는다. 여기서 계산한 것을 **문자열까지** 내려보내고
 * 화면은 렌더만 한다(I4). 두 벌로 관리하면 반드시 어긋난다 — v1에서 실제로
 * 코드·덱·문서의 배수가 서로 달랐다.
 *
 * roomId를 주면 그 방의 **현재** 통 상태로 갱신된 확률을 함께 내려준다(I3).
 */
import { BOX, TIERS, remainingFrom, tierCountsOf } from './_box.js'
import { allOdds, updateTable, pSolo, fmtPct, naturalFreq } from './_draw.js'
import { readRoom, kvEnabled } from './_room.js'

export default async function handler(req, res) {
  // 코드와 크롤 데이터로 정해지므로 배포마다 내용이 바뀐다.
  // v1은 s-maxage=3600을 걸어 배포해도 화면이 안 바뀌는 사고가 있었다.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600')

  const roomId = req.query?.roomId
  let live = null
  if (roomId) {
    const room = await readRoom(roomId)
    if (room) {
      const remaining = remainingFrom(room.drawn)
      const counts = tierCountsOf(remaining)
      live = {
        roomId,
        drawn: room.drawn.length,
        left: remaining.length,
        tiers: TIERS.map((g) => {
          const p = remaining.length ? counts[g] / remaining.length : null
          return { tier: g, K: counts[g], N: remaining.length, p, pct: fmtPct(p), freq: naturalFreq(p, BOX.N) }
        }),
      }
    }
  }

  res.status(200).json({
    box: BOX,
    odds: allOdds(),
    updates: Object.fromEntries(TIERS.map((g) => [g, updateTable(g, [0, 250, 500, 750, 900, 990])])),
    live,
    // 계산 근거 — 화면의 '근거' 시트가 이 문자열을 그대로 쓴다.
    basis: {
      individual: 'P(g) = K_g / N  (재고 ÷ 구좌). 정의이지 수식이 아니다.',
      team: 'P_team(g,n) = 1 − C(N−K_g, n) / C(N, n)  (초기하분포, 비복원)',
      exact: 'K_g = 1이면 정확히 n/N — 혼자 대비 정확히 n배. 회사가 보태는 값이 없다.',
      update: 'j구좌가 빠지고 g가 안 나왔다면 P(g) = K_g / (N − j). 이것이 천장을 대체한다.',
      overflow: 'C(N−K,n)/C(N,n)은 곱 형태 ∏(N−n−i)/(N−i)로 계산한다. 로그감마와 1e-10 이내 일치를 self-check가 확인한다.',
      noCeiling: '천장 장치가 없다. 비복원 추출이 그 역할을 한다.',
      source: `크롤 ${BOX.crawledAt} · 다나와 · data/pool.json`,
    },
    storage: kvEnabled() ? 'kv' : 'memory',
  })
}
