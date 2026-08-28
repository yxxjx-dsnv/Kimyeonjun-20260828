/**
 * POST /api/curate — 취향 대화로 박스 구성하기. ChatGPT는 이 파일에만 있다.
 *
 * 확률형 구매의 가장 큰 약점은 "안 쓸 물건이 오는 것"이다. 혜택 소비자는
 * 낭비를 못 견디므로, 무작위를 쓰되 취향 밖으로는 나가지 않게 해야 한다.
 * 그래서 대화로 취향 축을 잡고 그 안에서만 무작위를 돌린다.
 *
 * LLM이 돌려주는 것은 pickedIds(문자열 배열)와 문장뿐이다.
 * LLM이 정하지 못하는 것: 티어 배정 · 확률 · 가격 · 하한 충족 여부 · 추첨 결과.
 * 전부 서버가 _pool.js 가격으로 다시 계산한다.
 *
 * 실행:  node api/curate.js   (네트워크 없이 순수 함수만 자체 검증)
 */
import {
  getBox, tiersOf, collapseUp, tierMeanRetail, oddsOf, byId,
  TIERS, BANDS, MIN_TIER_ITEMS, POOL,
} from './_draw.js'

const MODEL = 'gpt-4o-mini'
const MAX_MESSAGES = 12
const MAX_CHARS = 400
const PROMPT_PER_TIER = 40 // 프롬프트에 넣을 티어별 후보 상한 (토큰 관리)
export const MIN_BOX_ITEMS = 12

const SYSTEM = `너는 커머스 앱 '올웨이즈'의 올박스 담당자다. 45~65세 여성 고객과 짧게 대화하며
어떤 상품이 들어간 상자를 원하는지 파악한다. 규칙:
1. reply는 2문장 이내, 존댓말, 60자를 넘기지 않는다.
2. pickedIds에는 **반드시 20~28개**를 담는다. 비워두면 안 된다. 되물을 때도
   지금 파악한 범위에서 일단 채운다. 후보 목록에 있는 id만 쓰고 지어내지 않는다.
3. **각 등급에서 최소 4개씩** 고른다. C(가장 싼 등급)를 반드시 4개 이상 채운다.
   C가 비면 상자가 성립하지 않아 네 구성은 통째로 버려진다.
4. options는 **사람이 읽는 한국어 보기 문구**다(예: "국물 요리 위주"). 상품 id를
   여기에 넣지 않는다. 되묻지 않을 때는 빈 배열로 둔다.
5. axis에는 파악한 취향을 12자 이내 한 줄로 적는다. 예: "주방 살림 위주".
6. 상품 가격이나 확률을 문장에 쓰지 않는다. 그건 화면이 보여준다.
반드시 JSON만 출력: {"reply":"","question":null,"options":[],"axis":"","pickedIds":[]}`

/* ── 프롬프트용 후보 블록 ─────────────────────────────────── */
export function candidateBlock(box) {
  const T = tiersOf(box)
  const lines = []
  for (const t of TIERS) {
    const xs = [...T[t]].sort((a, b) => a.price - b.price)
    const step = Math.max(1, Math.ceil(xs.length / PROMPT_PER_TIER))
    for (let i = 0; i < xs.length; i += step) {
      const it = xs[i]
      lines.push(`${it.id}|${t}|${it.name.slice(0, 28)}|${it.price}`)
    }
  }
  return lines.join('\n')
}

/* ── 가드 ─────────────────────────────────────────────────── */

/** ① id 조인 — 풀에 없는 id는 조용히 사라진다. 환각 상품이 화면에 못 뜬다. */
export const joinIds = (ids) =>
  (Array.isArray(ids) ? ids : [])
    .map((i) => byId.get(String(i).trim()))
    .filter(Boolean)

/**
 * ② options 오염 회수 — 모델이 상품 id를 '보기'로 착각해 options에 넣는 일이
 * 실제로 있었다(첫 실측에서 pickedIds가 0개였던 원인). 프롬프트를 고쳤지만
 * 같은 실수를 코드로도 막는다. 풀에 있는 id는 회수하고 options에서는 지운다.
 */
export function rescueIds(out) {
  const opts = Array.isArray(out.options) ? out.options.map(String) : []
  const strays = opts.filter((o) => byId.has(o.trim()))
  return {
    ids: [...(Array.isArray(out.pickedIds) ? out.pickedIds : []), ...strays],
    options: opts.filter((o) => !byId.has(o.trim())),
    rescued: strays.length,
  }
}

