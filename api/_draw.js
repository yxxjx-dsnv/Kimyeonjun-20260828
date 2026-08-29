/**
 * 확률 엔진 — import 가능한 모듈이면서 실행 가능한 self-check다.
 *   node api/_draw.js
 *
 * ## 이 파일에 없는 것
 * 배수, 곡선, 예산, CAC, 천장, 보정 계수. 사람이 확률을 조절할 수 있는 손잡이가
 * 하나도 없다. 확률은 재고 ÷ 구좌이고, 팀 효과는 초기하분포에서 나온다.
 *
 * v1은 예산에서 배수를 뽑아 확률에 곱했고(CR_MIN·CR_MAX·N0·K·CAC·CAC_CAP),
 * 그 결과 1,000구좌 × 0.280% = 기대 배출 2.8개인데 재고는 1개인 모순이 남았다.
 * self-check 5,631건이 전부 통과하는 동안에도 모델은 현실과 다른 것을 재고 있었다.
 * 검사가 많은 것과 옳은 것을 재는 것은 다른 문제다. v2는 배수 자체를 만들지 않는다.
 *
 * 유도 전문: docs/references.md §2.1~2.4 · 명세: SPEC.md §4
 */
import { fileURLToPath } from 'node:url'
import { realpathSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { BOX, N, K, TIERS, TEAM_MAX, FEE, slotsOf } from './_box.js'

const isMain = () => {
  try { return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]) } catch { return false }
}

// ───────────────────────────── 확률 ─────────────────────────────

/** 개인 1회 추출 확률. 정의이지 수식이 아니다. P(g) = K_g / N */
export const pSolo = (k, n = N) => k / n

/**
 * 팀 n명이 각자 1구좌씩 비복원으로 뽑을 때 등급 g가 최소 한 장 나올 확률.
 *
 *   P_team = 1 − C(N−K, n) / C(N, n)      ← 초기하분포
 *
 * 이항계수를 직접 계산하면 C(1000, 10) ≈ 2.6e23으로 배정도 정수 한계를 넘는다.
 * 약분해서 곱 형태로 바꾸면 각 항이 1 미만이라 오버플로가 없다.
 *
 *   C(N−K, n)    K−1  N − n − i
 *   ───────── =   ∏   ─────────
 *    C(N, n)     i=0    N − i
 *
 * (아래 pTeamLog가 로그 감마 경로로 같은 값을 계산한다. self-check가 대조한다.)
 */
export function pTeam(k, n, total = N) {
  if (k <= 0 || n <= 0) return 0
  if (n >= total - k + 1) return 1 // 남은 구좌보다 뽑는 수가 많으면 반드시 포함된다
  let ratio = 1
  for (let i = 0; i < k; i++) ratio *= (total - n - i) / (total - i)
  return 1 - ratio
}

/** 혼자 대비 배수. K=1이면 정확히 n이 나온다. K>1이면 n보다 작다. */
export const teamMultiple = (k, n, total = N) => pTeam(k, n, total) / pSolo(k, total)

/**
 * 갱신 확률 — j구좌가 이미 뽑혔고 등급 g가 아직 안 나왔다면.
 *   P(g) = K_g / (N − j)
 *
 * 도박사의 오류("많이 안 나왔으니 이제 나올 때가 됐다")는 복원 추출에서는
 * 착각이지만 비복원에서는 **참이다.** 이것이 천장을 대체한다(SPEC §4.4, D4).
 * 별도 천장 장치를 만들지 않는다 — 인위적 파라미터를 하나 더 만드는 순간
 * "회사가 정한 숫자가 없다"는 주장이 깨진다.
 */
export function pUpdated(k, j, total = N) {
  const left = total - j
  // 남은 구좌가 재고보다 적으면 "j가 빠졌는데 g가 아직 안 나왔다"는 전제 자체가
  // 성립하지 않는다. v1스러운 처리는 Math.min(1, k/left)로 1에 클램프하는 것인데,
  // 그러면 불가능한 상태가 "확률 100%"로 표시된다. 화면에 100%라고 쓰면
  // 9.85배를 10배라고 쓰는 것과 같은 종류의 거짓말이 된다. null로 두고 화면은 '—'.
  if (left < k) return null
  return k / left
}

