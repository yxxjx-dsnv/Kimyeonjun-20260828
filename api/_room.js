/**
 * 방 저장소 — Vercel KV(= Upstash Redis)의 REST API를 fetch로 직접 부른다.
 * SDK를 설치하지 않으므로 npm 패키지가 0개 늘어난다(패키지 4개 원칙 유지).
 *
 * 환경변수가 없으면 프로세스 메모리로 폴백한다. 로컬 `vercel dev`는 단일
 * 프로세스라 정상 동작하고, 배포본에서는 서버리스 인스턴스가 흩어지므로
 * 클라이언트가 시뮬레이션 모드로 전환한다(화면에 '시뮬' 배지 상시 노출).
 */
const URL_ = process.env.KV_REST_API_URL
const TOKEN = process.env.KV_REST_API_TOKEN

export const kvEnabled = () => Boolean(URL_ && TOKEN)

const mem = new Map()
export const TTL_SEC = 6 * 60 * 60

async function cmd(args) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) throw new Error(`KV HTTP ${res.status}`)
  const j = await res.json()
  if (j.error) throw new Error(`KV ${j.error}`)
  return j.result
}

const key = (id) => `olbox:room:${id}`

export async function readRoom(id) {
  if (!kvEnabled()) {
    const v = mem.get(key(id))
    return v && v.exp > Date.now() ? v.val : null
  }
  const raw = await cmd(['GET', key(id)])
  return raw ? JSON.parse(raw) : null
}

export async function writeRoom(id, state) {
  if (!kvEnabled()) {
    mem.set(key(id), { val: state, exp: Date.now() + TTL_SEC * 1000 })
    return
  }
  await cmd(['SET', key(id), JSON.stringify(state), 'EX', String(TTL_SEC)])
}

/**
 * 읽고-고치고-쓰기. Upstash REST에는 트랜잭션을 걸지 않았다 —
 * 두 명이 정확히 같은 순간에 합류하면 한 쪽이 덮일 수 있다.
 * 데모 규모에서는 재시도 한 번으로 충분하고, 한계는 README에 적어 둔다.
 */
export async function mutateRoom(id, fn) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cur = await readRoom(id)
    if (!cur) return null
    const next = fn(structuredClone(cur))
    if (!next) return cur
    await writeRoom(id, next)
    const check = await readRoom(id)
    if (check && check.rev === next.rev) return check
  }
  return readRoom(id)
}

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789' // 헷갈리는 글자(i,l,o,0,1) 제외
export const newId = (n = 6) =>
  Array.from({ length: n }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

/**
 * 원자적 카운터 — 재고 차감·투표 집계처럼 경쟁조건이 실제로 위험한 곳에 쓴다.
 * 방 상태의 read-modify-write와 달리 Upstash가 원자성을 보장하므로 재시도가 필요 없다.
 */
export async function counter(key, delta = 0) {
  if (!kvEnabled()) {
    const cur = mem.get(`n:${key}`) || 0
    const next = delta ? cur + delta : cur
    if (delta) mem.set(`n:${key}`, next)
    return next
  }
  if (!delta) return Number((await cmd(['GET', key])) || 0)
  return Number(await cmd(['INCRBY', key, String(delta)]))
}

/**
 * 방의 초기 상태. **통 전체를 저장하지 않는다** — 뽑힌 구좌의 인덱스만 남기고
 * 남은 통은 api/_box.js의 remainingFrom()으로 복원한다(1,000구좌 ≈ 100KB 절약).
 * 저장된 것과 계산된 것이 두 벌로 갈라지지 않는다는 것이 더 중요한 이유다.
 */
export const newRoom = (id, boxId = 'olbox') => ({
  id,
  boxId,
  rev: 0,
  createdAt: Date.now(),
  members: [],          // { id, name, ready, target, aiPrefs, aiWhy, aiSource }
  drawn: [],            // 뽑힌 구좌 인덱스 (비복원 상태의 전부)
  round: 0,
  opened: false,
  openResults: null,    // 개봉 결과 (멱등 재조회용)
  trade: null,          // 교환 결과 (멱등 재조회용)
})
