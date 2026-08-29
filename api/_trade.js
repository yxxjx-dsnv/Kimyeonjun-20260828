/**
 * 교환 엔진 — Top Trading Cycles. import 가능한 모듈이면서 실행 가능한 self-check다.
 *   node api/_trade.js
 *
 * ## 왜 이것이 이 제품의 핵심인가
 * **팀에 S가 나오는 것과 내가 S를 갖는 것은 다르다.**
 * 교환이 없으면 팀이 아무리 커져도 개인 확률은 K_g/N 그대로다.
 * 교환이 팀 확률을 개인 확률로 전환하는 장치이고, 그래서 교환 없이는 팀이
 * 아무 의미가 없다. (SPEC §5.1, docs/references.md §2.3)
 *
 * ## 표기 주의
 * "Shapley-Scarf의 알고리즘"이 아니다. **Gale의 top trading cycles**이며,
 * Shapley & Scarf (1974) JME 1(1) 23–37의 6절 p.30에서 기술되고 Gale에게 귀속된다.
 *
 * ## 보장되는 성질과 출처
 *   코어 배정 존재        Shapley & Scarf (1974)
 *   비공허성·유일성·파레토 Roth & Postlewaite (1977) JME 4(2) 131–137
 *   개별 합리성            Roth & Postlewaite (1977)   ← 아무도 나빠지지 않는다
 *   전략 방지              Roth (1982) Economics Letters 9(2) 127–132
 */
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { rng } from './_draw.js'
import { BOX, slotsOf } from './_box.js'

const isMain = () => {
  try { return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]) } catch { return false }
}

/** 시드 규약 (I7). 같은 방·같은 회차는 같은 교환 결과. */
export const tradeSeed = (roomId, round) => `${roomId}|${round}|trade`

/**
 * Top Trading Cycles.
 *
 * 입력  participants: [{ id, holding, prefs }]
 *         holding  보유 카드의 **종류** id
 *         prefs    카드 종류 id의 선호 순위 (내림차순). 자기 보유 종류를 반드시 포함한다.
 * 출력  { assignment, cycles, results, rounds }
 *
 * ## 결정성 (I7)
 * 두 군데서 임의성이 생길 수 있고 둘 다 못 박는다.
 *  (1) 같은 종류를 여러 명이 들고 있을 때 누구를 가리키는가
 *      → 참여자 id 사전순 최소. 시드와 무관하게 고정.
 *  (2) 사이클이 여러 개일 때 어느 것부터 처리하는가
 *      → 시드로 정한 순서로 훑는다. TTC는 처리 순서와 무관하게 같은 배정을 내며,
 *        self-check가 여러 순서로 돌려 그것을 실제로 확인한다.
 *
 * ## 자기 자신을 가리키는 경우
 * 자기 보유 종류가 최선호면 길이 1의 사이클(자기 루프)이 된다. 이것은 오류가
 * 아니라 "교환하지 않는다"는 정상 결과다. 화면에 그리는 사이클 목록에는 길이 2
 * 이상만 담는다 — A→B→C→A 화살표에 자기 루프를 그리면 교환처럼 보인다.
 */
