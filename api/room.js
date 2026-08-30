/**
 * POST /api/room — 방에 관한 모든 동작.
 *   body { action: 'create'|'join'|'target'|'simPrefs'|'ready'|'open'|'trade'|'state', ... }
 *
 * ## 왜 한 파일에 다 있나 — 배포본에서 겪은 것
 * 처음에는 open과 trade를 별도 라우트(api/open.js, api/trade.js)로 뒀다. 로컬에서는
 * 전부 통과했는데 **배포본에서 개봉이 404 "방이 없다"로 죽었다.**
 * Vercel에서는 라우트마다 별개의 서버리스 함수가 뜨고, KV 환경변수가 없을 때 쓰는
 * 메모리 폴백은 **함수 안에서만** 공유된다. /api/room이 만든 방을 /api/open은 볼 수 없다.
 *
 * 방을 바꾸는 동작을 한 함수로 모으면 같은 인스턴스가 같은 메모리를 본다.
 * KV 환경변수를 붙이면 이 제약 자체가 사라지지만, 없이도 데모가 돌아야 한다.
 * (여러 인스턴스로 스케일되면 여전히 갈라진다 — README에 한계로 적었다.)
 *
 * 지목은 확률을 건드리지 않는다. TTC의 1순위 선호가 될 뿐이다.
 * "지목하면 잘 나온다"는 어떤 경로도 만들지 않는다 — 만드는 순간 확률이
 * 재고 ÷ 전체 장수가 아니게 된다(I1).
 */
import { BOX, BOXES, boxById, TEAM_MAX, slotsOf, remainingFrom, tierCountsOf } from './_box.js'
import { openRound, fmtPct, naturalFreq, rng } from './_draw.js'
import { ttc, completePrefs, tradeSeed } from './_trade.js'
import { readRoom, writeRoom, mutateRoom, newId, newRoom, kvEnabled } from './_room.js'

/**
 * 통별 카드 전집 — 방이 어느 통이냐에 따라 유효한 카드가 다르다.
 * 모듈 로드 시 한 번 계산한다(통 구성이 결정적이므로 안전하다).
 */
const PER_BOX = new Map(BOXES.map((b) => {
  const univ = [...new Map(slotsOf(b).map((s) => [s.id, s])).values()]
  return [b.id, { box: b, universe: univ, ids: new Set(univ.map((c) => c.id)), allIds: univ.map((c) => c.id) }]
}))
/** 방의 통. 과거 방(boxId='olbox')은 기본 통으로 해석한다. */
const ctxOf = (room) => PER_BOX.get(room.boxId) || PER_BOX.get(BOX.id)

/**
 * 지금 누가 무엇을 들고 있는가 — **개봉 기록에서 유도한다.**
 *   개봉 결과(불변) → 성사된 1:1 스왑을 순서대로 적용
 * openResults를 직접 고치지 않는 이유: 그것이 "무엇이 뽑혔는가"의 유일한 기록이고,
 * 비복원 서사(뽑기 직전 남은 카드·그때 확률)가 거기 붙어 있기 때문이다.
 * TTC가 실행되면 그 결과가 최종이므로 여기서 다시 계산하지 않는다.
 */
export function holdingsOf(room) {
  const h = {}
  for (const r of room.openResults ?? []) h[r.memberId] = r.cardId
  for (const s of room.swaps ?? []) {
    const a = h[s.from], b = h[s.to]
    if (a === undefined || b === undefined) continue
    h[s.from] = b; h[s.to] = a
  }
  return h
}