/**
 * 자연빈도 — 확률 오인을 줄인다(D10 Gigerenzer & Hoffrage 1995).
 *
 * 기준을 N(구좌 수)으로 고정한다. 행마다 기준이 달라지면 비교가 안 되고,
 * N으로 두면 "1,000명 중 1명"이 곧 "1,000구좌 중 재고 1장"이라 확률의 정의가
 * 문장 안에서 그대로 보인다. 확률을 따로 설명할 필요가 없어진다.
 */
export function naturalFreq(p, base = N) {
  if (p === null || p === undefined || Number.isNaN(p)) return '—'
  const raw = p * base
  const shown = raw < 1 ? Math.round(raw * 10) / 10 : Math.round(raw)
  if (p < 1 && shown >= base) return `${base.toLocaleString('ko-KR')}명 중 거의 전원`
  const approx = Math.abs(raw - shown) > 1e-9 ? '약 ' : ''
  return `${base.toLocaleString('ko-KR')}명 중 ${approx}${shown.toLocaleString('ko-KR')}명`
}

/** 화면과 서버가 같은 문자열을 쓰도록 포맷을 여기서 소유한다(I4). */
export const fmtPct = (p) => {
  if (p === null || p === undefined || Number.isNaN(p)) return '—'
  const s = (p * 100).toFixed(3)
  // 반올림이 100%나 0%를 만들면 그대로 쓰지 않는다. 9.85배를 10배라 쓰지 않는 것과 같다.
  if (p < 1 && s === '100.000') return '>99.999%'
  if (p > 0 && s === '0.000') return '<0.001%'
  return `${s}%`
}
export const fmtMul = (m) => `${m.toFixed(2)}배`

/** 등급 하나의 전체 확률 정보. 화면은 이 객체를 렌더만 한다. */
export function tierOdds(tier, box = BOX) {
  const t = box.tiers.find((x) => x.tier === tier)
  const solo = pSolo(t.K, box.N)
  return {
    tier,
    K: t.K,
    N: box.N,
    solo,
    soloPct: fmtPct(solo),
    soloFreq: naturalFreq(solo, box.N),
    team: Array.from({ length: box.teamMax }, (_, i) => {
      const n = i + 1
      const p = pTeam(t.K, n, box.N)
      return { n, p, pct: fmtPct(p), freq: naturalFreq(p, box.N), multiple: p / solo, mul: fmtMul(p / solo) }
    }),
    exactlyLinear: t.K === 1, // K=1일 때만 정확히 n배다
  }
}

export const allOdds = (box = BOX) => TIERS.map((g) => tierOdds(g, box))

/** 갱신 확률표. j구좌 소진 시점의 확률. */
export const updateTable = (tier, js, box = BOX) => {
  const t = box.tiers.find((x) => x.tier === tier)
  return js.map((j) => {
    const p = pUpdated(t.K, j, box.N)
    return { j, left: box.N - j, p, possible: p !== null, pct: fmtPct(p), freq: naturalFreq(p, box.N) }
  })
}

// ───────────────────────────── 추첨 ─────────────────────────────

/** 결정적 난수 — 같은 시드는 같은 수열. xmur3 해시 + mulberry32. */
export function rng(seed) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = (h ^= h >>> 16) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 시드 규약 (I7). 같은 방을 다시 열면 같은 결과가 나온다. */
export const drawSeed = (roomId, boxId, participantId, round) =>
  `${roomId}|${boxId}|${participantId}|${round}`

/** 남은 구좌에서 하나를 뽑는다. 복원하지 않는다 — 뽑힌 구좌는 배열에서 빠진다. */
export function drawOne(seed, remaining) {
  const i = Math.floor(rng(seed)() * remaining.length)
  return { index: i, slot: remaining[i] }
}

/**
 * 한 회차 개봉. 참여자들이 **순서대로** 같은 통에서 비복원으로 각자 1구좌씩 뽑는다.
 * 뽑을 때마다 통이 줄고 남은 사람의 확률이 갱신된다 — 그 과정을 trace에 남겨
 * 화면이 "남은 구좌 999개 → S 확률 0.100%"를 실제 계산값으로 보여줄 수 있게 한다.
 */