export function ttc(participants, seed = 'ttc') {
  const byId = new Map(participants.map((p) => [p.id, p]))
  const active = new Set(participants.map((p) => p.id))
  // 종류 → 아직 그것을 들고 있는 참여자 id들 (사전순)
  const holders = new Map()
  for (const p of participants) {
    if (!holders.has(p.holding)) holders.set(p.holding, [])
    holders.get(p.holding).push(p.id)
  }
  for (const arr of holders.values()) arr.sort()

  const assignment = new Map()
  const cycles = []
  let rounds = 0

  // 시드로 훑는 순서를 고정한다 (결정성). 결과 자체는 순서와 무관하다.
  const order = participants.map((p) => p.id).sort()
  const r = rng(seed)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  /** i가 가리키는 상대 — 아직 남아 있는 종류 중 최선호를 들고 있는 사람. */
  const pointsTo = (id) => {
    const p = byId.get(id)
    for (const type of p.prefs) {
      const hs = holders.get(type)
      if (!hs) continue
      const alive = hs.filter((h) => active.has(h))
      if (alive.length) return alive[0] // 사전순 최소 — 타이브레이크 (1)
    }
    // 여기 도달하면 선호 목록이 자기 보유 종류를 빠뜨린 것이다. 계약 위반.
    throw new Error(`선호 목록이 불완전하다: ${id} (보유 ${p.holding})`)
  }

  while (active.size > 0) {
    rounds++
    let found = false
    for (const start of order) {
      if (!active.has(start)) continue
      // 포인터를 따라가다 재방문이 나오면 그 지점부터가 사이클이다.
      const path = []
      const seen = new Map()
      let cur = start
      while (!seen.has(cur)) {
        seen.set(cur, path.length)
        path.push(cur)
        cur = pointsTo(cur)
        if (!active.has(cur)) break
      }
      if (!seen.has(cur)) continue
      const cycle = path.slice(seen.get(cur))
      // 사이클을 따라 한 바퀴 돌린다: i는 자기가 가리킨 사람의 보유물을 받는다.
      for (let i = 0; i < cycle.length; i++) {
        const from = byId.get(cycle[(i + 1) % cycle.length])
        assignment.set(cycle[i], from.holding)
      }
      for (const id of cycle) {
        active.delete(id)
        const hs = holders.get(byId.get(id).holding)
        const k = hs.indexOf(id)
        if (k >= 0) hs.splice(k, 1)
      }
      cycles.push(cycle)
      found = true
      break
    }
    if (!found) throw new Error('사이클을 찾지 못했다 — 모든 노드의 출차수가 1이므로 불가능하다')
  }

  const rankOf = (p, type) => {
    const i = p.prefs.indexOf(type)
    return i < 0 ? Infinity : i
  }
  const results0 = participants.map((p) => {
    const got = assignment.get(p.id)
    const before = rankOf(p, p.holding)
    const after = rankOf(p, got)
    return {
      id: p.id, before: p.holding, after: got,
      rankBefore: before, rankAfter: after,
      improved: after < before,          // 순위가 앞으로 갔는가
      same: after === before,
      worse: after > before,             // 개별 합리성상 절대 나오면 안 된다 (I5)
      gain: before - after,
    }
  })
  const results = results0

  /**
   * 출력을 정규형으로 만든다.
   *
   * 배정 자체는 사이클 처리 순서와 무관하지만(엄격 선호에서 코어가 유일하다),
   * Object의 **키 삽입 순서**와 사이클 배열의 **시작점·나열 순서**는 처리 순서를
   * 그대로 드러낸다. 실제로 self-check가 "순서 무관"에서 실패했는데, 배정은
   * 완전히 같고 JSON.stringify 결과만 달랐다.
   *
   * 검사만 고쳐 통과시키면 증상만 덮는 것이다. 화면과 서버가 문자 단위로 일치해야
   * 하고(I4), 개봉 결과를 캐시·비교·멱등 판정에 쓸 것이므로 출력이 처리 순서에
   * 흔들리면 안 된다. 출처에서 고정한다.
   *   배정   참여자 id 사전순으로 키를 넣는다
   *   사이클 각 사이클을 사전순 최소 id에서 시작하도록 회전하고, 첫 원소로 정렬한다
   *          (회전은 같은 사이클이다 — A→B→C→A와 B→C→A→B는 같은 그림이다)
   */
  const ids = participants.map((p) => p.id).sort()
  const canonCycle = (c) => {
    let m = 0
    for (let i = 1; i < c.length; i++) if (c[i] < c[m]) m = i
    return [...c.slice(m), ...c.slice(0, m)]
  }
  const canonCycles = cycles.map(canonCycle).sort((a, b) => a[0].localeCompare(b[0]))

  return {
    assignment: Object.fromEntries(ids.map((id) => [id, assignment.get(id)])),
    cycles: canonCycles,                                  // 자기 루프 포함 (알고리즘 원본)
    tradeCycles: canonCycles.filter((c) => c.length >= 2), // 화면에 그리는 것
    results: results.sort((a, b) => a.id.localeCompare(b.id)),
    rounds,
  }
}

