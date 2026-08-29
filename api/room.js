/**
 * POST /api/room — 방 생성·합류·지목·준비·조회.
 *   body { action: 'create'|'join'|'target'|'ready'|'state', ... }
 *
 * 지목은 확률을 건드리지 않는다. TTC의 1순위 선호가 될 뿐이다.
 * "지목하면 잘 나온다"는 어떤 경로도 만들지 않는다 — 만드는 순간 확률이
 * 재고 ÷ 구좌가 아니게 된다(I1).
 */
import { BOX, TEAM_MAX, slotsOf, remainingFrom, tierCountsOf } from './_box.js'
import { fmtPct, naturalFreq, rng } from './_draw.js'
import { readRoom, writeRoom, mutateRoom, newId, newRoom, kvEnabled } from './_room.js'

const ALL_CARD_IDS = [...new Set(slotsOf().map((s) => s.id))]
const CARD_IDS = new Set(ALL_CARD_IDS)

/** 클라이언트에 내려보내는 방 상태. 통 상태와 갱신된 확률을 함께 준다(I3). */
export function view(room) {
  const remaining = remainingFrom(room.drawn)
  const counts = tierCountsOf(remaining)
  const readyCount = room.members.filter((m) => m.ready).length
  return {
    id: room.id, boxId: room.boxId, rev: room.rev, round: room.round,
    capacity: TEAM_MAX,
    members: room.members.map((m) => ({
      id: m.id, name: m.name, ready: !!m.ready, target: m.target ?? null,
      hasAiPrefs: Array.isArray(m.aiPrefs) && m.aiPrefs.length > 0, aiSource: m.aiSource ?? null,
    })),
    readyCount,
    allReady: room.members.length > 0 && readyCount === room.members.length,
    opened: !!room.opened,
    openResults: room.openResults,
    trade: room.trade,
    /** 지목 집계 — 같은 카드를 몇 명이 원하는지. 교환 전환율이 여기 달려 있다. */
    targets: room.members.reduce((m, x) => (x.target ? ((m[x.target] = (m[x.target] || 0) + 1), m) : m), {}),
    live: {
      drawn: room.drawn.length,
      left: remaining.length,
      tiers: Object.entries(counts).map(([tier, K]) => {
        const p = remaining.length ? K / remaining.length : null
        return { tier, K, N: remaining.length, p, pct: fmtPct(p), freq: naturalFreq(p, BOX.N) }
      }),
    },
    storage: kvEnabled() ? 'kv' : 'memory',
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 받는다' })
  const { action, roomId, memberId, name, cardId, ready } = req.body || {}

  if (action === 'create') {
    const id = newId()
    const room = newRoom(id, BOX.crawledAt ? 'olbox' : 'olbox')
    const me = { id: newId(4), name: (name || '방장').slice(0, 12), ready: false, target: null }
    room.members.push(me)
    room.rev = 1
    await writeRoom(id, room)
    return res.status(201).json({ ...view(room), you: me.id })
  }

  if (!roomId) return res.status(400).json({ error: 'roomId가 필요하다' })

  if (action === 'state') {
    const room = await readRoom(roomId)
    if (!room) return res.status(404).json({ error: '방이 없다' })
    return res.status(200).json(view(room))
  }

  if (action === 'join') {
    let error = null
    const room = await mutateRoom(roomId, (r) => {
      if (r.opened) { error = { code: 409, msg: '이미 개봉된 방이다' }; return null }
      if (r.members.length >= TEAM_MAX) { error = { code: 409, msg: `정원 ${TEAM_MAX}명을 넘을 수 없다` }; return null }
      r.members.push({ id: newId(4), name: (name || `참여자${r.members.length + 1}`).slice(0, 12), ready: false, target: null })
      r.rev++
      return r
    })
    if (!room) return res.status(404).json({ error: '방이 없다' })
    if (error) return res.status(error.code).json({ error: error.msg, ...view(room) })
    return res.status(200).json({ ...view(room), you: room.members.at(-1).id })
  }

  if (action === 'target') {
    // 통 안에 없는 카드는 거절한다. 클라이언트가 보낸 id를 믿지 않는다.
    if (!CARD_IDS.has(cardId)) return res.status(400).json({ error: '통 안에 없는 카드다' })
    let error = null
    const room = await mutateRoom(roomId, (r) => {
      if (r.opened) { error = { code: 409, msg: '개봉 후에는 지목을 바꿀 수 없다' }; return null }
      const m = r.members.find((x) => x.id === memberId)
      if (!m) { error = { code: 404, msg: '참여자가 없다' }; return null }
      m.target = cardId // 참여자당 1개. 덮어쓴다.
      r.rev++
      return r
    })
    if (!room) return res.status(404).json({ error: '방이 없다' })
    if (error) return res.status(error.code).json({ error: error.msg, ...view(room) })
    return res.status(200).json(view(room))
  }

  /**
   * 시뮬 팀원의 취향. **Phase 3에서 측정한 것에 대한 대응이다.**
   *
   * 선호를 지목 + 시세 내림차순으로만 채우면 전원의 선호가 같아지고, TTC는 선호가
   * 엇갈릴 때만 사이클을 만들므로 교환이 거의 일어나지 않는다(개선율 10.5% vs 68.4%).
   * 실제로 데모에서 "성립한 교환이 없습니다"만 나왔다.
   *
   * 진짜 사용자는 각자 다른 것을 모으므로 선호가 엇갈린다(E4 — 커뮤니티 교환이
   * 실재하는 이유가 그것이다). 시뮬 팀원에게도 각자 다른 순서를 준다.
   * **시뮬레이션이므로 화면에 시뮬 배지를 단다(I13).** 실제 사용자라면 이 자리를
   * 지목과 ChatGPT가 채운다.
   */
  if (action === 'simPrefs') {
    let error = null
    const room = await mutateRoom(roomId, (r) => {
      if (r.opened) { error = { code: 409, msg: '개봉 후에는 바꿀 수 없다' }; return null }
      const ids = ALL_CARD_IDS
      for (const m of r.members) {
        if (m.id === memberId) continue   // 나는 내가 정한다. 시뮬로 덮지 않는다.
        const rand = rng(`${r.id}|${m.id}|taste`)
        const shuffled = ids.slice()
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1))
          ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }
        m.target = m.target ?? shuffled[0]
        m.aiPrefs = shuffled
        m.aiSource = 'sim'
      }
      r.rev++
      return r
    })
    if (!room) return res.status(404).json({ error: '방이 없다' })
    if (error) return res.status(error.code).json({ error: error.msg, ...view(room) })
    return res.status(200).json(view(room))
  }

  if (action === 'ready') {
    let error = null
    const room = await mutateRoom(roomId, (r) => {
      const m = r.members.find((x) => x.id === memberId)
      if (!m) { error = { code: 404, msg: '참여자가 없다' }; return null }
      m.ready = ready !== false
      r.rev++
      return r
    })
    if (!room) return res.status(404).json({ error: '방이 없다' })
    if (error) return res.status(error.code).json({ error: error.msg, ...view(room) })
    return res.status(200).json(view(room))
  }

  return res.status(400).json({ error: `모르는 action: ${action}` })
}