export function openRound({ roomId, boxId = 'box', participantIds, round = 1, box = BOX, remaining = null }) {
  let left = remaining ? remaining.slice() : slotsOf(box)
  const results = []
  for (const pid of participantIds) {
    const before = left.length
    const oddsBefore = Object.fromEntries(TIERS.map((g) => [g, left.filter((s) => s.tier === g).length / before]))
    const { index, slot } = drawOne(drawSeed(roomId, boxId, pid, round), left)
    left.splice(index, 1)
    results.push({ participantId: pid, ...slot, slotsBefore: before, oddsBefore })
  }
  return { results, remaining: left, drawn: results.length }
}

// ─────────────────────────── self-check ───────────────────────────

/** 로그 감마 (Lanczos). 곱 형태 계산을 대조하기 위한 독립 경로다. */
function lgamma(z) {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012,
    9.9843695780195716e-6, 1.5056327351493116e-7]
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z)
  z -= 1
  let x = 0.99999999999980993
  for (let i = 0; i < g.length; i++) x += g[i] / (z + i + 1)
  const t = z + g.length - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}
const logC = (a, b) => (b < 0 || b > a ? -Infinity : lgamma(a + 1) - lgamma(b + 1) - lgamma(a - b + 1))
/** 같은 확률을 로그 경로로 계산한다. pTeam과 1e-10 이내로 일치해야 한다. */
export const pTeamLog = (k, n, total = N) =>
  n >= total - k + 1 ? 1 : 1 - Math.exp(logC(total - k, n) - logC(total, n))

