/**
 * POST /api/open — 개봉.
 *
 * ChatGPT를 부르지 않는다. 추첨은 순수 서버 RNG이고, 티어·가격·확률은
 * 클라이언트가 무엇을 보냈든 서버가 _pool.js 가격으로 다시 계산한다.
 * 클라이언트가 거짓말해도 이길 방법이 없다.
 *
 * 전원이 준비되지 않았으면 409. 이 판정이 제품의 핵심이라 서버에만 둔다.
 */
import { getBox, collapseUp, tiersOf, oddsOf, drawOne, TIERS } from './_draw.js'
import { readRoom, mutateRoom } from './_room.js'
import { teamSizeOf, teamDrawsOf, readyCountOf, allReady, publicState } from './room.js'

/** 방 상태 → 전원의 추첨 결과. 순수 함수라 테스트에서 직접 부른다. */
export function resolve(state) {
  const box = getBox(state.boxId)
  const tiers = collapseUp(tiersOf(box))
  const P = oddsOf(box, teamSizeOf(state), teamDrawsOf(state), tiers)

  const results = state.members.map((m, idx) => {
    const picks = []
    for (let i = 0; i < m.draws; i++) {
      // 시드가 방·박스·사람·회차로 고정되므로 같은 방을 다시 열면 같은 결과가 나온다.
      const { tier, item } = drawOne(box, P, tiers, `${state.roomId}|${state.boxId}|${m.id}|${i}`)
      picks.push({ tier, item })
    }
    const paid = box.entry * m.draws
    const retailValue = picks.reduce((s, p) => s + p.item.price, 0)
    return {
      memberIndex: idx,
      memberId: m.id,
      name: m.name,
      sim: m.sim,
      picks,
      best: TIERS[Math.min(...picks.map((p) => TIERS.indexOf(p.tier)))],
      settle: { paid, retailValue, delta: retailValue - paid },
    }
  })

  return {
    boxId: box.id,
    boxName: box.name,
    entry: box.entry,
    teamSize: teamSizeOf(state),
    teamDraws: teamDrawsOf(state),
    odds: P,
    results,
    seedProof: {
      pattern: '방ID | 박스ID | 참여자ID | 회차',
      note: '같은 방을 다시 열면 같은 결과가 나옵니다. 재추첨이 구조적으로 불가능합니다.',
    },
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용합니다.' })
  const { roomId } = req.body || {}
  if (!roomId) return res.status(400).json({ error: 'roomId가 필요합니다.' })

  try {
    let state = await readRoom(roomId)
    if (!state) return res.status(404).json({ error: '방을 찾을 수 없습니다.' })

    if (state.phase !== 'opened') {
      if (!allReady(state)) {
        return res.status(409).json({
          error: '아직 전원이 뽑기를 누르지 않았습니다.',
          readyCount: readyCountOf(state),
          teamSize: teamSizeOf(state),
        })
      }
      // 개봉 시점의 팀 구성을 고정한다. 이후 합류로 결과가 바뀌면 안 된다.
      state = (await mutateRoom(roomId, (s) => {
        if (s.phase === 'opened') return null
        s.phase = 'opened'
        s.openedAt = Date.now()
        s.rev++
        return s
      })) || state
    }

    return res.status(200).json({ ...resolve(state), state: publicState(state) })
  } catch (e) {
    return res.status(500).json({ error: `개봉 실패: ${e.message}` })
  }
}