// ───────────────── 선호 순위 구성 (SPEC §5.4 / §5.5) ─────────────────

/**
 * 선호 순위를 완성한다. TTC는 완전한 선호 순위를 요구한다 —
 * 자기 보유 종류가 목록에 없으면 개별 합리성이 깨진다.
 *
 *   1순위      지목한 카드
 *   2순위 이하  ChatGPT가 생성 (Phase 4에서 연결. 사용자가 화면에서 수정 가능)
 *   누락분     **시세 내림차순**으로 서버가 채운다
 *
 * 누락분 규칙을 시세 내림차순으로 정한 이유는 성능이 아니라 정직함이다(SPEC §5.5).
 * "같은 등급이면 취향이 가깝다" 같은 검증되지 않은 가정을 규칙에 심는 대신,
 * 화면에서 한 줄로 설명되고 사용자가 고쳐 쓸 수 있는 규칙을 쓴다.
 * 이 규칙이 포함하는 가정("비싼 것을 선호한다")은 SPEC §12에 적혀 있다.
 */
export function completePrefs({ target = null, aiRanked = [], universe }) {
  const price = new Map(universe.map((c) => [c.id, c.price]))
  const seen = new Set()
  const out = []
  const push = (id) => { if (id && price.has(id) && !seen.has(id)) { seen.add(id); out.push(id) } }
  push(target)
  for (const id of aiRanked) push(id)
  // 타이브레이크 (2): 시세 내림차순, 같으면 id 사전순. 완전히 결정적이다.
  for (const c of [...universe].sort((a, b) => b.price - a.price || a.id.localeCompare(b.id))) push(c.id)
  return out
}

// ─────────────────────── 교환 전환율 측정 ───────────────────────

/**
 * "팀에 나올 확률"이 "내가 가질 확률"로 얼마나 전환되는가.
 *
 * 닫힌 형태의 식이 없다(docs/references.md §2.3). 시뮬레이션으로 재고 그 표를
 * 화면에 그대로 띄운다. **전환이 100%가 아니라는 것을 숨기지 않는다.**
 *
 * ## 측정하다 발견한 것 — 교환의 가치는 선호의 이질성에 달려 있다
 *
 * 처음엔 폴백 규칙(시세 내림차순, SPEC §5.5 (a)안)만으로 재고 이런 값이 나왔다.
 *
 *   남이 S를 뽑았는데 교환으로 나에게 온 경우   1 / 174회 = 0.6%
 *   1회당 평균 개선 인원                      1.05명 / 10명
 *   1회당 평균 교환 사이클                     0.51개
 *
 * 버그가 아니라 규칙의 귀결이었다. 선호를 시세 내림차순으로 채우면 **모두의 선호가
 * 지목 카드 이후로 완전히 같아진다.** TTC는 선호가 서로 엇갈릴 때만 사이클을
 * 만든다. 전원이 같은 순서로 원하면 교환할 것이 수학적으로 없다.
 *
 * 그래서 두 극단을 나란히 잰다. 하나만 재면 제품을 실제보다 좋거나 나쁘게 말하게 된다.
 *
 *   동질 선호  전원이 시세 내림차순. ChatGPT 키가 없을 때의 폴백 상태.  → **하한**
 *   이질 선호  각자 자기 취향 순서를 가짐. 지목 + ChatGPT가 만드는 상태. → **상한**
 *
 * 실제 값은 둘 사이에 있고, **어디에 놓이는가가 지목과 ChatGPT가 존재하는 이유다.**
 * 이 표를 화면에 그대로 띄운다.
 */
export const PREF_MODELS = {
  homogeneous: '동질 — 지목 후 전원 시세 내림차순 (AI 없는 폴백)',
  heterogeneous: '이질 — 지목 후 각자 다른 취향 순서 (지목 + ChatGPT)',
}

