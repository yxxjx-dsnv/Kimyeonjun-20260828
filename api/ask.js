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
      answer: '문서에서 관련 내용을 찾지 못했습니다. "확률", "교환", "왜 올웨이즈", "오리파", "크롤" 같은 주제로 물어봐 주세요.',
      refs: [], source: 'fallback',
    }
  }
  const top = hits.slice(0, 2)
  return {
    answer: top.map((s) => `【${s.doc} · ${s.title}】\n${s.text.slice(0, 700)}`).join('\n\n'),
    refs: top.map((s) => `${s.doc} · ${s.title}`),
    source: 'fallback',
  }
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
      '너는 레브잇(올웨이즈) 직무 과제 "올박스" 저장소의 안내자다. 채용 담당자가 지원자의 의도와 설계 근거를 묻는다.\n' +
      '규칙:\n' +
      '1. 아래 문서 발췌 안에서만 답한다. 발췌에 없는 수치·주장을 지어내지 않는다.\n' +
      '2. 발췌에 없으면 "문서에 없는 내용"이라고 말한다.\n' +
      '3. 한국어로, 3~6문장으로 간결하게. 근거로 쓴 발췌 번호를 문장 끝에 [n]으로 단다.\n' +
      '4. 지원자를 3인칭("지원자는")으로 서술한다.\n\n' +
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
    const answer = j.choices?.[0]?.message?.content?.trim()
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
