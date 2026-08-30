/**
 * 서버 테스트 — 프레임워크 없이. `node tests/room.test.mjs`
 *
 * 네트워크를 타지 않는다. KV 환경변수가 없으면 api/_room.js가 메모리로 내려앉고,
 * 환각 id 차단만 fetch를 모킹해서 확인한다.
 */
import assert from 'node:assert/strict'
import room from '../api/room.js'
import boxes from '../api/boxes.js'
import { TEAM_MAX, slotsOf } from '../api/_box.js'

// KV·AI 없이 도는지 확인하기 위해 명시적으로 지운다.
delete process.env.KV_REST_API_URL
delete process.env.KV_REST_API_TOKEN
const REAL_KEY = process.env.OPENAI_API_KEY
delete process.env.OPENAI_API_KEY

let pass = 0
const fails = []
const t = (name, fn) => {
  try { fn(); pass++; console.log(`  ✓ ${name}`) }
  catch (e) { fails.push(name); console.log(`  ✗ ${name}\n      ${e.message}`) }
}
const ta = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`) }
  catch (e) { fails.push(name); console.log(`  ✗ ${name}\n      ${e.message}`) }
}

/** Vercel 핸들러 규약을 흉내내는 최소 shim. */
const call = async (handler, body, query = {}) => {
  let code = 200, payload = null
  await handler({ method: 'POST', body, query }, {
    status(c) { code = c; return this },
    setHeader() { return this },
    json(b) { payload = b },
  })
  return { code, body: payload }
}
const get = async (handler, query = {}) => {
  let code = 200, payload = null
  await handler({ method: 'GET', query }, {
    status(c) { code = c; return this }, setHeader() { return this }, json(b) { payload = b },
  })
  return { code, body: payload }
}

const CARDS = [...new Map(slotsOf().map((s) => [s.id, s])).values()]

console.log('─────── 방 · 게이트 · 개봉 · 교환 ───────')

let R = null, ME = null
await ta('방 생성 → 201, 방장이 참여자로 들어간다', async () => {
  const r = await call(room, { action: 'create', name: '나' })
  assert.equal(r.code, 201)
  assert.equal(r.body.members.length, 1)
  R = r.body.id; ME = r.body.you
})

await ta(`정원 ${TEAM_MAX}명까지 join 성공`, async () => {
  for (let i = 2; i <= TEAM_MAX; i++) {
    const r = await call(room, { action: 'join', roomId: R, name: `참여자${i}` })
    assert.equal(r.code, 200, `${i}번째 join이 ${r.code}`)
  }
  const s = await call(room, { action: 'state', roomId: R })
  assert.equal(s.body.members.length, TEAM_MAX)
})

await ta('정원 초과 join → 409', async () => {
  const r = await call(room, { action: 'join', roomId: R, name: '초과' })
  assert.equal(r.code, 409)
})

await ta('통 안에 없는 카드 지목 → 400', async () => {
  const r = await call(room, { action: 'target', roomId: R, memberId: ME, cardId: 'd999999999' })
  assert.equal(r.code, 400)
})

await ta('지목은 참여자당 1개, 덮어쓴다', async () => {
  await call(room, { action: 'target', roomId: R, memberId: ME, cardId: CARDS[0].id })
  const r = await call(room, { action: 'target', roomId: R, memberId: ME, cardId: CARDS[1].id })
  assert.equal(r.body.members.find((m) => m.id === ME).target, CARDS[1].id)
  assert.equal(Object.values(r.body.targets).reduce((a, b) => a + b, 0), 1)
})

await ta('setPrefs — 클라이언트가 보낸 순위도 서버가 다시 거른다 (I9)', async () => {
  // curate.js는 배포본에서 방을 건드릴 수 없다(라우트마다 별개 함수라 메모리가 갈라진다).
  // 그래서 클라이언트가 순위를 넘기는데, 넘어온 것을 믿지 않고 통 안의 id만 남긴다.
  const r = await call(room, {
    action: 'setPrefs', roomId: R, memberId: ME,
    prefs: [CARDS[3].id, '환각id', CARDS[4].id, 'd000000000'],
  })
  assert.equal(r.code, 200)
  assert.equal(r.body.kept, 2, '통 밖 id 2개가 걸러져야 한다')
  assert.equal(r.body.members.find((m) => m.id === ME).hasAiPrefs, true)
})

await ta('개봉 전 trade → 409', async () => {
  const r = await call(room, { action: 'trade', roomId: R })
  assert.equal(r.code, 409)
})

let stateBefore = null
await ta(`${TEAM_MAX - 1}/${TEAM_MAX} 준비에서 open → 409 (서버가 게이트를 소유한다, I8)`, async () => {
  const s = await call(room, { action: 'state', roomId: R })
  for (const m of s.body.members.slice(0, TEAM_MAX - 1)) {
    await call(room, { action: 'ready', roomId: R, memberId: m.id, ready: true })
  }
  stateBefore = (await call(room, { action: 'state', roomId: R })).body
  assert.equal(stateBefore.readyCount, TEAM_MAX - 1)
  const r = await call(room, { action: 'open', roomId: R })
  assert.equal(r.code, 409)
  assert.match(r.body.error, /전원이 준비/)
  assert.equal(r.body.waiting.length, 1)
})

let opened = null
await ta('전원 준비 후 open → 200', async () => {
  const s = await call(room, { action: 'state', roomId: R })
  await call(room, { action: 'ready', roomId: R, memberId: s.body.members.at(-1).id, ready: true })
  const r = await call(room, { action: 'open', roomId: R })
  assert.equal(r.code, 200)
  assert.equal(r.body.opened, true)
  assert.equal(r.body.openResults.length, TEAM_MAX)
  opened = r.body
})

t('개봉 결과가 전부 통 안의 실제 카드', () => {
  const ids = new Set(CARDS.map((c) => c.id))
  assert.ok(opened.openResults.every((x) => ids.has(x.cardId)))
})

t('꽝 없음 1층 — 뽑힌 모든 카드가 참여비 이상', () => {
  assert.ok(opened.openResults.every((x) => x.price >= 10000))
})

t('비복원 — 통 재고가 실제로 줄었다 (I3)', () => {
  assert.equal(stateBefore.live.left, 1000)
  assert.equal(opened.live.left, 1000 - TEAM_MAX)
  assert.equal(opened.live.drawn, TEAM_MAX)
})

t('비복원 — 확률이 갱신됐다 (I3)', () => {
  const before = stateBefore.live.tiers.find((x) => x.tier === 'C')
  const after = opened.live.tiers.find((x) => x.tier === 'C')
  assert.equal(before.N, 1000)
  assert.equal(after.N, 1000 - TEAM_MAX)
  // 남은 카드가 줄었으므로 같은 재고라면 확률이 오르고, 재고도 줄었다면 그에 맞게 바뀐다.
  assert.notEqual(before.pct, after.pct, '확률 문자열이 그대로면 갱신되지 않은 것이다')
  const drawnC = opened.openResults.filter((x) => x.tier === 'C').length
  assert.equal(after.K, before.K - drawnC, '남은 재고가 뽑힌 만큼 정확히 줄어야 한다')
})

t('개봉 직전 확률이 결과에 기록돼 있다 (화면의 비복원 시각화 근거)', () => {
  const first = opened.openResults[0], last = opened.openResults.at(-1)
  assert.equal(first.slotsBefore, 1000)
  assert.equal(last.slotsBefore, 1000 - (TEAM_MAX - 1))
  assert.ok(first.oddsBefore.S.pct.endsWith('%'))
})

await ta('같은 방 2회 개봉 → 동일 결과 (멱등)', async () => {
  const again = await call(room, { action: 'open', roomId: R })
  assert.equal(again.code, 200)
  assert.equal(again.body.idempotent, true)
  assert.deepEqual(again.body.openResults, opened.openResults)
  assert.equal(again.body.live.left, 1000 - TEAM_MAX, '두 번 열어서 통이 두 번 깎이면 안 된다')
})

let traded = null
await ta('개봉 후 trade → 200, 아무도 나빠지지 않는다 (I5)', async () => {
  const r = await call(room, { action: 'trade', roomId: R })
  assert.equal(r.code, 200)
  assert.equal(r.body.trade.results.length, TEAM_MAX)
  assert.equal(r.body.trade.noneWorse, true)
  assert.ok(r.body.trade.results.every((x) => !x.worse))
  traded = r.body.trade
})

t('교환 사이클은 길이 2 이상만 화면에 나간다', () => {
  assert.ok(traded.cycles.every((c) => c.length >= 2))
})

await ta('trade 2회 호출 → 동일 결과 (멱등)', async () => {
  const again = await call(room, { action: 'trade', roomId: R })
  assert.equal(again.body.idempotent, true)
  assert.deepEqual(again.body.trade, traded)
})

await ta('개봉된 방에 join → 409', async () => {
  const r = await call(room, { action: 'join', roomId: R, name: '늦은사람' })
  assert.equal(r.code, 409)
})

console.log('\n─────── 직접 교환 요청 ───────')

/** 개봉까지 끝난 방 하나를 만든다. */
const openedRoom = async (n = 3) => {
  const c = await call(room, { action: 'create', name: '나' })
  const rid = c.body.id, me = c.body.you
  const ids = [me]
  for (let i = 1; i < n; i++) {
    const j = await call(room, { action: 'join', roomId: rid, name: `p${i}` })
    ids.push(j.body.you)
  }
  for (const id of ids) await call(room, { action: 'ready', roomId: rid, memberId: id, ready: true })
  const o = await call(room, { action: 'open', roomId: rid })
  return { rid, ids, view: o.body }
}

await ta('요청하면 상대에게 쌓이고, 카드는 아직 안 바뀐다', async () => {
  const { rid, ids, view: v0 } = await openedRoom()
  const before = { ...v0.holdings }
  const r = await call(room, { action: 'swapRequest', roomId: rid, memberId: ids[0], targetId: ids[1] })
  assert.equal(r.code, 200)
  assert.equal(r.body.requests.length, 1)
  assert.deepEqual(r.body.holdings, before, '요청만으로 카드가 바뀌면 안 된다')
})

await ta('수락하면 두 사람의 카드가 정확히 맞바뀐다', async () => {
  const { rid, ids, view: v0 } = await openedRoom()
  const [a, b] = ids
  const A = v0.holdings[a], B = v0.holdings[b]
  await call(room, { action: 'swapRequest', roomId: rid, memberId: a, targetId: b })
  const r = await call(room, { action: 'swapRespond', roomId: rid, memberId: b, fromId: a, accept: true })
  assert.equal(r.code, 200)
  assert.equal(r.body.holdings[a], B, 'A가 B의 카드를 받아야 한다')
  assert.equal(r.body.holdings[b], A, 'B가 A의 카드를 받아야 한다')
  assert.equal(r.body.requests.length, 0, '성사된 요청은 목록에서 빠진다')
})

await ta('거절하면 요청만 사라지고 카드는 그대로', async () => {
  const { rid, ids, view: v0 } = await openedRoom()
  const before = { ...v0.holdings }
  await call(room, { action: 'swapRequest', roomId: rid, memberId: ids[0], targetId: ids[1] })
  const r = await call(room, { action: 'swapRespond', roomId: rid, memberId: ids[1], fromId: ids[0], accept: false })
  assert.equal(r.body.requests.length, 0)
  assert.deepEqual(r.body.holdings, before)
})

await ta('개봉 기록은 스왑에 훼손되지 않는다 (비복원 서사의 근거)', async () => {
  const { rid, ids, view: v0 } = await openedRoom()
  const drawn0 = v0.openResults.map((x) => x.cardId)
  await call(room, { action: 'swapRequest', roomId: rid, memberId: ids[0], targetId: ids[1] })
  const r = await call(room, { action: 'swapRespond', roomId: rid, memberId: ids[1], fromId: ids[0], accept: true })
  assert.deepEqual(r.body.openResults.map((x) => x.cardId), drawn0, 'openResults는 뽑힌 기록이라 불변이어야 한다')
  assert.ok(r.body.openResults.every((x) => x.slotsBefore > 0), '뽑기 직전 상태가 남아 있어야 한다')
})

await ta('같은 상대에게 두 번 요청해도 하나만 쌓인다', async () => {
  const { rid, ids } = await openedRoom()
  await call(room, { action: 'swapRequest', roomId: rid, memberId: ids[0], targetId: ids[1] })
  const r = await call(room, { action: 'swapRequest', roomId: rid, memberId: ids[0], targetId: ids[1] })
  assert.equal(r.body.requests.length, 1)
})

await ta('자기 자신에게는 요청할 수 없다', async () => {
  const { rid, ids } = await openedRoom()
  const r = await call(room, { action: 'swapRequest', roomId: rid, memberId: ids[0], targetId: ids[0] })
  assert.equal(r.code, 400)
})

await ta('TTC는 직접 교환 결과 위에서 배정한다 (스왑을 되돌리지 않는다)', async () => {
  const { rid, ids, view: v0 } = await openedRoom(3)
  const [a, b] = ids
  const B = v0.holdings[b]
  await call(room, { action: 'swapRequest', roomId: rid, memberId: a, targetId: b })
  await call(room, { action: 'swapRespond', roomId: rid, memberId: b, fromId: a, accept: true })
  const t = await call(room, { action: 'trade', roomId: rid })
  assert.equal(t.code, 200)
  const ra = t.body.trade.results.find((x) => x.memberId === a)
  assert.equal(ra.before.id, B, 'TTC의 출발점이 스왑 이후 보유여야 한다')
  assert.ok(t.body.trade.noneWorse, '개별 합리성은 그대로 보장된다')
})

await ta('한 번에 맞추기가 끝나면 직접 교환은 잠긴다', async () => {
  const { rid, ids } = await openedRoom()
  await call(room, { action: 'trade', roomId: rid })
  const r = await call(room, { action: 'swapRequest', roomId: rid, memberId: ids[0], targetId: ids[1] })
  assert.equal(r.code, 409)
})

await ta('개봉 전에는 요청할 수 없다', async () => {
  const c = await call(room, { action: 'create', name: '나' })
  const j = await call(room, { action: 'join', roomId: c.body.id, name: 'p1' })
  const r = await call(room, { action: 'swapRequest', roomId: c.body.id, memberId: c.body.you, targetId: j.body.you })
  assert.equal(r.code, 409)
})

console.log('\n─────── 다통 (통 선택) ───────')

await ta('boxId로 방을 만들면 그 통에서 뽑는다', async () => {
  const c = await call(room, { action: 'create', name: '나', boxId: 'starter' })
  assert.equal(c.code, 201)
  assert.equal(c.body.boxId, 'starter')
  const rid = c.body.id, me = c.body.you
  await call(room, { action: 'ready', roomId: rid, memberId: me, ready: true })
  const o = await call(room, { action: 'open', roomId: rid })
  assert.equal(o.code, 200)
  // 입문 통은 참여비 5,000원 — 뽑힌 카드가 그 통의 밴드 안에 있어야 한다
  assert.ok(o.body.openResults[0].price >= 5000, '입문 통 꽝없음 1층')
})

await ta('없는 boxId는 400 — 조용히 기본 통으로 바꿔치기하지 않는다', async () => {
  const c = await call(room, { action: 'create', name: '나', boxId: 'no-such-box' })
  assert.equal(c.code, 400)
})

console.log('\n─────── /api/boxes ───────')

await ta('통 구성과 확률표를 내려주고, 캐시 헤더가 s-maxage=60', async () => {
  let header = null
  await boxes({ method: 'GET', query: {} }, {
    status() { return this }, setHeader(k, v) { if (k === 'Cache-Control') header = v; return this },
    json(b) { assert.equal(b.odds.length, 4); assert.equal(b.box.N, 1000) },
  })
  assert.match(header, /s-maxage=60/)
  assert.match(header, /stale-while-revalidate=600/)
})

await ta('roomId를 주면 그 방의 현재 통 상태를 함께 준다', async () => {
  const r = await get(boxes, { roomId: R })
  assert.equal(r.body.live.left, 1000 - TEAM_MAX)
  assert.equal(r.body.live.drawn, TEAM_MAX)
})

await ta('없는 방을 물으면 live는 null (조용히 지어내지 않는다)', async () => {
  const r = await get(boxes, { roomId: 'nosuchroom' })
  assert.equal(r.body.live, null)
})

if (REAL_KEY) process.env.OPENAI_API_KEY = REAL_KEY
console.log(`\n  ${pass}개 통과${fails.length ? ` · ${fails.length}건 실패: ${fails.join(', ')}` : ''}`)
if (fails.length) process.exitCode = 1
