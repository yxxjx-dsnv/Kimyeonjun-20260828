/**
 * POST /api/open — 개봉.
 *
 * ChatGPT를 부르지 않는다. 추첨은 순수 서버 RNG이고, 티어·가격·확률은
 * 클라이언트가 무엇을 보냈든 서버가 _pool.js 가격으로 다시 계산한다.
 * 클라이언트가 거짓말해도 이길 방법이 없다.
 *
 * 전원이 준비되지 않았으면 409. 이 판정이 제품의 핵심이라 서버에만 둔다.
 */
import {
  getBox, collapseUp, tiersOf, oddsOf, drawOne, TIERS, TEAM_MAX, MAX_DRAWS_PER_PERSON, byId,
  getGroupbuy, gbItem, gbPayRatio, gbDiscount, gbFreeOdds, gbFreeCount, gbDraw,
  getDaily, dailyItem, dailyDraw, dailyWinOdds, dailyBlankOdds, baseOdds, teamBoost, pityLeft,
} from './_draw.js'

import { readRoom, mutateRoom, counter, todayKey } from './_room.js'
import { teamSizeOf, teamDrawsOf, readyCountOf, allReady, publicState } from './room.js'

// 큐레이션 구성으로 뽑으려면 최소 이만큼은 남아 있어야 한다. 모자라면 전체 풀로 되돌린다.
const MIN_PICKED = 12

/**
 * 방 상태 → 전원의 추첨 결과. 순수 함수라 테스트에서 직접 부른다.
 * pickedIds가 오면 그 구성으로 뽑는다. 클라이언트가 보낸 id는 그대로 믿지 않고
 * 풀과 다시 조인하며, 살아남은 게 모자라면 전체 풀로 되돌린다.
 */
export function resolve(state, pickedIds = null, pityMiss = {}) {
  const box = getBox(state.boxId)
  const ids = Array.isArray(pickedIds)
    ? pickedIds.map(String).filter((id) => byId.has(id))
    : null
  const tiers = collapseUp(tiersOf(box, ids && ids.length >= MIN_PICKED ? ids : null))
  const P = oddsOf(box, teamSizeOf(state), teamDrawsOf(state), tiers)

  const results = state.members.map((m, idx) => {
    // 천장은 사람마다 다르다. 이 참여자의 연속 S 미당첨 횟수만큼 확률이 오른다.
    const miss = Math.max(0, Math.floor(Number(pityMiss[m.id]) || 0))
    const Pm = miss >= (box.pity?.window ?? Infinity)
      ? oddsOf(box, teamSizeOf(state), teamDrawsOf(state), tiers, miss)
      : P
    const picks = []
    for (let i = 0; i < m.draws; i++) {
      // 시드가 방·박스·사람·회차로 고정되므로 같은 방을 다시 열면 같은 결과가 나온다.
      const { tier, item } = drawOne(box, Pm, tiers, `${state.roomId}|${state.boxId}|${m.id}|${i}`)
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
      pity: { miss, applied: miss >= (box.pity?.window ?? Infinity), sOdds: +(Pm.S * 100).toFixed(3) },
    }
  })

  return {
    boxId: box.id,
    boxName: box.name,
    entry: box.entry,
    teamSize: teamSizeOf(state),
    teamDraws: teamDrawsOf(state),
    odds: P,
    stock: box.stock,
    boost: +teamBoost(box, teamSizeOf(state)).toFixed(4),
    baseOdds: baseOdds(box),
    pityRule: box.pity,
    results,
    seedProof: {
      pattern: '방ID | 박스ID | 참여자ID | 회차',
      note: '같은 방을 다시 열면 같은 결과가 나옵니다. 재추첨이 구조적으로 불가능합니다.',
    },
  }
}

/**
 * 시뮬레이션 개봉 — KV가 없는 배포본에서 심사자가 혼자 체험할 때 쓴다.
 * 방 상태만 클라이언트가 들고 있고, 추첨·티어·가격은 여전히 서버가 계산한다.
 * 클라이언트가 보낸 값 중 살아남는 것은 방ID·박스ID·참여자ID·이름·뽑기 수뿐이다.
 */
function simState(body) {
  const box = getBox(body.boxId)
  if (!box) return null
  const members = (Array.isArray(body.members) ? body.members : [])
    .slice(0, TEAM_MAX)
    .map((m, i) => ({
      id: String(m?.id ?? `sim${i}`).slice(0, 16),
      name: String(m?.name ?? `팀원${i + 1}`).replace(/\s+/g, ' ').trim().slice(0, 12) || `팀원${i + 1}`,
      sim: i !== 0,
      draws: Math.min(MAX_DRAWS_PER_PERSON, Math.max(1, Math.floor(Number(m?.draws) || 1))),
      ready: true,
    }))
  if (!members.length) return null
  return {
    roomId: String(body.roomId || 'sim').slice(0, 24),
    boxId: box.id,
    phase: 'opened',
    rev: 1,
    members,
  }
}

/**
 * 공동구매형 발주 — 상품은 확정이고, 누가 무료인지만 정한다.
 * 인원·상품·방ID만 클라이언트에서 받고 가격·할인·당첨 인원은 전부 서버가 계산한다.
 */