function buildParticipants({ drawn, k, sCard, nonS, byPriceDesc, model, r }) {
  return drawn.map((d, i) => {
    const target = i < k ? sCard : nonS[Math.floor(r() * nonS.length)].id
    let rest
    if (model === 'homogeneous') {
      rest = byPriceDesc.filter((x) => x !== target)
    } else {
      // 각자 자기 순서를 갖는다. 수집 취향은 사람마다 다르다는 것이 E4의 전제이고,
      // 그것이 애초에 커뮤니티 교환이 존재하는 이유다.
      rest = byPriceDesc.filter((x) => x !== target)
      for (let j = rest.length - 1; j > 0; j--) {
        const m = Math.floor(r() * (j + 1))
        ;[rest[j], rest[m]] = [rest[m], rest[j]]
      }
    }
    return { id: `p${i}`, holding: d.id, prefs: [target, ...rest] }
  })
}

export function conversionRate({ k, trials = 100000, teamSize = 10, box = BOX, model = 'homogeneous' } = {}) {
  const slots = slotsOf(box)
  const universe = [...new Map(slots.map((s) => [s.id, s])).values()]
  const sCard = box.tiers.find((t) => t.tier === 'S').cards[0].id
  const nonS = universe.filter((c) => c.id !== sCard)
  const byPriceDesc = [...universe].sort((a, b) => b.price - a.price || a.id.localeCompare(b.id)).map((c) => c.id)

  let teamGotS = 0, meGotS = 0, meDrewS = 0, sMovedToMe = 0
  let improved = 0, people = 0, cyclesTotal = 0
  const r = rng(`conv|${model}|k=${k}|n=${teamSize}`)

  for (let t = 0; t < trials; t++) {
    const pool = slots.slice()
    const drawn = []
    for (let i = 0; i < teamSize; i++) {
      const idx = Math.floor(r() * pool.length)
      drawn.push(pool[idx])
      pool.splice(idx, 1)
    }
    const parts = buildParticipants({ drawn, k, sCard, nonS, byPriceDesc, model, r })
    const out = ttc(parts, `conv|${model}|${t}`)
    improved += out.results.filter((x) => x.improved).length
    people += teamSize
    cyclesTotal += out.tradeCycles.length

    const holderOfS = drawn.findIndex((d) => d.id === sCard)
    if (holderOfS < 0) continue
    teamGotS++
    if (holderOfS === 0) meDrewS++
    if (out.assignment.p0 === sCard) {
      meGotS++
      if (holderOfS !== 0) sMovedToMe++
    }
  }

  return {
    k, teamSize, trials, model,
    teamGotS, meDrewS, meGotS, sMovedToMe,
    pTeam: teamGotS / trials,
    pMeUnconditional: meGotS / trials,
    pMeGivenTeam: teamGotS ? meGotS / teamGotS : 0,
    pMeDrewGivenTeam: teamGotS ? meDrewS / teamGotS : 0,
    /** 남이 뽑은 S가 교환으로 나에게 온 비율 — 교환이 실제로 한 일 */
    pMovedByTrade: teamGotS - meDrewS ? sMovedToMe / (teamGotS - meDrewS) : 0,
    improvedRate: improved / people,
    cyclesPerRound: cyclesTotal / trials,
  }
}

// ─────────────────────────── self-check ───────────────────────────

/** 무작위 선호 프로파일 하나. */
function randomProfile(n, types, r) {
  return Array.from({ length: n }, (_, i) => {
    const prefs = types.slice()
    for (let j = prefs.length - 1; j > 0; j--) {
      const m = Math.floor(r() * (j + 1))
      ;[prefs[j], prefs[m]] = [prefs[m], prefs[j]]
    }
    return { id: `p${i}`, holding: types[i % types.length], prefs }
  })
}