/** 클라이언트에 내려보내는 방 상태. 통 상태와 갱신된 확률을 함께 준다(I3). */
export function view(room) {
  const { box } = ctxOf(room)
  const remaining = remainingFrom(room.drawn, box)
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
    /** 지금 보유 — 직접 교환이 반영된 상태. TTC 후에는 trade.results가 최종이다. */
    holdings: room.opened ? holdingsOf(room) : null,
    requests: room.requests ?? [],
    swaps: room.swaps ?? [],
    trade: room.trade,
    /** 지목 집계 — 같은 카드를 몇 명이 원하는지. 교환 전환율이 여기 달려 있다. */
    targets: room.members.reduce((m, x) => (x.target ? ((m[x.target] = (m[x.target] || 0) + 1), m) : m), {}),
    live: {
      drawn: room.drawn.length,
      left: remaining.length,
      tiers: Object.entries(counts).map(([tier, K]) => {
        const p = remaining.length ? K / remaining.length : null
        return { tier, K, N: remaining.length, p, pct: fmtPct(p), freq: naturalFreq(p, box.N) }
      }),
    },
    storage: kvEnabled() ? 'kv' : 'memory',
  }
}


/**
 * 개봉. 전원 게이트 판정을 **서버가 소유한다**(I8).
 * "한 명이라도 안 누르면 안 열린다"가 제품의 주장이므로 판정을 프론트에 두지 않는다.
 * 프론트의 버튼 비활성화는 편의이지 보증이 아니다. 여기서 방 상태를 다시 읽어 센다.
 *
 * 비복원(I3): 뽑힌 카드는 통에서 빠지고 다음 조회부터 갱신된 확률이 내려간다.
 * 멱등: 같은 방을 다시 열면 저장된 결과를 그대로 돌려준다. 통을 두 번 깎지 않는다.
 */
async function doOpen(res, roomId) {
  const room = await readRoom(roomId)
  if (!room) return res.status(404).json({ error: '방이 없다' })
  if (room.opened) return res.status(200).json({ ...view(room), idempotent: true })

  const total = room.members.length
  const ready = room.members.filter((m) => m.ready).length
  if (total === 0) return res.status(409).json({ error: '참여자가 없다', ready, total })
  if (ready < total) {
    return res.status(409).json({
      error: `전원이 준비해야 열린다. ${ready}/${total}명 준비됨`,
      ready, total,
      waiting: room.members.filter((m) => !m.ready).map((m) => m.name),
      ...view(room),
    })
  }

  const next = await mutateRoom(roomId, (r) => {
    if (r.opened) return null
    const { box } = ctxOf(r)
    const out = openRound({
      roomId: r.id, boxId: r.boxId,
      participantIds: r.members.map((m) => m.id),
      round: r.round + 1,
      box,
      remaining: remainingFrom(r.drawn, box),
    })
    r.round += 1
    r.opened = true
    r.drawn = [...r.drawn, ...out.results.map((x) => x.i)]
    r.openResults = out.results.map((x) => {
      const m = r.members.find((mm) => mm.id === x.participantId)
      return {
        memberId: x.participantId, name: m?.name ?? x.participantId,
        i: x.i, tier: x.tier, cardId: x.id, name_: x.name, price: x.price, image: x.image,
        url: x.url ?? null, seller: x.seller ?? null,
        slotsBefore: x.slotsBefore,
        oddsBefore: Object.fromEntries(Object.entries(x.oddsBefore).map(([g, p]) =>
          [g, { p, pct: fmtPct(p), freq: naturalFreq(p, box.N) }])),
      }
    })
    r.rev++
    return r
  })
  if (!next) return res.status(409).json({ error: '이미 개봉됐다' })
  return res.status(200).json(view(next))
}

/**
 * 교환. 개봉이 끝난 방에서만 동작한다 — 뽑지도 않은 것을 교환할 수 없다.
 * 회차당 1회이고 재실행 요청은 저장된 같은 결과를 돌려준다(멱등).
 *
 * 선호는 SPEC §5.4대로 조립한다: 지목 → ChatGPT 순위 → 시세 내림차순으로 서버가 채움.
 * 마지막 단계가 없으면 목록이 불완전해지고 개별 합리성이 깨진다.
 */
