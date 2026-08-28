/**
 * 방 → 준비 → 개봉 흐름 검증. HTTP 서버 없이 핸들러를 직접 구동한다.
 *   node tests/room.test.mjs
 *
 * 이 제품의 핵심 주장 세 개를 잠근다.
 *   ① 한 명이라도 안 누르면 열리지 않는다 (409)
 *   ② 정산 차액은 절대 음수가 될 수 없다 (꽝 없음)
 *   ③ 같은 방을 다시 열면 같은 결과가 나온다 (재추첨 불가)
 */
import boxesHandler from '../api/boxes.js'
import roomHandler from '../api/room.js'
import openHandler from '../api/open.js'
import { TEAM_MAX, MAX_DRAWS_PER_PERSON, BOXES } from '../api/_draw.js'

let fail = 0
const check = (label, cond, extra = '') => {
  // 근거는 실패했을 때만 붙인다. 통과 로그에 붙으면 실패처럼 읽힌다.
  console.log(`${cond ? '✓' : '✗ 실패'} ${label}${!cond && extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

const res = () => {
  const r = { code: 200, body: null, headers: {} }
  r.status = (c) => ((r.code = c), r)
  r.json = (b) => ((r.body = b), r)
  r.setHeader = (k, v) => ((r.headers[k] = v), r)
  return r
}
const post = async (h, body) => {
  const r = res()
  await h({ method: 'POST', body }, r)
  return r
}

// ── 1. 박스 목록 ──────────────────────────────────────────────
{
  const r = res()
  await boxesHandler({ method: 'GET' }, r)
  check('GET /api/boxes 200', r.code === 200)
  check(`박스 ${BOXES.length}종`, r.body.boxes.length === BOXES.length, `${r.body.boxes.length}종`)
  const b = r.body.boxes[1]
  check('팀 1~10 확률표 전부 존재', Object.keys(b.oddsByTeam).length === TEAM_MAX)
  check('확률 합 1', Math.abs(Object.values(b.oddsByTeam[7]).reduce((a, x) => a + x, 0) - 1) < 1e-9)
  check('참여비 = 최고상품가 ÷ 200', b.topRetail === b.entry * 200)
  check('티어 4개 전부 채워짐', b.tiers.every((t) => t.count > 0), b.tiers.map((t) => `${t.tier}:${t.count}`).join(' '))
  check('C 티어 하한 = 참여비', b.tiers.find((t) => t.tier === 'C').band[0] === b.entry)
  check('수식 파라미터 공개', r.body.formula.costRatio.CR_MIN === 0.38)
  check('회사 손익분기 6명', r.body.companyBEP === 6)
  const wrong = res()
  await boxesHandler({ method: 'POST' }, wrong)
  check('POST는 405', wrong.code === 405)
}

// ── 2. 방 만들기와 합류 ────────────────────────────────────────
const created = await post(roomHandler, { action: 'create', boxId: 'charizard', name: '김연준' })
check('방 생성 200', created.code === 200)
const roomId = created.body.state.roomId
const me = created.body.memberId
check('생성 직후 1명', created.body.state.teamSize === 1)
check('phase=gather', created.body.state.phase === 'gather')

const mates = []
for (let i = 0; i < 3; i++) {
  const j = await post(roomHandler, { action: 'join', roomId, name: `팀원${i + 1}`, sim: true })
  mates.push(j.body.memberId)
}
const s4 = (await post(roomHandler, { action: 'state', roomId })).body.state
check('4명 합류', s4.teamSize === 4, `${s4.teamSize}명`)
check('팀이 커지자 S 확률 상승', s4.odds.S > created.body.state.odds.S,
  `${(created.body.state.odds.S * 100).toFixed(4)}% → ${(s4.odds.S * 100).toFixed(4)}%`)

const bad = await post(roomHandler, { action: 'create', boxId: '없는박스' })
check('없는 박스는 400', bad.code === 400)

// ── 3. 전원이 눌러야만 열린다 ──────────────────────────────────
{
  const early = await post(openHandler, { roomId })
  check('아무도 안 눌렀으면 409', early.code === 409)
}
for (const id of [me, ...mates.slice(0, 2)]) await post(roomHandler, { action: 'ready', roomId, memberId: id })
{
  const s = (await post(roomHandler, { action: 'state', roomId })).body.state
  check('3/4 준비', s.readyCount === 3 && s.teamSize === 4)
  const r = await post(openHandler, { roomId })
  check('3/4에서는 409 — 한 명이라도 안 누르면 안 열린다', r.code === 409,
    `readyCount=${r.body.readyCount}/${r.body.teamSize}`)
}

// 뽑기 수를 바꾸면 전원의 준비가 풀린다 (모르는 사이 조건이 바뀌면 안 된다)
{
  const r = await post(roomHandler, { action: 'draws', roomId, memberId: mates[2], draws: 3 })
  check('뽑기 수 변경 시 준비 초기화', r.body.state.readyCount === 0)
  check('팀 물량 반영 (4명 6뽑기)', r.body.state.teamDraws === 6, `${r.body.state.teamDraws}`)
  const over = await post(roomHandler, { action: 'draws', roomId, memberId: mates[2], draws: 99 })
  check('개인 뽑기 상한 5회', over.body.state.members.find((m) => m.id === mates[2]).draws === MAX_DRAWS_PER_PERSON)
}

// ── 4. 개봉 ───────────────────────────────────────────────────
for (const id of [me, ...mates]) await post(roomHandler, { action: 'ready', roomId, memberId: id })
const opened = await post(openHandler, { roomId })
check('4/4 준비되면 200', opened.code === 200, `code=${opened.code}`)
const R = opened.body
check('참여자 수만큼 결과', R.results.length === 4)
check('뽑기 수만큼 상품', R.results.reduce((a, r) => a + r.picks.length, 0) === R.teamDraws)
check('정산 차액 전원 0 이상 — 꽝 없음',
  R.results.every((r) => r.settle.delta >= 0),
  R.results.map((r) => `${r.name}:${r.settle.delta.toLocaleString()}`).join(' '))
check('모든 상품 시가 ≥ 참여비',
  R.results.every((r) => r.picks.every((p) => p.item.price >= R.entry)))
check('상품에 이미지·링크 존재',
  R.results.every((r) => r.picks.every((p) => p.item.url && p.item.name)))

// ── 5. 재추첨 불가 ────────────────────────────────────────────
{
  const again = await post(openHandler, { roomId })
  check('같은 방 두 번 열면 같은 결과 — 재추첨 불가',
    JSON.stringify(again.body.results) === JSON.stringify(R.results))
  const late = await post(roomHandler, { action: 'join', roomId, name: '지각', sim: true })
  check('개봉 후 합류 차단', late.code === 409, `code=${late.code}`)
}

// ── 6. 정원 ───────────────────────────────────────────────────
{
  const c = await post(roomHandler, { action: 'create', boxId: 'starter', name: '방장' })
  const rid = c.body.state.roomId
  for (let i = 1; i < TEAM_MAX; i++) await post(roomHandler, { action: 'join', roomId: rid, sim: true })
  const s = (await post(roomHandler, { action: 'state', roomId: rid })).body.state
  check(`정원 ${TEAM_MAX}명`, s.teamSize === TEAM_MAX, `${s.teamSize}명`)
  const over = await post(roomHandler, { action: 'join', roomId: rid, sim: true })
  check('정원 초과 합류는 409', over.code === 409)
}

console.log(fail === 0 ? '\n✅ 전부 통과' : `\n❌ 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