/** 배정 A가 배정 B를 파레토 지배하는가 (모두 약우위 + 한 명 이상 강우위). */
function dominates(A, B, parts) {
  let strict = false
  for (const p of parts) {
    const a = p.prefs.indexOf(A[p.id]), b = p.prefs.indexOf(B[p.id])
    if (a > b) return false
    if (a < b) strict = true
  }
  return strict
}

function* permutations(arr) {
  if (arr.length <= 1) { yield arr; return }
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)]
    for (const p of permutations(rest)) yield [arr[i], ...p]
  }
}

export function check() {
  const fails = []
  let count = 0
  const ok = (name, cond, detail) => {
    count++
    if (!cond) fails.push(name)
    console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  const r = rng('ttc-selfcheck')
  const PROFILES = 10000

  // ── 개별 합리성 · 사이클 정합성 · 결정성 ──
  let worse = 0, badCycle = 0, notDisjoint = 0, notCover = 0, nondet = 0, orderDep = 0
  let improvedTotal = 0, peopleTotal = 0
  const perN = new Map()
  for (let t = 0; t < PROFILES; t++) {
    const n = 2 + Math.floor(r() * 9) // 2~10명
    const types = Array.from({ length: n }, (_, i) => `c${i}`)
    const parts = randomProfile(n, types, r)
    const out = ttc(parts, `p${t}`)

    // I5 개별 합리성 — 아무도 교환 전보다 나빠지지 않는다
    worse += out.results.filter((x) => x.worse).length

    // 사이클 정합성
    for (const c of out.tradeCycles) if (c.length < 2) badCycle++
    const flat = out.cycles.flat()
    if (new Set(flat).size !== flat.length) notDisjoint++
    if (flat.length !== n) notCover++

    // 결정성 — 같은 입력 2회
    if (JSON.stringify(ttc(parts, `p${t}`).assignment) !== JSON.stringify(out.assignment)) nondet++
    // 순서 무관 — 다른 시드로 훑어도 같은 배정이 나와야 한다
    if (JSON.stringify(ttc(parts, `other|${t}`).assignment) !== JSON.stringify(out.assignment)) orderDep++

    const imp = out.results.filter((x) => x.improved).length
    improvedTotal += imp; peopleTotal += n
    if (!perN.has(n)) perN.set(n, { runs: 0, improved: 0, people: 0 })
    const a = perN.get(n); a.runs++; a.improved += imp; a.people += n
  }
  ok(`I5 개별 합리성 — ${PROFILES.toLocaleString()}개 프로파일에서 나빠진 사람 0명`, worse === 0, `${worse}명`)
  ok('사이클 길이 ≥ 2 (화면용 tradeCycles)', badCycle === 0)
  ok('사이클들이 서로소', notDisjoint === 0)
  ok('사이클 합집합 = 전체 참여자', notCover === 0)
  ok('결정성 — 같은 입력 2회 동일 (I7)', nondet === 0)
  ok('순서 무관 — 사이클 처리 순서가 배정을 바꾸지 않음', orderDep === 0)

  // ── 파레토 효율 — 소규모 전수 ──
  // n ≤ 6에서 가능한 모든 배정(최대 720개)을 만들어 TTC 결과를 지배하는 것이 있는지 본다.
  // n > 6은 n!이 폭발하므로 전수가 불가능하다. 아래 표본 검사로 대체하며 그 한계를 적는다.
  let dominatedExhaustive = 0, exhaustiveRuns = 0
  for (let t = 0; t < 400; t++) {
    const n = 2 + Math.floor(r() * 5) // 2~6명
    const types = Array.from({ length: n }, (_, i) => `c${i}`)
    const parts = randomProfile(n, types, r)
    const out = ttc(parts, `pe${t}`)
    exhaustiveRuns++
    const ids = parts.map((p) => p.id)
    const owned = parts.map((p) => p.holding)
    for (const perm of permutations(owned)) {
      const alt = Object.fromEntries(ids.map((id, i) => [id, perm[i]]))
      if (dominates(alt, out.assignment, parts)) { dominatedExhaustive++; break }
    }
  }
  ok(`파레토 효율 — n≤6 전수 ${exhaustiveRuns}회, 지배하는 배정 0건`, dominatedExhaustive === 0,
    `${dominatedExhaustive}건`)

  // ── 파레토 효율 — 대규모 표본 ──
  // n=7~10에서는 무작위 배정 200개를 뽑아 지배 여부를 본다. **전수가 아니다.**
  let dominatedSample = 0, sampleRuns = 0, sampleAlts = 0
  for (let t = 0; t < 300; t++) {
    const n = 7 + Math.floor(r() * 4)
    const types = Array.from({ length: n }, (_, i) => `c${i}`)
    const parts = randomProfile(n, types, r)
    const out = ttc(parts, `ps${t}`)
    sampleRuns++
    const ids = parts.map((p) => p.id)
    for (let s = 0; s < 200; s++) {
      const perm = parts.map((p) => p.holding)
      for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]] }
      const alt = Object.fromEntries(ids.map((id, i) => [id, perm[i]]))
      sampleAlts++
      if (dominates(alt, out.assignment, parts)) { dominatedSample++; break }
    }
  }
  ok(`파레토 효율 — n=7~10 표본 ${sampleRuns}회 × 200배정, 지배 0건 (전수 아님)`,
    dominatedSample === 0, `${sampleAlts.toLocaleString()}개 배정 검사`)

  // ── n=1 — 팀의 필연성 ──
  let solo = null, soloErr = null
  try {
    solo = ttc([{ id: 'p0', holding: 'c0', prefs: ['c1', 'c0'] }], 'solo')
  } catch (e) { soloErr = e.message }
  ok('n=1일 때 오류 없이 동작하고 교환이 일어나지 않음',
    soloErr === null && solo.tradeCycles.length === 0 && solo.assignment.p0 === 'c0',
    soloErr ? `오류: ${soloErr}` : '자기 루프 1개, 교환 사이클 0개')

  // ── 전략 방지 표본 검사 ──
  // Roth (1982)가 증명한 성질이다. 여기서 하는 것은 **표본 검사이지 전수 증명이 아니다.**
  // 한 프로파일당 무작위 참여자 1명이 무작위 거짓 순위를 신고했을 때, 그의 **진짜**
  // 선호 기준으로 결과가 나아지는지만 본다. 가능한 거짓 신고 전체를 훑지 않으므로
  // 반례가 없다는 것이 증명은 아니다. README에도 같은 문장을 적는다.
  let gained = 0, lieRuns = 0
  for (let t = 0; t < 3000; t++) {
    const n = 3 + Math.floor(r() * 8)
    const types = Array.from({ length: n }, (_, i) => `c${i}`)
    const parts = randomProfile(n, types, r)
    const honest = ttc(parts, `sp${t}`)
    const victim = Math.floor(r() * n)
    const truePrefs = parts[victim].prefs
    const lied = parts.map((p, i) => {
      if (i !== victim) return p
      const q = p.prefs.slice()
      for (let j = q.length - 1; j > 0; j--) { const m = Math.floor(r() * (j + 1)); [q[j], q[m]] = [q[m], q[j]] }
      return { ...p, prefs: q }
    })
    let out
    try { out = ttc(lied, `sp${t}`) } catch { continue }
    lieRuns++
    const gotHonest = truePrefs.indexOf(honest.assignment[parts[victim].id])
    const gotLie = truePrefs.indexOf(out.assignment[parts[victim].id])
    if (gotLie < gotHonest) gained++
  }
  ok(`전략 방지 표본 — 거짓 신고 ${lieRuns.toLocaleString()}건에서 이득 0건 (전수 증명 아님)`,
    gained === 0, `${gained}건`)

  // ── 선호 완성 규칙 ──
  const uni = [{ id: 'a', price: 100 }, { id: 'b', price: 300 }, { id: 'c', price: 200 }]
  const cp = completePrefs({ target: 'a', aiRanked: ['c', 'zzz'], universe: uni })
  ok('선호 완성 — 지목 1순위, AI 순위 반영, 환각 id 무시, 누락분 시세 내림차순',
    JSON.stringify(cp) === JSON.stringify(['a', 'c', 'b']), cp.join(' > '))
  ok('선호 완성 — 전체를 덮는다 (개별 합리성의 전제)',
    completePrefs({ universe: uni }).length === uni.length)

  return { fails, count, perN, improvedTotal, peopleTotal }
}

