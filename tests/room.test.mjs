/**
 * 서버 테스트 — 프레임워크 없이. `node tests/room.test.mjs`
 *
 * 네트워크를 타지 않는다. KV 환경변수가 없으면 api/_room.js가 메모리로 내려앉고,
 * OPENAI_API_KEY가 없으면 api/ask.js가 문서 발췌 폴백으로 내려앉는다.
 * 환각 id 차단만 fetch를 모킹해서 확인한다.
 */
import assert from 'node:assert/strict'
import room from '../api/room.js'
import ask, { rank, fallbackAnswer, trimPraise } from '../api/ask.js'
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
  // 남은 구좌가 줄었으므로 같은 재고라면 확률이 오르고, 재고도 줄었다면 그에 맞게 바뀐다.
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

console.log('\n─────── ChatGPT Q&A (I9·I13) ───────')

t('검색 — 질문이 관련 문서 섹션을 찾는다', () => {
  const hits = rank('오리파의 문제가 뭔가요')
  assert.ok(hits.length > 0)
  assert.ok(hits.slice(0, 3).some((s) => /오리파/.test(s.title + s.text)))
})

t('검색 — 한국어 조사를 접두 일치로 흡수한다', () => {
  // "올웨이즈인가요"는 문서에 없지만 "올웨이즈"는 있다. 접두 매칭이 없으면 0건이 된다.
  const hits = rank('왜 올웨이즈인가요?')
  assert.ok(hits.length > 0, '조사 붙은 질문이 0건이면 안 된다')
  assert.ok(hits.slice(0, 3).some((s) => /올웨이즈/.test(s.title + s.text)))
})

t('폴백 — 키 없이도 문서 발췌를 그대로 준다. 지어내지 않는다', () => {
  const r = fallbackAnswer('교환은 어떻게 동작하나요')
  assert.equal(r.source, 'fallback')
  assert.ok(r.refs.length >= 1, '어느 문서에서 왔는지 표기한다')
  assert.match(r.answer, /AI 없이 문서를 그대로/, '요약이 아니라 인용임을 첫 줄에 밝힌다')
  // 발췌가 실제 문서 본문이어야 한다 — 지어낸 문장이 아니라
  assert.ok(r.refs.every((ref) => r.answer.includes(ref)), '인용마다 출처 제목이 붙는다')
})

t('폴백 — 문서에 없는 주제는 없다고 말한다', () => {
  const r = fallbackAnswer('zzqqxx 배당률')
  assert.ok(r.refs.length === 0 || /찾지 못했/.test(r.answer))
})

await ta('키 없으면 폴백으로 내려앉고 그 사실을 표기한다 (I13)', async () => {
  delete process.env.OPENAI_API_KEY
  const r = await call(ask, { question: '확률은 어떻게 정해지나요' })
  assert.equal(r.code, 200)
  assert.equal(r.body.source, 'fallback')
})

await ta('빈 질문은 400', async () => {
  const r = await call(ask, { question: '   ' })
  assert.equal(r.code, 400)
})

await ta('키가 있으면 ChatGPT 응답 + 근거 섹션 목록 (fetch 모킹)', async () => {
  process.env.OPENAI_API_KEY = 'test-key'
  const realFetch = globalThis.fetch
  let sentBody = null
  globalThis.fetch = async (url, opt) => {
    sentBody = JSON.parse(opt.body)
    return { ok: true, json: async () => ({ choices: [{ message: { content: '지원자는 확률을 재고 나누기 구좌로 정의했다 [1]' } }] }) }
  }
  try {
    const r = await call(ask, { question: '확률은 어떻게 정해지나요' })
    assert.equal(r.body.source, 'openai')
    assert.ok(r.body.refs.length >= 1)
    assert.match(sentBody.messages[0].content, /지어내지 않는다/, '시스템 프롬프트가 문서 밖 답변을 금지한다')
    assert.match(sentBody.messages[0].content, /문서 발췌/, '컨텍스트가 실제로 실린다')
  } finally { globalThis.fetch = realFetch; delete process.env.OPENAI_API_KEY }
})

t('마무리 자평 한 문장을 잘라낸다 — 프롬프트로는 안 막힌다', () => {
  // gpt-4o-mini는 금지해도 "…중요한 역할을 해요"를 끝에 붙인다. 코드가 보증한다.
  assert.equal(
    trimPraise('천장이 없어요. 비복원이 대체해요. 재고가 줄면 확률이 올라요. 이건 중요한 역할을 해요.'),
    '천장이 없어요. 비복원이 대체해요. 재고가 줄면 확률이 올라요.')
})

t('자평이 아니면 건드리지 않는다', () => {
  const keep = '확률은 재고를 구좌로 나눈 값이에요. 팀이면 커져요. K가 1일 때 정확히 n배예요.'
  assert.equal(trimPraise(keep), keep)
})

t('사실이 든 문장은 자평 어휘가 있어도 지우지 않는다', () => {
  // 숫자가 있으면 사실을 담은 문장이다 — 자르면 정보를 잃는다
  const keep = 'A예요. B예요. 이 값이 3건으로 중요한 역할을 해요.'
  assert.equal(trimPraise(keep), keep)
})

t('두 문장 이하는 자르지 않는다 (답이 사라지면 안 된다)', () => {
  const keep = '오리파는 검증이 안 돼요. 그래서 중요한 역할을 해요.'
  assert.equal(trimPraise(keep), keep)
})

await ta('OpenAI 오류 시 폴백으로 내려앉는다', async () => {
  process.env.OPENAI_API_KEY = 'test-key'
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, status: 500 })
  try {
    const r = await call(ask, { question: '교환은 어떻게 동작하나요' })
    assert.equal(r.code, 200)
    assert.equal(r.body.source, 'fallback')
  } finally { globalThis.fetch = realFetch; delete process.env.OPENAI_API_KEY }
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
