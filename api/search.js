/**
 * GET /api/search?q=…  — 크롤 875건에서 상품을 찾는다.
 *
 * 검색창이 눌리지 않는 장식이면 "이건 스크린샷이구나"가 즉시 들통난다.
 * 그래서 실제로 동작하게 한다. 지어낸 상품은 하나도 없고 전부 크롤 실측이다.
 *
 * 추천 검색어도 **데이터에서 유도한다.** 손으로 고르면 그 순간 "우리가 보여주고
 * 싶은 것"이 되고, 크롤이 바뀌어도 화면이 안 바뀐다.
 */
import pool from './_pool.js'

/** 상품명에서 흔한 낱말을 세어 추천 검색어를 만든다. 모듈 로드 시 1회. */
const STOP = new Set(['포켓몬', '포켓몬스터', '카드', '해외', '게임', '세트', '한글판',
  '일본판', '정품', '상품', '무료배송', '신규', '개입', '이상', '미개봉'])

export const SUGGEST = (() => {
  const cnt = new Map()
  for (const it of pool.items) {
    for (const raw of it.name.replace(/[[\]()<>{}·,/]/g, ' ').split(/\s+/)) {
      const w = raw.replace(/[^가-힣A-Za-z0-9]/g, '')
      if (w.length < 2 || w.length > 8) continue
      if (STOP.has(w) || /^\d/.test(w)) continue
      cnt.set(w, (cnt.get(w) ?? 0) + 1)
    }
  }
  return [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w]) => w)
})()

const slim = (x) => ({
  id: x.id, name: x.name, price: x.price, image: x.image,
  url: x.url, group: x.group, seller: x.seller ?? null,
})

export function searchPool(q, limit = 24) {
  const s = String(q ?? '').trim().toLowerCase()
  if (!s) return []
  const terms = s.split(/\s+/).filter(Boolean)
  return pool.items
    .filter((x) => { const n = x.name.toLowerCase(); return terms.every((t) => n.includes(t)) })
    .sort((a, b) => a.price - b.price)
    .slice(0, limit)
    .map(slim)
}

/**
 * 서술형 질의 → 구조화된 필터.
 *   "5만원 이하 피카츄"  →  { terms: ['피카츄'], maxPrice: 50000 }
 *
 * AI는 **질의를 해석하는 자리에만** 둔다. 상품을 고르거나 만들지 않는다 —
 * 필터는 서버가 크롤 데이터에 적용하고, 결과는 전부 실측 상품이다.
 * 모델이 엉뚱한 값을 줘도 아래 가드가 걸러낸다.
 */
const MODEL = 'gpt-4o-mini'

/** 키 없이도 동작하는 규칙 기반 해석. 숫자+단위와 비교어만 본다. */
export function parseRule(q) {
  const text = String(q ?? '')
  let maxPrice = null, minPrice = null
  const num = (m) => {
    let v = Number(m[1].replace(/,/g, ''))
    if (/만/.test(m[2] ?? '')) v *= 10000
    return v
  }
  const under = text.match(/([\d,]+)\s*(만원|원|만)?\s*(?:이하|미만|아래|밑)/)
  const over = text.match(/([\d,]+)\s*(만원|원|만)?\s*(?:이상|초과|넘는|위)/)
  if (under) maxPrice = num(under)
  if (over) minPrice = num(over)
  // 가격 표현과 조사·불용어를 걷어낸 나머지가 검색어다
  const terms = text
    .replace(/[\d,]+\s*(만원|원|만)?\s*(이하|미만|아래|밑|이상|초과|넘는|위)/g, ' ')
    .replace(/(짜리|정도|쯤|같은|보다|중에|중에서|좀|저렴한|싼|비싼|찾아|찾아줘|보여줘|알려줘|주세요|해줘|있나요|있어|카드를|상품을|제품을)/g, ' ')
    .split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 2)
  return { terms, maxPrice, minPrice, source: 'rule' }
}

/** 해석 결과를 실제 필터로. 통 밖의 값은 여기서 전부 무해해진다. */
export function applyFilter({ terms = [], maxPrice = null, minPrice = null }, limit = 24) {
  const ts = terms.map((t) => String(t).toLowerCase()).filter(Boolean).slice(0, 5)
  return pool.items
    .filter((x) => {
      if (maxPrice != null && x.price > maxPrice) return false
      if (minPrice != null && x.price < minPrice) return false
      if (!ts.length) return true
      const n = x.name.toLowerCase()
      return ts.some((t) => n.includes(t))      // 서술형은 부분 일치가 자연스럽다
    })
    .sort((a, b) => a.price - b.price)
    .slice(0, limit)
    .map(slim)
}

/** ChatGPT로 서술형을 해석한다. 실패하면 규칙 기반으로 내려앉는다. */
export async function interpret(q) {
  const key = process.env.OPENAI_API_KEY
  if (!key) return parseRule(q)
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL, temperature: 0, response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content:
            '한국어 상품 검색 질의를 JSON으로 바꾼다. 포켓몬 트레이딩 카드 쇼핑몰이다.\n' +
            '{"terms": string[], "maxPrice": number|null, "minPrice": number|null}\n' +
            '규칙:\n' +
            '· terms는 상품명에 실제로 들어갈 낱말만 (예: 피카츄, 리자몽, PSA, 확장팩, 슬리브).\n' +
            '· "저렴한", "좋은", "인기" 같은 형용사는 terms에 넣지 않는다.\n' +
            '· 가격은 원 단위 숫자로. "5만원 이하" → maxPrice 50000.\n' +
            '· 가격 언급이 없으면 null.\n' +
            '· 설명하지 말고 JSON만 출력한다.' },
          { role: 'user', content: String(q).slice(0, 200) },
        ],
      }),
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) return parseRule(q)
    const j = await r.json()
    const p = JSON.parse(j.choices?.[0]?.message?.content ?? '{}')
    // 가드 — 모델이 뭘 주든 여기서 형태를 강제한다
    const terms = Array.isArray(p.terms) ? p.terms.filter((t) => typeof t === 'string' && t.length >= 1).slice(0, 5) : []
    const money = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e9 ? Math.round(v) : null)
    const out = { terms, maxPrice: money(p.maxPrice), minPrice: money(p.minPrice), source: 'openai' }
    // 해석이 통째로 비면 규칙 기반이 낫다
    if (!out.terms.length && out.maxPrice == null && out.minPrice == null) return parseRule(q)
    return out
  } catch { return parseRule(q) }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  const q = req.query?.q ?? ''
  // 서술형 질의는 AI가 해석한다. 단순 낱말은 그대로 이름 검색이 더 정확하다.
  const ai = req.query?.ai === '1'
  const parsed = ai ? await interpret(q) : null
  const items = ai ? applyFilter(parsed) : searchPool(q)
  res.status(200).json({
    q, ai, parsed, total: pool.items.length, count: items.length, items,
    /** 추천 검색어 — 상품명 빈도에서 유도. 손으로 고르지 않는다. */
    suggest: SUGGEST,
    crawledAt: pool.crawledAt,
  })
}