if (isMain()) {
  console.log('═'.repeat(78))
  console.log('교환 엔진 — Gale의 Top Trading Cycles')
  console.log('  Shapley & Scarf (1974) 6절 p.30에서 기술, Gale에게 귀속')
  console.log('═'.repeat(78))

  console.log('\n─────────────────────────── self-check ───────────────────────────')
  const { fails, count, perN } = check()

  console.log('\n■ 인원별 교환 개선 (무작위 선호 프로파일)')
  console.log('   인원   시행     평균 개선 인원   개선율')
  for (const n of [2, 5, 10]) {
    const a = perN.get(n)
    if (!a) continue
    console.log(`   ${String(n).padStart(3)}명 ${String(a.runs).padStart(6)}회   ${(a.improved / a.runs).toFixed(2).padStart(10)}명   ${(a.improved / a.people * 100).toFixed(1).padStart(6)}%`)
  }

  console.log('\n■ 교환 전환율 — "팀에 나올 확률"이 "내가 가질 확률"이 되는 비율')
  console.log('  조건: 팀 10명 · S등급 재고 1장 · 나를 포함해 k명이 S를 지목 · 각 10만 회')
  console.log('\n  선호 모델을 두 극단으로 나눠 잰다. 하나만 재면 제품을 실제보다')
  console.log('  좋거나 나쁘게 말하게 된다. 실제 값은 둘 사이에 있다.')
  for (const model of ['homogeneous', 'heterogeneous']) {
    console.log(`\n  ── ${PREF_MODELS[model]}`)
    console.log('     k   팀에 S   내가 직접 뽑음   교환으로 내게 옴   교환 후 보유   전체 개선율   사이클/회')
    for (const k of [1, 3, 5, 10]) {
      const c = conversionRate({ k, model })
      console.log(`    ${String(k).padStart(2)}   ${(c.pTeam * 100).toFixed(2).padStart(5)}%   ` +
        `${(c.pMeDrewGivenTeam * 100).toFixed(1).padStart(12)}%   ` +
        `${(c.pMovedByTrade * 100).toFixed(1).padStart(14)}%   ` +
        `${(c.pMeGivenTeam * 100).toFixed(1).padStart(11)}%   ` +
        `${(c.improvedRate * 100).toFixed(1).padStart(10)}%   ` +
        `${c.cyclesPerRound.toFixed(2).padStart(8)}`)
    }
  }
  console.log('\n  ※ 읽는 법 — 이 표가 이 제품에 대해 말하는 것')
  console.log('    1. 전환은 100%가 아니다. S를 뽑은 사람도 S를 원하므로 잘 내놓지 않는다.')
  console.log('    2. 같은 것을 원하는 사람이 많을수록(k↑) 전환 효과가 줄어든다.')
  console.log('    3. **동질 선호에서는 교환이 거의 일어나지 않는다.** 전원이 시세 순으로')
  console.log('       같게 원하면 엇갈릴 것이 없고, TTC는 엇갈림에서만 사이클을 만든다.')
  console.log('       이것이 지목과 ChatGPT가 장식이 아닌 이유다 — 선호를 이질적으로')
  console.log('       만드는 장치가 없으면 교환 자체가 성립하지 않는다.')
  console.log('    4. 교환의 주된 가치는 S가 아니라 **중복 해소**에 있다(E4). 전체 개선율을')
  console.log('       보라. S 전환율은 낮아도 개선되는 사람은 그보다 훨씬 많다.')

  console.log(`\n  ${count}개 항목 · ${fails.length === 0 ? '전부 통과' : `${fails.length}건 실패: ${fails.join(', ')}`}`)
  if (fails.length) process.exitCode = 1
}
