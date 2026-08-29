/**
 * POST /api/trade — 교환 라운드 실행 / 결과 조회.  body { roomId }
 *
 * 개봉이 끝난 방에서만 동작한다. 개봉 전이면 409 — 뽑지도 않은 것을 교환할 수 없다.
 * 회차당 1회. 재실행 요청은 저장된 같은 결과를 돌려준다(멱등).
 *
 * 선호 순위는 SPEC §5.4대로 조립한다.
 *   1순위     지목한 카드
 *   2순위 이하 ChatGPT가 만든 순위 (api/curate.js, 사용자가 화면에서 수정 가능)
 *   누락분    시세 내림차순으로 서버가 채운다
 * 마지막 단계가 없으면 선호 목록이 불완전해지고 개별 합리성이 깨진다 —
 * TTC는 자기 보유물이 목록에 있어야 "나빠지지 않음"을 보장할 수 있다.
 */
import { slotsOf } from './_box.js'
import { ttc, completePrefs, tradeSeed } from './_trade.js'
import { readRoom, mutateRoom } from './_room.js'
import { view } from './room.js'

const UNIVERSE = [...new Map(slotsOf().map((s) => [s.id, s])).values()]

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 받는다' })
  const { roomId } = req.body || {}
  if (!roomId) return res.status(400).json({ error: 'roomId가 필요하다' })

  const room = await readRoom(roomId)
  if (!room) return res.status(404).json({ error: '방이 없다' })
  if (!room.opened) return res.status(409).json({ error: '개봉 전에는 교환할 수 없다' })
  if (room.trade) return res.status(200).json({ ...view(room), idempotent: true })

  const next = await mutateRoom(roomId, (r) => {
    if (r.trade) return null
    const participants = r.members.map((m) => {
      const got = r.openResults.find((x) => x.memberId === m.id)
      return {
        id: m.id,
        holding: got.cardId,
        prefs: completePrefs({ target: m.target, aiRanked: m.aiPrefs || [], universe: UNIVERSE }),
      }
    })
    const out = ttc(participants, tradeSeed(r.id, r.round))
    const byId = new Map(UNIVERSE.map((c) => [c.id, c]))
    r.trade = {
      seed: tradeSeed(r.id, r.round),
      cycles: out.tradeCycles.map((c) => c.map((id) => ({ id, name: r.members.find((m) => m.id === id)?.name ?? id }))),
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
      // 개별 합리성은 정리로 보장된다. 그래도 매 라운드 확인해서 내려보낸다 —
      // "알고리즘이 보장한다"는 화면 문구의 근거가 주석이 아니라 실행 결과여야 한다.
      noneWorse: out.results.every((x) => !x.worse),
    }
    r.rev++
    return r
  })
  if (!next) return res.status(409).json({ error: '이미 교환됐다' })
  return res.status(200).json(view(next))
}
