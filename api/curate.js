/**
 * POST /api/curate — ChatGPT.  과제 요건: 대화형 AI는 반드시 ChatGPT API.
 *   body { action: 'prefs', roomId, memberId, taste }   선호 순위 생성
 *   body { action: 'ask', question, cardId? }           카드 용어·시세 설명
 *
 * OpenAI를 raw fetch로 부른다. SDK를 설치하지 않으므로 npm 패키지가 0개 늘어난다.
 * 모델 gpt-4o-mini, JSON 모드. 키는 .env.local의 OPENAI_API_KEY.
 * 키가 없으면 규칙 기반으로 내려앉고 **그 사실을 응답에 표기한다**(화면이 배지로 띄운다).
 *
 * ## AI의 자리 (I9) — v1에서 무엇이 잘못됐나
 * v1은 ChatGPT가 박스 구성에 관여했고, 모델이 상품 id를 되묻기 보기(options) 필드에
 * 넣는 사고로 박스가 무너졌다. v2에서 AI의 자리를 바꿨다.
 *   통은 서버가 확정한 뒤 고정된다. AI는 손대지 않는다.
 *   AI가 반환하는 것은 **선호 순위와 설명 문장뿐**이다.
 *   반환된 id가 통 안에 없으면 버린다(환각 차단).
 *   누락된 카드는 시세 내림차순으로 서버가 채운다.
 *   사용자가 화면에서 순위를 직접 고칠 수 있다. AI는 초안일 뿐이다.
 * 프롬프트는 부탁이고 가드가 보증이다. 아래 rescue/필터가 가드다.
 *
 * ## 이 함수는 방을 건드리지 않는다
 * 처음에는 여기서 방에 선호 순위를 직접 저장했다. **배포본에서 그 저장이 사라졌다** —
 * Vercel은 라우트마다 별개의 서버리스 함수를 띄우고, KV 없이 쓰는 메모리 폴백은
 * 함수 안에서만 공유되기 때문이다. curate가 저장한 것을 room은 볼 수 없었다.
 * 이제 여기서는 순위를 **계산해서 돌려주기만** 하고, 저장은 클라이언트가
 * /api/room의 setPrefs로 넘긴다. 서버가 그 id를 통 안의 것으로 다시 검증한다.
 * 부수효과가 없어져서 테스트하기도 쉬워졌다.
 *
 * ## AI가 장식이 아닌 이유 (Phase 3 측정)
 * 선호가 동질이면 TTC가 사이클을 만들지 못해 교환이 거의 일어나지 않는다
 * (개선율 10.5% vs 68.4%). 선호를 이질적으로 만드는 것이 이 기능의 실제 일이다.
 */
import { slotsOf } from './_box.js'
import { completePrefs } from './_trade.js'

const UNIVERSE = [...new Map(slotsOf().map((s) => [s.id, s])).values()]
const VALID = new Set(UNIVERSE.map((c) => c.id))
const MODEL = 'gpt-4o-mini'

const catalog = () =>
  UNIVERSE.map((c) => ({ id: c.id, tier: c.tier, price: c.price, name: c.name.slice(0, 60) }))

/**
 * 모델이 엉뚱한 필드에 카드 id를 넣었을 때 회수한다.
 * v1에서 실제로 겪은 사고다 — 프롬프트로 못을 박아도 모델은 가끔 어긴다.
 * 응답 전체를 훑어 통 안의 id를 등장 순서대로 건진다.
 */
export function rescueIds(obj) {
  const found = []
  const walk = (v) => {
    if (typeof v === 'string') { if (VALID.has(v)) found.push(v); return }
    if (Array.isArray(v)) { v.forEach(walk); return }
    if (v && typeof v === 'object') { Object.values(v).forEach(walk) }
  }
  walk(obj)
  return [...new Set(found)]
}

/** 통 안의 id만 남긴다. 환각 id 차단 (I9). */
export const keepValid = (ids) => (Array.isArray(ids) ? ids.filter((x) => VALID.has(x)) : [])

async function callOpenAI(messages, key) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, messages, temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`)
  const j = await res.json()
  return JSON.parse(j.choices[0].message.content)
}

const PREF_SYSTEM = `너는 포켓몬 카드 수집을 돕는다. 사용자의 취향 설명을 읽고 통 안의 카드 순위를 매긴다.

반드시 이 JSON 형식으로만 답한다:
{"ranking": ["카드id", "카드id", ...], "why": "한 문장 설명"}

