/**
 * POST /api/room — 방 만들기·합류·뽑기 수 변경·준비 완료·상태 조회.
 *
 * 준비 카운트를 서버가 소유한다. 클라이언트가 "다 눌렀다"고 주장해도
 * 개봉되지 않는다. 전원이 눌러야만 열리는 것이 이 제품의 핵심이라
 * 그 판정을 프론트에 두지 않는다.
 */
import { getBox, oddsOf, evMultiple, TEAM_MAX, MAX_DRAWS_PER_PERSON } from './_draw.js'
import { readRoom, writeRoom, mutateRoom, newId, kvEnabled, counter } from './_room.js'

const NAME_MAX = 12

/** 다음에 열 포맷 후보. 크롤 풀의 group 필드를 그대로 쓴다. */
export const VOTE_CHOICES = ['card', 'uniform', 'prize', 'daily']
export const VOTE_LABEL = { card: '포켓몬 카드', uniform: '유니폼', prize: '건강식품', daily: '생필품' }
export async function readVotes() {
  const out = {}
  for (const c of VOTE_CHOICES) out[c] = await counter(`olbox:vote:${c}`)
  return out
}
const clean = (s, fallback) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  return t || fallback
}
const clampDraws = (d) =>
  Math.min(MAX_DRAWS_PER_PERSON, Math.max(1, Math.floor(Number(d) || 1)))

export const teamSizeOf = (s) => s.members.length
export const teamDrawsOf = (s) => s.members.reduce((a, m) => a + m.draws, 0)
export const readyCountOf = (s) => s.members.filter((m) => m.ready).length
export const allReady = (s) => s.members.length > 0 && s.members.every((m) => m.ready)

/** 클라이언트에 내보내는 형태. 확률은 서버가 계산해서 함께 준다. */
export function publicState(s) {
  const box = getBox(s.boxId)
  const n = teamSizeOf(s)
  const draws = teamDrawsOf(s)
  return {
    roomId: s.roomId,
    boxId: s.boxId,
    phase: s.phase,
    rev: s.rev,
    members: s.members.map(({ id, name, sim, draws, ready }) => ({ id, name, sim, draws, ready })),
    teamSize: n,
    teamDraws: draws,
    readyCount: readyCountOf(s),
    teamMax: TEAM_MAX,
    maxDrawsPerPerson: MAX_DRAWS_PER_PERSON,
    // 지금 이 팀 구성으로 계산한 확률. 화면의 막대와 곡선 위 점이 이 값을 쓴다.
    odds: oddsOf(box, n, draws),
    evMultiple: +evMultiple(box, n).toFixed(3),
    live: kvEnabled(),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용합니다.' })
  const { action, roomId, boxId, memberId, name, draws, sim } = req.body || {}

  try {
    if (action === 'create') {
      const box = getBox(boxId)
      if (!box) return res.status(400).json({ error: '없는 박스입니다.' })
      const id = newId()
      const mid = newId(8)
      const state = {
        roomId: id,
        boxId: box.id,
        rev: 1,
        createdAt: Date.now(),
        phase: 'gather',
        members: [
          { id: mid, name: clean(name, '나'), sim: false, draws: 1, ready: false, at: Date.now() },
        ],
      }
      await writeRoom(id, state)
      return res.status(200).json({ memberId: mid, state: publicState(state) })
    }

    if (!roomId) return res.status(400).json({ error: 'roomId가 필요합니다.' })

    if (action === 'state') {
      const s = await readRoom(roomId)
      if (!s) return res.status(404).json({ error: '방을 찾을 수 없습니다.' })
      return res.status(200).json({ state: publicState(s) })
    }

    if (action === 'join') {
      const mid = newId(8)
      const next = await mutateRoom(roomId, (s) => {
        if (s.phase !== 'gather') return null
        if (s.members.length >= TEAM_MAX) return null
        s.members.push({
          id: mid,
          name: clean(name, `팀원${s.members.length + 1}`),
          sim: Boolean(sim),
          draws: 1,
          ready: false,
          at: Date.now(),
        })
        s.rev++
        return s
      })
      if (!next) return res.status(404).json({ error: '방을 찾을 수 없습니다.' })
      if (next.phase !== 'gather') return res.status(409).json({ error: '이미 개봉된 방입니다.' })
      if (!next.members.some((m) => m.id === mid))
        return res.status(409).json({ error: `정원(${TEAM_MAX}명)이 찼습니다.` })
      return res.status(200).json({ memberId: mid, state: publicState(next) })
    }

    if (action === 'draws' || action === 'ready' || action === 'unready') {
      const next = await mutateRoom(roomId, (s) => {
        if (s.phase !== 'gather') return null
        const me = s.members.find((m) => m.id === memberId)
        if (!me) return null
        if (action === 'draws') {
          // 뽑기 수를 바꾸면 팀 물량이 바뀌어 전원의 확률표가 움직인다.
          // 그래서 준비 상태를 되돌린다 — 모르는 사이에 조건이 바뀌면 안 된다.
          me.draws = clampDraws(draws)
          for (const m of s.members) m.ready = false
        } else {
          me.ready = action === 'ready'
        }
        s.rev++
        return s
      })
      if (!next) return res.status(404).json({ error: '방 또는 참여자를 찾을 수 없습니다.' })
      return res.status(200).json({ state: publicState(next) })
    }

    /**
     * 다음 회차에 어떤 포맷을 열지 고객이 정한다.
     * 올박스는 매주 포맷이 바뀌므로, 그 결정을 고객에게 넘기는 것이
     * "함께 문제를 해결한다"의 가장 작은 구현이다.
     * INCR은 원자적이라 방 상태처럼 read-modify-write 재시도가 필요 없다.
     */
    if (action === 'vote') {
      const choice = String(req.body?.choice || '').slice(0, 16)
      if (!VOTE_CHOICES.includes(choice))
        return res.status(400).json({ error: '없는 선택지입니다.' })
      await counter(`olbox:vote:${choice}`, 1)
      return res.status(200).json({ votes: await readVotes() })
    }

    return res.status(400).json({ error: `알 수 없는 action: ${action}` })
  } catch (e) {
    return res.status(500).json({ error: `방 처리 실패: ${e.message}` })
  }
}