export function check() {
  const fails = []
  let count = 0
  const ok = (name, cond, detail) => {
    count++
    if (!cond) fails.push(name)
    console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  }
  const near = (a, b, eps) => Math.abs(a - b) <= eps

  // 1. 구좌 보존
  ok('Σ K_g = N', TIERS.reduce((s, g) => s + K[g], 0) === N, `${N}`)

  // 2. K=1이면 P_team(n) == n/N 정확히
  let worst1 = 0
  for (let n = 1; n <= TEAM_MAX; n++) worst1 = Math.max(worst1, Math.abs(pTeam(1, n) - n / N))
  ok('K=1일 때 P_team(n) = n/N (오차 ≤ 1e-12)', worst1 <= 1e-12, `최대 오차 ${worst1.toExponential(2)}`)

  // 3. n에 대해 단조 증가
  let mono = true
  for (const g of TIERS) for (let n = 2; n <= TEAM_MAX; n++) if (pTeam(K[g], n) <= pTeam(K[g], n - 1)) mono = false
  ok('P_team이 n에 대해 단조 증가', mono)

  // 4. P_team(1) == P(g)
  const worst4 = Math.max(...TIERS.map((g) => Math.abs(pTeam(K[g], 1) - pSolo(K[g]))))
  ok('P_team(1) = P(g)', worst4 <= 1e-15, `최대 오차 ${worst4.toExponential(2)}`)

  // 5. 갱신 확률 단조 증가, j = N−K에서 1.0
  let uMono = true
  for (const g of TIERS) {
    for (let j = 1; j <= N - K[g]; j++) if (pUpdated(K[g], j) < pUpdated(K[g], j - 1)) uMono = false
    // 전제가 성립하지 않는 구간은 확률이 아니라 null이어야 한다
    for (let j = N - K[g] + 1; j < N; j++) if (pUpdated(K[g], j) !== null) uMono = false
  }
  ok('갱신 확률: 가능 구간에서 단조 증가, 불가능 구간은 null', uMono)
  ok('j = N−K_g 에서 갱신 확률 = 1.0',
    TIERS.every((g) => near(pUpdated(K[g], N - K[g]), 1, 1e-12)),
    TIERS.map((g) => `${g}:${pUpdated(K[g], N - K[g]).toFixed(4)}`).join(' '))

  // 6. 수치 안정성 — 곱 형태 vs 로그 감마
  let worst6 = 0, tested6 = 0
  for (let n = 1; n <= 10; n++) {
    for (let k = 1; k <= 970; k++) {
      worst6 = Math.max(worst6, Math.abs(pTeam(k, n) - pTeamLog(k, n)))
      tested6++
    }
  }
  ok(`수치 안정성 (곱 형태 vs 로그감마, ${tested6.toLocaleString()}개 조합, ≤ 1e-10)`,
    worst6 <= 1e-10, `최대 차 ${worst6.toExponential(2)}`)

  // 7. 확률 범위
  let ranged = true, tested7 = 0
  for (let n = 1; n <= TEAM_MAX; n++) for (let k = 1; k <= 999; k++) {
    const p = pTeam(k, n); tested7++
    if (!(p >= 0 && p <= 1)) ranged = false
  }
  for (const g of TIERS) for (let j = 0; j <= N - 1; j++) {
    const p = pUpdated(K[g], j); tested7++
    if (p !== null && !(p >= 0 && p <= 1)) ranged = false
  }
  ok(`모든 확률이 [0, 1] 안 (${tested7.toLocaleString()}건)`, ranged)

  // 8. 비복원 — 통을 끝까지 비우면 등급별 배출이 정확히 재고와 같다
  const full = openRound({ roomId: 'drain', participantIds: Array.from({ length: N }, (_, i) => `p${i}`) })
  const drained = Object.fromEntries(TIERS.map((g) => [g, full.results.filter((r) => r.tier === g).length]))
  ok('비복원 — 전량 개봉 시 등급별 배출 = 재고',
    TIERS.every((g) => drained[g] === K[g]) && full.remaining.length === 0,
    TIERS.map((g) => `${g}:${drained[g]}/${K[g]}`).join(' '))

  // 9. 비복원 — 10만 회 시뮬에서 재고를 초과하는 배출이 없다
  const SESS = 10000, PER = 10
  let over = 0, drawsTotal = 0
  const tally = Object.fromEntries(TIERS.map((g) => [g, 0]))
  for (let s = 0; s < SESS; s++) {
    const r = openRound({ roomId: `sim${s}`, participantIds: Array.from({ length: PER }, (_, i) => `p${i}`) })
    const c = Object.fromEntries(TIERS.map((g) => [g, r.results.filter((x) => x.tier === g).length]))
    for (const g of TIERS) { if (c[g] > K[g]) over++; tally[g] += c[g] }
    drawsTotal += r.results.length
  }
  ok(`비복원 — ${drawsTotal.toLocaleString()}회 추출에서 재고 초과 0건`, over === 0, `초과 ${over}건`)

  // 10. 카이제곱 적합도 (df=3, α=0.01 임계 11.345)
  const chi = TIERS.reduce((s, g) => {
    const e = drawsTotal * pSolo(K[g])
    return s + (tally[g] - e) ** 2 / e
  }, 0)
  ok(`카이제곱 적합도 χ²=${chi.toFixed(3)} < 11.345 (df=3, α=0.01)`, chi < 11.345,
    TIERS.map((g) => `${g} 관측 ${tally[g]} / 기대 ${(drawsTotal * pSolo(K[g])).toFixed(0)}`).join(' · '))

  // 11. 결정성 (I7)
  const a1 = openRound({ roomId: 'seed-test', participantIds: ['a', 'b', 'c'] })
  const a2 = openRound({ roomId: 'seed-test', participantIds: ['a', 'b', 'c'] })
  ok('결정성 — 같은 방 2회 개봉이 동일', JSON.stringify(a1.results) === JSON.stringify(a2.results))
  const b1 = openRound({ roomId: 'other-room', participantIds: ['a', 'b', 'c'] })
  ok('다른 방은 다른 결과', JSON.stringify(a1.results) !== JSON.stringify(b1.results))

  // 12. 꽝 없음 1층 — 뽑힌 무엇이든 참여비 이상
  ok('꽝 없음 1층 — 전 구좌 시가 ≥ 참여비',
    slotsOf().every((s) => s.price >= FEE), `최저 ${Math.min(...slotsOf().map((s) => s.price)).toLocaleString()}원`)

  // 13. "회사가 정한 숫자가 없다"를 주석이 아니라 검사로 지킨다.
  //     이 제품의 핵심 주장이므로, 누가 v1의 파라미터를 다시 들여오면 여기서 깨진다.
  //
  //     처음엔 금지어가 소스에 문자로 나타나는지 봤는데, 그러면 이 검사 자신의
  //     정규식 리터럴이 걸려서 _draw.js가 스스로를 위반으로 판정했다. 재려던 것은
  //     "그 단어가 어디 적혀 있는가"가 아니라 "그 이름으로 파라미터가 선언돼 있는가"다.
  //     선언 형태로 검사하면 언급과 사용이 갈린다.
  const FORBIDDEN = /\b(?:const|let|var|function)\s+(costRatio|cacRecovered|CR_MIN|CR_MAX|CAC|CAC_CAP|VIRAL_MAX|N0|FIXED_COST_RATIO|PRICE_RATIO|MARGIN|SPLIT|logistic)\b/
  const apiDir = dirname(fileURLToPath(import.meta.url))
  const scanned = readdirSync(apiDir).filter((f) => f.endsWith('.js') && f !== '_pool.js')
  const offenders = scanned.filter((f) => {
    const src = readFileSync(join(apiDir, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1')
    return FORBIDDEN.test(src)
  })
  ok('api/ 전체에 예산·곡선 파라미터 선언 없음 (확률 경로에 손잡이가 없다)',
    offenders.length === 0, offenders.length ? offenders.join(', ') : `${scanned.length}개 파일 검사: ${scanned.join(', ')}`)

  return { fails, count }
}

if (isMain()) {
  const won = (n) => n.toLocaleString('ko-KR') + '원'
  console.log('═'.repeat(78))
  console.log(`확률 엔진 — 참여비 ${won(FEE)} · ${N}구좌 · 정원 ${TEAM_MAX}명`)
  console.log('═'.repeat(78))

  console.log('\n■ 인원별 확률 (개인 → 팀)')
  console.log('  등급  재고   혼자      ' + Array.from({ length: TEAM_MAX }, (_, i) => `${i + 1}명`.padStart(9)).join(''))
  for (const o of allOdds()) {
    console.log(`   ${o.tier}   ${String(o.K).padStart(4)}  ${o.soloPct.padStart(8)}  ` +
      o.team.map((t) => t.pct.padStart(9)).join(''))
  }
  console.log('\n  혼자 대비 배수' + ' '.repeat(8) + Array.from({ length: TEAM_MAX }, (_, i) => `${i + 1}명`.padStart(9)).join(''))
  for (const o of allOdds()) {
    console.log(`   ${o.tier}   ${String(o.K).padStart(4)}  ${' '.repeat(8)}  ` +
      o.team.map((t) => t.mul.padStart(9)).join('') + (o.exactlyLinear ? '   ← K=1이라 정확히 n배' : ''))
  }

  console.log('\n■ 자연빈도 (D10) — 기준을 구좌 수로 고정하면 확률의 정의가 문장에 보인다')
  for (const o of allOdds()) {
    console.log(`   ${o.tier}  혼자 ${o.soloPct.padStart(8)}  ${o.soloFreq.padEnd(22)}` +
      `팀 10명 ${o.team[9].pct.padStart(8)}  ${o.team[9].freq}`)
  }

  console.log('\n■ 갱신 확률 — 비복원이 천장을 대체한다')
  console.log('   등급   ' + [0, 250, 500, 750, 900, 990].map((j) => `j=${j}`.padStart(11)).join(''))
  for (const g of TIERS) {
    console.log(`    ${g}    ` + updateTable(g, [0, 250, 500, 750, 900, 990]).map((r) => r.pct.padStart(11)).join(''))
  }
  console.log('    ※ S등급: 남은 구좌가 줄수록 확률이 오른다. 990구좌가 빠지면 10%다.')
  console.log('      도박사의 오류가 비복원에서는 참이 된다. 별도 천장 장치가 없다.')
  console.log('    ※ —는 확률 0이 아니라 **성립 불가능한 상태**다. 예: 990구좌가 빠졌는데')
  console.log('      B등급 25장이 아직 남아 있을 수는 없다(남은 구좌가 10개뿐이므로).')
  console.log('      1로 클램프하면 불가능한 상태가 100%로 표시된다. 그렇게 하지 않는다.')

  console.log('\n─────────────────────────── self-check ───────────────────────────')
  const { fails, count } = check()
  console.log(`\n  ${count}개 항목 · ${fails.length === 0 ? '전부 통과' : `${fails.length}건 실패: ${fails.join(', ')}`}`)
  if (fails.length) process.exitCode = 1
}