규칙:
- ranking에는 **주어진 목록의 id만** 넣는다. 새 id를 지어내지 않는다.
- ranking 외의 필드에 카드 id를 넣지 않는다. why는 사람이 읽는 문장이지 id 목록이 아니다.
- 상위 12개만 넣으면 된다. 나머지는 서버가 채운다.
- 비싼 순으로 나열하지 마라. 사용자가 말한 취향을 기준으로 정렬한다.`

const ASK_SYSTEM = `너는 포켓몬 카드를 처음 접한 30~40대 보호자에게 설명한다.
상대는 시세도 은어(SAR, UR, PSA, 오리파 등)도 모른다. 쉬운 말로, 과장 없이 답한다.

반드시 이 JSON 형식으로만 답한다:
{"answer": "설명 문장", "terms": [{"term":"용어","means":"뜻"}]}

규칙:
- 주어진 카드 데이터(이름·시세·등급)에 근거해서 답한다. 시세를 지어내지 않는다.
- 카드 id를 answer나 terms에 넣지 않는다.
- 투자를 권유하지 않는다. "오른다"고 단정하지 않는다.`

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 받는다' })
  const { action, roomId, memberId, taste, question, cardId, target } = req.body || {}
  const key = process.env.OPENAI_API_KEY

  if (action === 'prefs') {
    let ranking = [], why = '', source = 'rule'
    if (key) {
      try {
        const out = await callOpenAI([
          { role: 'system', content: PREF_SYSTEM },
          { role: 'user', content: JSON.stringify({ 취향: taste || '특별한 취향 없음', 지목: target ?? null, 통: catalog() }) },
        ], key)
        ranking = keepValid(out.ranking)
        // 가드: 모델이 ranking을 비우고 다른 필드에 id를 흘렸을 때 회수한다 (v1 사고)
        if (ranking.length === 0) {
          const rescued = rescueIds(out)
          if (rescued.length) { ranking = rescued; why = (out.why || '') + ' (순위 필드가 비어 있어 응답 전체에서 회수했다)' }
        }
        if (!why) why = typeof out.why === 'string' ? out.why : ''
        source = ranking.length ? 'openai' : 'rule'
      } catch (e) {
        source = 'rule'
        why = `AI 호출 실패로 시세 순으로 채웠다 (${e.message})`
      }
    } else {
      why = 'OPENAI_API_KEY가 없어 시세 내림차순으로 채웠다. 이 상태에서는 전원의 선호가 같아져 교환이 거의 일어나지 않는다.'
    }

    // 누락분은 언제나 서버가 채운다. 목록이 불완전하면 개별 합리성이 깨진다.
    const prefs = completePrefs({ target: target ?? null, aiRanked: ranking, universe: UNIVERSE })

    return res.status(200).json({
      source, why,
      aiRanking: ranking,
      prefs,
      names: Object.fromEntries(prefs.slice(0, 20).map((id) => {
        const c = UNIVERSE.find((x) => x.id === id)
        return [id, { name: c.name, price: c.price, tier: c.tier }]
      })),
      note: source === 'openai'
        ? `ChatGPT(${MODEL})가 상위 ${ranking.length}개를 정하고 나머지는 서버가 시세 내림차순으로 채웠다. 순위는 직접 고칠 수 있다.`
        : '규칙 기반(시세 내림차순)으로 채웠다. AI 응답이 아니다.',
    })
  }

  if (action === 'ask') {
    const card = cardId ? UNIVERSE.find((c) => c.id === cardId) : null
    if (!key) {
      return res.status(200).json({
        source: 'rule',
        answer: card
          ? `${card.name}은(는) 이 통에서 ${card.tier}등급이고 크롤 시세가 ${card.price.toLocaleString('ko-KR')}원이다. 자세한 설명은 AI 키가 없어 제공할 수 없다.`
          : 'OPENAI_API_KEY가 없어 규칙 기반으로만 답한다. 통 안의 카드를 고르면 등급과 시세를 알려준다.',
        terms: [],
        note: 'AI 응답이 아니다. 규칙 기반 폴백이다.',
      })
    }
    try {
      const out = await callOpenAI([
        { role: 'system', content: ASK_SYSTEM },
        { role: 'user', content: JSON.stringify({ 질문: question, 카드: card ?? null, 통_요약: catalog().slice(0, 40) }) },
      ], key)
      return res.status(200).json({
        source: 'openai', model: MODEL,
        answer: typeof out.answer === 'string' ? out.answer : '',
        terms: Array.isArray(out.terms) ? out.terms.slice(0, 6) : [],
        note: `ChatGPT(${MODEL})가 크롤 데이터를 근거로 답했다.`,
      })
    } catch (e) {
      return res.status(200).json({ source: 'rule', answer: `AI 호출에 실패했다 (${e.message}).`, terms: [], note: 'AI 응답이 아니다.' })
    }
  }

  return res.status(400).json({ error: `모르는 action: ${action}` })
}
