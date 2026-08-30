/**
 * POST /api/ask — 프로젝트 전용 Q&A 챗봇. 과제 요건의 ChatGPT API 사용처다.
 *   body { question, history?: [{role,content}] }
 *
 * ## 설계
 * 지식원은 data/docs-digest.json 하나다 — `npm run digest`가 README·SPEC·근거 대장·
 * 과제1 문서·영문 보고서에서 기계적으로 추출한 122개 섹션. 챗봇은 채용 담당자가
 * "왜 이 문제를 골랐나", "확률은 어떻게 정했나", "왜 올웨이즈인가"를 묻는 자리이므로,
 * 답이 문서 밖으로 나가면 안 된다. 프롬프트로 못을 박고, 근거 섹션 제목을 함께 돌려줘
 * 화면이 "어디서 나온 답인지"를 보여준다.
 *
 * ## 검색 → 생성 2단
 * 85KB 전체를 매 요청에 싣지 않는다. 질문과 겹치는 단어로 섹션을 고르고(가벼운
 * 키워드 점수) 상위 8개만 컨텍스트로 준다. 키가 없으면 그 상위 섹션을 그대로
 * 돌려주는 규칙 기반으로 내려앉고, 그 사실을 응답에 표기한다(I13 — 화면이 배지로 띄운다).
 *
 * ## 상태 없음
 * 이 함수는 방을 읽지도 쓰지도 않는다. 배포본에서 라우트마다 함수가 갈라지므로
 * 상태는 전부 /api/room이 소유한다(CLAUDE.md 함정 2).
 */
import digest from '../data/docs-digest.json' with { type: 'json' }

const MODEL = 'gpt-4o-mini'

/**
 * 질문 → 섹션 점수.
 * 한국어는 조사가 붙어 "올웨이즈인가요"가 "올웨이즈"와 문자열로 안 만난다.
 * 토큰의 접두(긴 것부터, 최소 2자)를 차례로 시도해 처음 맞는 길이로 점수를 준다 —
 * 긴 접두 일치일수록 점수가 크다. 형태소 분석기 없이 조사를 흡수하는 최소 장치다.
 */