function resolveGroupbuy(body) {
  const gb = getGroupbuy(body.gbId)
  if (!gb) return null
  const members = (Array.isArray(body.members) ? body.members : [])
    .slice(0, gb.teamMax)
    .map((m, i) => ({
      id: String(m?.id ?? `g${i}`).slice(0, 16),
      name: String(m?.name ?? `참여자${i + 1}`).replace(/\s+/g, ' ').trim().slice(0, 12) || `참여자${i + 1}`,
      sim: i !== 0,
    }))
  const n = members.length
  if (n < gb.minTeam) return { short: true, need: gb.minTeam - n, minTeam: gb.minTeam, teamSize: n }

  const item = gbItem(gb)
  const roomId = String(body.roomId || 'sim').slice(0, 24)
  const winners = gbDraw(gb, members.map((m) => m.id), roomId)
  const pay = Math.round(item.price * gbPayRatio(gb, n))

  return {
    kind: 'groupbuy',
    gbId: gb.id,
    gbName: gb.name,
    item,
    listPrice: item.price,
    teamSize: n,
    pay,
    discountPct: +(gbDiscount(gb, n) * 100).toFixed(1),
    freeOdds: +(gbFreeOdds(gb, n) * 100).toFixed(2),
    freeCount: gbFreeCount(gb, n),
    results: members.map((m, idx) => {
      const free = winners.has(m.id)
      return {
        memberIndex: idx, memberId: m.id, name: m.name, sim: m.sim, free,
        settle: {
          paid: free ? 0 : pay,
          retailValue: item.price,
          delta: item.price - (free ? 0 : pay),
        },
      }
    }),
    seedProof: {
      pattern: '방ID | 상품ID | 참여 인원',
      note: '당첨자는 인원이 확정되는 순간 정해집니다. 인원이 바뀌면 다시 뽑습니다 — 아직 발주 전이기 때문입니다.',
    },
  }
}

/**
 * ② 데일리 100원 — 하루 1회, 재고 소진까지.
 *
 * 서버가 두 개의 게이트를 소유한다.
 *   ① 오늘 이미 참여했으면 409 (일일 한도)
 *   ② 재고가 0이면 409 (회차 종료)
 * 둘 다 원자적 카운터라 동시 요청에도 재고가 음수로 내려가지 않는다.
 */
async function resolveDaily(body) {
  const d = getDaily(body.dailyId)
  if (!d) return null
  const who = String(body.memberId || 'anon').slice(0, 24)
  const day = todayKey()

  // 재고 먼저 확인 — 소진됐으면 뽑기 자체를 하지 않는다
  const used = await counter(`olbox:daily:${d.id}:used`)
  const remaining = Math.max(0, d.totalStock - used)
  if (remaining <= 0)
    return { over: true, reason: 'soldout', remaining: 0, totalStock: d.totalStock }

  // 일일 한도 — 오늘 참여 횟수를 원자적으로 올리고, 한도를 넘었으면 되돌린다
  const plays = await counter(`olbox:daily:${d.id}:play:${day}:${who}`, 1)
  if (plays > d.dailyLimit) {
    await counter(`olbox:daily:${d.id}:play:${day}:${who}`, -1)
    return { over: true, reason: 'dailyLimit', remaining, totalStock: d.totalStock }
  }

  // 추첨 — 시드가 상품·사람·날짜·회차로 고정된다
  const seq = await counter(`olbox:daily:${d.id}:seq`, 1)
  const result = dailyDraw(d, `${d.id}|${day}|${who}|${seq}`)
  if (result.win) await counter(`olbox:daily:${d.id}:used`, 1)

  return {
    kind: 'daily',
    dailyId: d.id,
    name: d.name,
    entry: d.entry,
    win: result.win,
    item: result.item,
    winOdds: +(dailyWinOdds(d) * 100).toFixed(3),
    blankOdds: +(dailyBlankOdds(d) * 100).toFixed(3),
    remaining: Math.max(0, d.totalStock - (used + (result.win ? 1 : 0))),
    totalStock: d.totalStock,
    settle: { paid: d.entry, retailValue: result.win ? result.item.price : 0 },
    seedProof: {
      pattern: '상품ID | 날짜 | 참여자 | 회차',
      note: '꽝도 확률로 공개합니다. 같은 시드는 언제 돌려도 같은 결과입니다.',
    },
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용합니다.' })
  const { roomId, sim, kind } = req.body || {}

  if (kind === 'daily') {
    const out = await resolveDaily(req.body)
    if (!out) return res.status(400).json({ error: '없는 캠페인입니다.' })
    if (out.over)
      return res.status(409).json({
        error: out.reason === 'soldout' ? '재고가 모두 소진되어 이번 회차는 끝났습니다.' : '오늘은 이미 참여하셨습니다.',
        ...out,
      })
    return res.status(200).json(out)
  }
  if (!roomId) return res.status(400).json({ error: 'roomId가 필요합니다.' })

  if (kind === 'groupbuy') {
    const out = resolveGroupbuy(req.body)
    if (!out) return res.status(400).json({ error: '없는 공동구매입니다.' })
    if (out.short)
      return res.status(409).json({ error: `${out.minTeam}명이 모여야 발주합니다.`, ...out })
    return res.status(200).json(out)
  }

  if (sim) {
    const state = simState(req.body)
    if (!state) return res.status(400).json({ error: '시뮬레이션 입력이 올바르지 않습니다.' })
    return res.status(200).json({ ...resolve(state, req.body.pickedIds, req.body.pityMiss), simulated: true })
  }

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

    return res.status(200).json({ ...resolve(state, req.body.pickedIds, req.body.pityMiss), state: publicState(state) })
  } catch (e) {
    return res.status(500).json({ error: `개봉 실패: ${e.message}` })
  }
}
