/**
 * POST /api/open — 전원 개봉.  body { roomId }
 *
 * ## 전원 게이트는 서버가 소유한다 (I8)
 * "한 명이라도 안 누르면 안 열린다"가 제품의 주장이므로 판정을 프론트에 두지 않는다.
 * 프론트에서 버튼을 비활성화하는 것은 편의이지 보증이 아니다. 여기서 409를 낸다.
 * 클라이언트가 뭐라고 주장하든 서버가 방 상태를 다시 읽어서 판정한다.
 *
 * ## 비복원 (I3)
 * 뽑힌 구좌는 통에서 빠진다. 방 상태에 뽑힌 인덱스를 남기고, 다음 조회부터
 * 갱신된 확률이 내려간다. 이것이 천장을 대체한다 — 별도 장치가 없다.
 *
 * ## 멱등
 * 같은 방을 다시 열면 저장된 결과를 그대로 돌려준다. 시드가 방·박스·참여자·회차로
 * 고정돼 있어(I7) 다시 계산해도 같은 값이지만, 저장된 것을 주는 편이 통 상태를
 * 두 번 깎을 위험이 없다.
 */
import { BOX, remainingFrom, tierCountsOf } from './_box.js'
import { openRound, fmtPct, naturalFreq } from './_draw.js'
import { readRoom, mutateRoom } from './_room.js'
import { view } from './room.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 받는다' })
  const { roomId } = req.body || {}
  if (!roomId) return res.status(400).json({ error: 'roomId가 필요하다' })

  const room = await readRoom(roomId)
  if (!room) return res.status(404).json({ error: '방이 없다' })

  if (room.opened) return res.status(200).json({ ...view(room), idempotent: true })

  // ── 게이트 판정. 서버가 방 상태로 직접 센다. ──
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

  let out = null
  const next = await mutateRoom(roomId, (r) => {
    if (r.opened) return null // 경쟁 조건 — 그 사이 누가 열었다
    const remaining = remainingFrom(r.drawn)
    out = openRound({
      roomId: r.id, boxId: r.boxId,
      participantIds: r.members.map((m) => m.id),
      round: r.round + 1,
      remaining,
    })
    r.round += 1
    r.opened = true
    r.drawn = [...r.drawn, ...out.results.map((x) => x.i)]
    r.openResults = out.results.map((x) => {
      const m = r.members.find((mm) => mm.id === x.participantId)
      return {
        memberId: x.participantId, name: m?.name ?? x.participantId,
        i: x.i, tier: x.tier, cardId: x.id, name_: x.name, price: x.price, image: x.image,
        slotsBefore: x.slotsBefore,
        // 뽑기 직전 그 사람이 마주한 확률. 화면의 비복원 시각화가 이것을 쓴다.
        oddsBefore: Object.fromEntries(Object.entries(x.oddsBefore).map(([g, p]) => [g, { p, pct: fmtPct(p), freq: naturalFreq(p, BOX.N) }])),
      }
    })
    r.rev++
    return r
  })
  if (!next) return res.status(409).json({ error: '이미 개봉됐다' })
  return res.status(200).json(view(next))
}