/** 규칙 기반 폴백 — 티어별로 골고루 채운다. */
export function fallbackPick(box, n = 24) {
  const T = tiersOf(box)
  const per = Math.ceil(n / TIERS.length)
  return TIERS.flatMap((t) => {
    const xs = [...T[t]].sort((a, b) => a.price - b.price)
    const step = Math.max(1, Math.floor(xs.length / per))
    return xs.filter((_, i) => i % step === 0).slice(0, per)
  })
}

/**
 * ③ 구성 검증 — 실패하면 폴백으로 되돌린다(fail closed).
 *
 * 가격 하한만 보면 부족하다는 것을 실측에서 배웠다. AI가 "주방 살림 위주로"에
 * 비싼 가전만 20개 골랐더니 collapseUp이 전부 S로 합쳐 기저 등급이 비었고,
 * 2,000원 내고 20만원짜리를 100% 받는 상자가 만들어졌다. 하한은 지켜졌지만
 * 단위경제가 무너진 것이다. 그래서 기저 등급 존재를 불변식으로 올렸다.
 */
export function assertFloor(box, tiers) {
  for (const t of TIERS)
    for (const it of tiers[t])
      if (it.price < box.entry)
        throw new Error(`하한 위반: ${it.name} ${it.price}원 < 참여비 ${box.entry}원`)
  if (tiers.C.length < MIN_TIER_ITEMS)
    throw new Error(`기저 등급이 ${tiers.C.length}개 — 상자가 성립하지 않습니다.`)
  if (TIERS.filter((t) => tiers[t].length).length < 2)
    throw new Error('등급이 하나뿐이라 확률이 의미를 잃습니다.')
  return true
}

/**
 * 큐레이션 결과를 박스 구성으로 바꾼다.
 * 후보가 모자라면 폴백으로 대체하고 **문장도 함께 다시 쓴다**.
 * 화면에 없는 것을 문장이 주장하면 안 되기 때문이다.
 */
export const CURATED_TIERS = ['C', 'B'] // 취향이 정하는 등급
export const FIXED_TIERS = ['S', 'A'] // 상자가 정하는 등급

export function composeBox(box, picked, reply) {
  const base = tiersOf(box) // 전체 풀 기준
  /**
   * 취향은 **기본 등급(C·B)만** 정하고, 최고 등급(S·A)은 상자가 고정한다.
   *
   * 처음에는 전 등급을 AI에게 맡겼는데, "손주 줄 것도 넣어서"처럼 상위 상품과
   * 무관한 취향을 말하면 S 티어가 통째로 비어 최고 등급 확률이 0%가 됐다.
   * 상자의 간판이 대화 한 줄로 사라지는 건 제품이 아니다. 실제 블라인드박스도
   * 특상은 고정이고 나머지가 바뀐다. 개인화는 90% 이상 실제로 받게 되는
   * 기본 등급에 거는 편이 효과도 크다.
   */
  const build = (items) => {
    const cur = tiersOf(box, items.map((i) => i.id))
    return collapseUp({
      S: base.S, A: base.A,
      B: cur.B.length >= MIN_TIER_ITEMS ? cur.B : base.B,
      C: cur.C,
    })
  }
  const fallback = (why) => {
    const items = fallbackPick(box)
    const tiers = build(items)
    assertFloor(box, tiers) // 폴백마저 깨지면 그건 데이터 문제다. 숨기지 않는다.
    return {
      tiers, items, usedFallback: true, why,
      reply: '말씀하신 쪽으로는 상자를 짤 수 없어서, 이 박스의 기본 구성으로 담았어요.',
    }
  }

  if (picked.length < MIN_BOX_ITEMS) return fallback(`후보 ${picked.length}개`)

  const tiers = build(picked)
  try {
    assertFloor(box, tiers)
  } catch (e) {
    // 구성이 성립하지 않으면 목록과 문장을 함께 되돌린다.
    // 화면에 없는 것을 문장이 주장하면 안 된다.
    return fallback(e.message)
  }
  return { tiers, items: picked, reply, usedFallback: false, why: null }
}

/**
 * 화면이 그대로 렌더할 형태로 직렬화.
 * 취향을 좁히면 티어 평균 시가가 바뀌므로 확률도 바뀐다. 곡선이 base 확률을
 * 그리고 있으면 둘이 어긋나므로, 1~10명 확률표를 통째로 다시 계산해서 준다.
 */
