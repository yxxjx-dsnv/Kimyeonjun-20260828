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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  const q = req.query?.q ?? ''
  const items = searchPool(q)
  res.status(200).json({
    q, total: pool.items.length, count: items.length, items,
    /** 추천 검색어 — 상품명 빈도에서 유도. 손으로 고르지 않는다. */
    suggest: SUGGEST,
    crawledAt: pool.crawledAt,
  })
}