async function doTrade(res, roomId) {
  const room = await readRoom(roomId)
  if (!room) return res.status(404).json({ error: '방이 없다' })
  if (!room.opened) return res.status(409).json({ error: '개봉 전에는 교환할 수 없다' })
  if (room.trade) return res.status(200).json({ ...view(room), idempotent: true })

  const next = await mutateRoom(roomId, (r) => {
    if (r.trade) return null
    const { universe } = ctxOf(r)
    // 직접 교환이 이미 일어났으면 **그 결과 위에서** 배정한다.
    // 개봉 결과를 쓰면 성사된 스왑이 조용히 되돌려진다.
    const held = holdingsOf(r)
    const participants = r.members.map((m) => ({
      id: m.id,
      holding: held[m.id],
      prefs: completePrefs({ target: m.target, aiRanked: m.aiPrefs || [], universe }),
    }))
    const out = ttc(participants, tradeSeed(r.id, r.round))
    const byId = new Map(universe.map((c) => [c.id, c]))
    r.trade = {
      seed: tradeSeed(r.id, r.round),
      cycles: out.tradeCycles.map((c) => c.map((id) =>
        ({ id, name: r.members.find((m) => m.id === id)?.name ?? id }))),
      results: out.results.map((x) => {
        const m = r.members.find((mm) => mm.id === x.id)
        const b = byId.get(x.before), a = byId.get(x.after)
        return {
          memberId: x.id, name: m?.name ?? x.id,
          before: b ? { id: b.id, name: b.name, price: b.price, tier: b.tier, image: b.image } : null,
          after: a ? { id: a.id, name: a.name, price: a.price, tier: a.tier, image: a.image } : null,
          rankBefore: x.rankBefore, rankAfter: x.rankAfter,
          improved: x.improved, same: x.same, worse: x.worse, gain: x.gain,
          gotTarget: a?.id === m?.target,
        }
      }),
      improvedCount: out.results.filter((x) => x.improved).length,
      // 개별 합리성은 정리로 보장되지만 매 라운드 확인해서 내려보낸다 —
      // "알고리즘이 보장한다"는 화면 문구의 근거가 주석이 아니라 실행 결과여야 한다.
      noneWorse: out.results.every((x) => !x.worse),
    }
    r.rev++
    return r
  })
  if (!next) return res.status(409).json({ error: '이미 교환됐다' })
  return res.status(200).json(view(next))
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 받는다' })
  const { action, roomId, memberId, name, cardId, ready } = req.body || {}

  if (action === 'create') {
    // 통 선택 — 서버가 검증한다. 모르는 id는 기본 통이 아니라 400이다(조용히 바꿔치기하지 않는다).
    const want = req.body?.boxId ?? BOX.id
    if (!boxById(want)) return res.status(400).json({ error: '없는 통이다', boxes: BOXES.map((b) => b.id) })
    const id = newId()
    const room = newRoom(id, want)
    const me = { id: newId(4), name: (name || '방장').slice(0, 12), ready: false, target: null }
    room.members.push(me)
    room.rev = 1
    await writeRoom(id, room)
    return res.status(201).json({ ...view(room), you: me.id })
  }

  if (!roomId) return res.status(400).json({ error: 'roomId가 필요하다' })

  /**
   * AI가 만든 선호 순위를 방에 저장한다. 클라이언트가 넘기지만 **서버가 다시 거른다**
   * — 통 안에 없는 id는 버린다(I9). 클라이언트가 보낸 것을 믿지 않는다.
   */
  if (action === 'setPrefs') {
    let error = null, kept = 0
    const room = await mutateRoom(roomId, (r) => {
      if (r.opened) { error = { code: 409, msg: '개봉 후에는 바꿀 수 없다' }; return null }
      const m = r.members.find((x) => x.id === memberId)
      if (!m) { error = { code: 404, msg: '참여자가 없다' }; return null }
      const { ids } = ctxOf(r)
      const clean = Array.isArray(req.body?.prefs) ? req.body.prefs.filter((x) => ids.has(x)) : []
      kept = clean.length
      m.aiPrefs = clean
      m.aiSource = req.body?.source ?? 'openai'
      r.rev++
      return r
    })
    if (!room) return res.status(404).json({ error: '방이 없다' })
    if (error) return res.status(error.code).json({ error: error.msg, ...view(room) })
    return res.status(200).json({ ...view(room), kept })
  }

  if (action === 'open') return doOpen(res, roomId)
  if (action === 'trade') return doTrade(res, roomId)

  /**
   * 직접 교환 요청 — 내 카드와 상대 카드를 1:1로 바꾸자고 제안한다.
   *
   * 이 기능이 TTC를 대체하지 않는다. 서로 엇갈려 1:1로는 못 푸는 요청이 남는데
   * (A는 B 걸 원하고 B는 C 걸 원하는 경우), 그 고리는 '한 번에 맞추기'가 푼다.
   * 즉 **직접 요청은 선호의 표명이고, TTC는 그 선호를 다자간으로 푸는 엔진**이다.
   */
  if (action === 'swapRequest') {
    const targetId = req.body?.targetId
    let error = null
    const room = await mutateRoom(roomId, (r) => {
      if (!r.opened) { error = { code: 409, msg: '개봉 전에는 교환할 수 없습니다' }; return null }
      if (r.trade) { error = { code: 409, msg: '이미 한 번에 맞추기가 끝났습니다' }; return null }
      if (memberId === targetId) { error = { code: 400, msg: '자기 자신에게는 요청할 수 없습니다' }; return null }
      const held = holdingsOf(r)
      if (held[memberId] === undefined || held[targetId] === undefined) {
        error = { code: 404, msg: '참여자가 없습니다' }; return null
      }
      r.requests = r.requests ?? []
      // 같은 상대에게 두 번 보내지 않는다. 덮어쓰는 것이 아니라 무시한다.
      if (r.requests.some((q) => q.from === memberId && q.to === targetId)) return r
      r.requests.push({ from: memberId, to: targetId, at: Date.now() })
      r.rev++
      return r
    })
    if (!room) return res.status(error?.code ?? 404).json({ error: error?.msg ?? '방이 없습니다' })
    if (error) return res.status(error.code).json({ error: error.msg, ...view(room) })
    return res.status(200).json(view(room))
  }

  /** 요청에 응답한다. 수락하면 그 자리에서 카드가 바뀐다. */
  if (action === 'swapRespond') {
    const fromId = req.body?.fromId
    const accept = req.body?.accept !== false
    let error = null
    const room = await mutateRoom(roomId, (r) => {
      if (r.trade) { error = { code: 409, msg: '이미 한 번에 맞추기가 끝났습니다' }; return null }
      r.requests = r.requests ?? []
      const i = r.requests.findIndex((q) => q.from === fromId && q.to === memberId)
      if (i < 0) { error = { code: 404, msg: '그런 요청이 없습니다' }; return null }
      r.requests.splice(i, 1)
      if (accept) {
        const held = holdingsOf(r)
        if (held[fromId] === undefined || held[memberId] === undefined) {
          error = { code: 404, msg: '참여자가 없습니다' }; return null
        }
        r.swaps = r.swaps ?? []
        r.swaps.push({ from: fromId, to: memberId, at: Date.now() })
        // 성사되면 두 사람이 낀 나머지 요청은 의미가 없어진다 — 들고 있는 것이 바뀌었다
        r.requests = r.requests.filter((q) =>
          q.from !== fromId && q.to !== fromId && q.from !== memberId && q.to !== memberId)
      }
      r.rev++
      return r
    })
    if (!room) return res.status(error?.code ?? 404).json({ error: error?.msg ?? '방이 없습니다' })
    if (error) return res.status(error.code).json({ error: error.msg, ...view(room) })
    return res.status(200).json(view(room))
  }

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
    let error = null
    const room = await mutateRoom(roomId, (r) => {
      // 통 안에 없는 카드는 거절한다. 클라이언트가 보낸 id를 믿지 않는다.
      if (!ctxOf(r).ids.has(cardId)) { error = { code: 400, msg: '통 안에 없는 카드다' }; return null }
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
   * 지목과 본인의 선호 순서가 채운다.
   */
  if (action === 'simPrefs') {
    let error = null
    const room = await mutateRoom(roomId, (r) => {
      if (r.opened) { error = { code: 409, msg: '개봉 후에는 바꿀 수 없다' }; return null }
      const ids = ctxOf(r).allIds
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