export function serializeTiers(box, tiers, teamSize) {
  const m = tierMeanRetail(tiers)
  const odds = oddsOf(box, teamSize, teamSize, tiers)
  const oddsByTeam = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [i + 1, oddsOf(box, i + 1, i + 1, tiers)])
  )
  const evByTeam = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [
      i + 1,
      +(TIERS.reduce((s, t) => s + oddsByTeam[i + 1][t] * m[t], 0) / box.entry).toFixed(3),
    ])
  )
  return {
    odds,
    oddsByTeam,
    evByTeam,
    tiers: TIERS.map((t) => ({
      tier: t,
      band: BANDS[t].map((x) => Math.round(box.entry * x)),
      count: tiers[t].length,
      meanRetail: Math.round(m[t]),
      samples: [...tiers[t]]
        .sort((a, b) => (t === 'S' || t === 'A' ? b.price - a.price : a.price - b.price))
        .slice(0, 6),
    })),
  }
}

/* ── OpenAI ───────────────────────────────────────────────── */
async function askOpenAI(apiKey, messages) {
  const call = () =>
    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        // 직전 과제에서 220으로 조였다가 JSON이 잘려 502가 났다. 넉넉히 준다.
        max_tokens: 700,
        messages,
      }),
      signal: AbortSignal.timeout(20000),
    })

  let r = await call()
  if (r.status === 429) {
    await new Promise((s) => setTimeout(s, 2500))
    r = await call()
  }
  if (!r.ok) throw new Error(`OpenAI ${r.status}`)
  const j = await r.json()
  const raw = j.choices?.[0]?.message?.content ?? ''
  try {
    return JSON.parse(raw)
  } catch {
    // 잘린 JSON에서도 id는 건져낸다. 502를 내는 것보다 낫다.
    const ids = raw.match(/"([a-z]\d{4,})"/g)?.map((s) => s.replace(/"/g, '')) || []
    return { reply: '', question: null, options: [], axis: '', pickedIds: ids, partial: true }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용합니다.' })

  const apiKey = process.env.OPENAI_API_KEY
  const { messages, boxId, teamSize } = req.body || {}
  const box = getBox(boxId)
  if (!box) return res.status(400).json({ error: '없는 박스입니다.' })
  const n = Math.min(10, Math.max(1, Math.floor(Number(teamSize) || 1)))

  const history = (Array.isArray(messages) ? messages : [])
    .slice(-MAX_MESSAGES)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
  if (!history.length) return res.status(400).json({ error: '대화 내용이 필요합니다.' })

  try {
    let out = { reply: '', question: null, options: [], axis: '', pickedIds: [] }

    if (apiKey) {
      out = await askOpenAI(apiKey, [
        { role: 'system', content: SYSTEM },
        {
          role: 'system',
          content: `[${box.name} 후보 — id|등급|이름|가격]\n${candidateBlock(box)}`,
        },
        // 되묻기는 첫 턴에만. 두 번째부터는 코드가 막는다.
        ...(history.filter((m) => m.role === 'user').length >= 2
          ? [{ role: 'system', content: '이번 턴에는 되묻지 말고 바로 구성해라. question은 null.' }]
          : []),
        ...history,
      ])
    } else {
      // 키가 없어도 화면이 죽지 않는다. 규칙 기반으로 내려앉고 그 사실을 밝힌다.
      out = {
        reply: 'AI 키가 없어 기본 구성으로 담았어요.',
        question: null, options: [], axis: '기본 구성', pickedIds: [],
      }
    }

    const salvaged = rescueIds(out)
    const picked = joinIds(salvaged.ids)
    const composed = composeBox(box, picked, String(out.reply || '').slice(0, 120))

    // 되묻기 정책을 프롬프트가 아니라 코드로 강제한다.
    const userTurns = history.filter((m) => m.role === 'user').length
    const question = userTurns >= 2 || composed.usedFallback ? null : (out.question || null)

    return res.status(200).json({
      reply: composed.reply || '이렇게 담아봤어요.',
      question,
      options: question ? salvaged.options.slice(0, 4).map((s) => String(s).slice(0, 14)) : [],
      rescuedIds: salvaged.rescued,
      axis: String(out.axis || '').slice(0, 16),
      // 개봉 때 이 구성 그대로 뽑도록 id를 돌려준다. 서버는 받은 id를 다시 조인한다.
      pickedIds: composed.items.map((i) => i.id),
      pickedCount: composed.items.length,
      llmPicked: picked.length,
      usedFallback: composed.usedFallback,
      fallbackReason: composed.why,
      aiEnabled: Boolean(apiKey),
      ...serializeTiers(box, composed.tiers, n),
    })
  } catch (e) {
    return res.status(500).json({ error: `구성 실패: ${e.message}` })
  }
}

/* ── 자체 검증 (네트워크 없이) ─────────────────────────────── */
if (process.argv[1]?.endsWith('curate.js')) {
  const { strict: assert } = await import('node:assert')
  const box = getBox('charizard')
  let n = 0
  const ok = (l, c, e = '') => { n++; if (!c) throw new Error(`✗ ${l}${e ? ' — ' + e : ''}`) }

  // ① 환각 id 차단
  const real = POOL.items.slice(0, 5).map((i) => i.id)
  const mixed = joinIds([...real, 'd99999999', '없는거', null, 42])
  ok('없는 id는 조용히 탈락', mixed.length === 5, `${mixed.length}건`)

  // ② 후보가 모자라면 폴백 + 문장 재작성
  const thin = composeBox(box, joinIds(real.slice(0, 2)), 'AI가 쓴 원래 문장')
  ok('폴백 발동', thin.usedFallback)
  ok('폴백 시 문장도 다시 쓴다', thin.reply !== 'AI가 쓴 원래 문장', thin.reply)
  ok('폴백 구성도 하한 유지', TIERS.every((t) => thin.tiers[t].every((i) => i.price >= box.entry)))

  // ③ 정상 큐레이션은 문장을 건드리지 않는다
  const wide = composeBox(box, fallbackPick(box, 24), '주방 살림 위주로 담았어요.')
  ok('정상일 땐 문장 유지', wide.reply === '주방 살림 위주로 담았어요.')
  ok('정상 구성도 하한 유지', assertFloor(box, wide.tiers))

  // ④ 하한을 깨는 구성은 막는다
  const cheap = POOL.items.filter((i) => i.price < box.entry)
  ok('참여비보다 싼 상품이 풀에 존재', cheap.length > 0, `${cheap.length}건`)
  assert.throws(() => assertFloor(box, { S: [], A: [], B: [], C: cheap.slice(0, 5) }))
  ok('하한 위반은 throw', true)

  // ⑤ 큐레이션 후에도 확률의 성질이 유지된다
  const s = serializeTiers(box, wide.tiers, 7)
  ok('확률 합 1', Math.abs(TIERS.reduce((a, t) => a + s.odds[t], 0) - 1) < 1e-9)
  ok('확률 음수 없음', TIERS.every((t) => s.odds[t] >= 0))

  // ⑥ options에 섞여 온 id 회수 (실측에서 나온 결함)
  const strayIds = POOL.items.slice(10, 14).map((i) => i.id)
  const r1 = rescueIds({ pickedIds: [], options: [...strayIds, '국물 요리 위주'] })
  ok('options의 상품 id를 회수', r1.ids.length === 4, `${r1.ids.length}건`)
  ok('회수 후 options에는 문구만', r1.options.length === 1 && r1.options[0] === '국물 요리 위주')
  ok('회수 건수 보고', r1.rescued === 4)
  const r2 = rescueIds({ pickedIds: ['x'], options: ['주방 위주', '먹거리 위주'] })
  ok('정상 options는 건드리지 않는다', r2.options.length === 2 && r2.rescued === 0)

  // ⑦ 기저 등급을 비우는 구성은 폴백으로 되돌린다 (실측에서 나온 결함)
  const pricey = POOL.items.filter((i) => i.price >= box.entry * 100).slice(0, 20)
  ok('비싼 것만 20개 골라도 후보 수는 충분', pricey.length >= MIN_BOX_ITEMS)
  const collapsed = composeBox(box, pricey, 'AI 문장')
  ok('기저 등급이 비면 폴백', collapsed.usedFallback, collapsed.why || '')
  ok('폴백 시 문장도 교체', collapsed.reply !== 'AI 문장')
  ok('폴백 결과는 기저 등급을 갖는다', collapsed.tiers.C.length >= MIN_TIER_ITEMS)
  assert.throws(() => assertFloor(box, { S: pricey, A: [], B: [], C: [] }), /기저 등급/)
  ok('기저 등급 없음은 throw', true)

  // ⑧ 빈 티어를 뽑으면 아래로 내려간다 (위로 올리면 단위경제가 무너진다)
  {
    const { drawOne } = await import('./_draw.js')
    const holed = { S: pricey.slice(0, 3), A: [], B: [], C: fallbackPick(box).filter((i) => i.price < box.entry * 1.5) }
    const P = { S: 0, A: 1, B: 0, C: 0 } // A를 100%로 강제. A는 비어 있다.
    const got = drawOne(box, P, holed, 'seed-hole')
    ok('빈 A를 뽑으면 아래(B/C)로 내려간다', got.tier !== 'S', `실제 ${got.tier}`)
  }

  // ⑨ 프롬프트 블록
  const blk = candidateBlock(box)
  ok('후보 블록 생성', blk.split('\n').length >= MIN_BOX_ITEMS)
  ok('후보 블록에 가격 포함', /\|\d+$/m.test(blk))

  console.log(`✓ curate 자체 검증 ${n}건 통과 — 후보 블록 ${blk.split('\n').length}행`)
}