export function rank(question, sections = digest.sections) {
  const tokens = [...new Set(String(question).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2))]
  if (!tokens.length) return []
  const hitScore = (hay, t) => {
    for (let L = t.length; L >= 2; L--) {
      const n = hay.split(t.slice(0, L)).length - 1
      if (n > 0) return n * L
    }
    return 0
  }
  return sections
    .map((s) => {
      const hay = s.text.toLowerCase(), title = s.title.toLowerCase()
      let score = 0
      for (const t of tokens) {
        score += hitScore(title, t) * 3
        score += hitScore(hay, t)
      }
      return { s, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.s)
}

/** 키 없음 폴백 — 가장 맞는 섹션을 그대로 보여준다. 지어내지 않는다. */
export function fallbackAnswer(question) {
  const hits = rank(question)
  if (!hits.length) {
    return {
      answer: '그 내용은 문서에서 찾지 못했어요. 확률 설계, 교환 방식, 왜 올웨이즈인지, 오리파 실측 같은 주제라면 답할 수 있어요.',
      refs: [], source: 'fallback',
    }
  }
  const top = hits.slice(0, 2)
  return {
    // AI 키 없이 도는 상태다. 요약하면 지어내는 것이 되므로 문서를 그대로 인용하고,
    // 인용이라는 사실을 첫 줄에 밝힌다.
    answer: '지금은 AI 없이 문서를 그대로 찾아드려요. 관련된 대목은 이렇습니다.\n\n'
      + top.map((s) => `— ${s.doc} · ${s.title}\n${s.text.slice(0, 700)}`).join('\n\n'),
    refs: top.map((s) => `${s.doc} · ${s.title}`),
    source: 'fallback',
  }
}

/**
 * 마무리 자평 한 문장을 잘라낸다.
 *
 * gpt-4o-mini는 프롬프트로 금지해도 "…중요한 역할을 해요", "…새로운 경험을 제공하려고
 * 했어요" 같은 문장을 끝에 붙인다. 발췌에 없는 자기 칭찬이고, AI가 쓴 티가 가장 크게 나는
 * 자리다. 프롬프트는 부탁이고 이 함수가 보증이다.
 *
 * 안전장치: 마지막 **한 문장만**, 자르고도 두 문장 이상 남을 때만 자른다.
 * 사실을 담은 문장을 지우면 안 되므로 숫자·수식이 든 문장은 건드리지 않는다.
 */
export const PRAISE = /(중요한 (역할|근거|의미)|중요하다고 (생각|판단)|새로운 경험을|매력적인|독창성|차별화(된|를)|신뢰를 (얻|줄)|가치를 (더|높)|기여(할|한다|합니다|해요)|의미가 (있|큽))/

export function trimPraise(text) {
  const parts = String(text).trim().split(/(?<=[.!?요다])\s+/)
  if (parts.length < 3) return text.trim()
  const last = parts.at(-1)
  // 숫자·수식이 든 문장은 사실이다. 자르지 않는다.
  if (/\d|`/.test(last)) return text.trim()
  if (!PRAISE.test(last)) return text.trim()
  return parts.slice(0, -1).join(' ').trim()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 받는다' })
  const question = String(req.body?.question ?? '').slice(0, 500).trim()
  if (!question) return res.status(400).json({ error: '질문이 비었다' })

  const key = process.env.OPENAI_API_KEY
  const hits = rank(question)

  if (!key || !hits.length) return res.status(200).json(fallbackAnswer(question))

  const context = hits.map((s, i) => `[${i + 1}] ${s.doc} · ${s.title}\n${s.text}`).join('\n\n')
  const history = Array.isArray(req.body?.history)
    ? req.body.history.slice(-6).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content ?? '').slice(0, 800),
      }))
    : []

  const messages = [
    { role: 'system', content:
      '너는 "올박스" 프로젝트를 옆에서 설명해 주는 사람이다. 채용 담당자가 이 과제의 의도와 설계 근거를 묻는다.\n' +
      '\n말투 — 이게 제일 중요하다:\n' +
      '· 한국어 해요체로, 사람이 말하듯 자연스럽게. 3~5문장.\n' +
      '· **설계와 제품을 주어로** 말한다. "지원자는 ~했습니다"로 시작하는 평가 보고서 문체를 쓰지 마라.\n' +
      '  (나쁨: "지원자는 오리파의 문제를 선택했습니다" / 좋음: "오리파는 확률을 공개해도 검증할 수가 없어요")\n' +
      '· **[1] 같은 발췌 번호를 본문에 달지 마라.** 근거 목록은 화면이 답변 아래에 따로 보여준다.\n' +
      '· "따라서", "~하기로 결정했습니다", "~를 모색했습니다" 같은 번역투·보고서투를 쓰지 마라.\n' +
      '· 결론을 먼저 말하고 이유를 붙인다. 서론으로 한 문장을 낭비하지 마라.\n' +
      '· **한 답변 안에서 어미를 섞지 마라.** 전부 "~해요/~예요"로 끝낸다. "~합니다"를 섞지 않는다.\n' +
      '· **마지막 문장을 자평으로 채우지 마라.** 다음으로 끝나는 문장은 통째로 지운다:\n' +
      '  "~중요하다고 생각했어요", "~경험을 제공할 수 있게 되었어요", "~독창성을 강조했어요",\n' +
      '  "~차별화를 꾀했어요", "~더 나은 ~를 만들었어요". 전부 발췌에 없는 자기 칭찬이다.\n' +
      '  사실을 다 말했으면 거기서 끝낸다. 마무리 문장은 필요 없다.\n' +
      '· 발췌에 없는 어휘를 새로 만들지 마라 — 특히 "신규성", "독창성", "차별화", "매력적인" 같은\n' +
      '  마케팅 단어는 문서에 없다. 문서가 쓴 표현을 그대로 살려 쓴다.\n' +
      '\n내용 규칙:\n' +
      '· 아래 문서 발췌 안에서만 답한다. 발췌에 없는 수치나 주장을 지어내지 않는다.\n' +
      '· 발췌에 없으면 "그건 문서에 없어요"라고 솔직하게 말하고, 대신 답할 수 있는 것을 한 줄로 알려준다.\n' +
      '· 수치는 발췌에 적힌 그대로 쓴다. 반올림하거나 다시 계산하지 마라.\n\n' +
      '── 문서 발췌 ──\n' + context },
    ...history,
    { role: 'user', content: question },
  ]

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.3, max_tokens: 500 }),
    })
    if (!r.ok) return res.status(200).json({ ...fallbackAnswer(question), note: `openai ${r.status}` })
    const j = await r.json()
    const answer = trimPraise(j.choices?.[0]?.message?.content ?? '')
    if (!answer) return res.status(200).json(fallbackAnswer(question))
    return res.status(200).json({
      answer,
      refs: hits.map((s, i) => `[${i + 1}] ${s.doc} · ${s.title}`),
      source: 'openai', model: MODEL,
    })
  } catch {
    return res.status(200).json({ ...fallbackAnswer(question), note: 'network' })
  }
}
