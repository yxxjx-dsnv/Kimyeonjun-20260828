/**
 * 상품 소스 파서 — 크롤러(1회성 풀 생성)와 서버가 같은 코드를 쓴다.
 * 반환 스키마 하나로 통일: {id, rawTitle, price, seller, url, image}
 *
 * 직전 과제(Kimyeonjun-20260815)에서 20곳을 실측해 살아남은 파서를 옮겨왔다.
 * cheerio·puppeteer를 쓰지 않는다 — 다나와는 SSR HTML이라 정규식으로 충분하다.
 */
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
export const HEADERS = { 'User-Agent': UA, Accept: 'text/html,application/json' }

export const flatten = (s) => (s || '').replace(/\s+/g, '')
export const cleanTitle = (s) => (s || '').replace(/\s+/g, ' ').trim()

// 상품 본체가 아닌 매물 차단 — 합성어 단위로만.
// 부분 문자열로 막으면 '박스'가 '올박스'까지 잡아먹는다(직전 과제에서 겪음).
const EXCLUDE = [
  '쇼핑백', '종이가방', '빈박스', '박스만', '더스트백', '보증서만',
  '스티커', '리폼', '수선', '부자재', '공병', '전용케이스', '보호필름',
  '거치대', '충전기만', '샘플', '증정품', '체험분', '리퍼', '중고',
]
export const isJunk = (flat) => EXCLUDE.some((k) => flat.includes(k))

// KC 안전확인은 '확인된 것만' 표기한다. 없으면 인증되었다고 주장하지 않는다.
const KC_MARKS = ['KC', '안전확인', '적합확인', '안전인증', 'KC인증']
export const kcOf = (rawTitle) =>
  KC_MARKS.some((m) => rawTitle.toUpperCase().includes(m.toUpperCase())) ? 'certified' : 'unknown'

/** 다나와 통합검색 SSR HTML → prod_item 블록 정규식 파싱. */
export async function danawaSearch(q, limit = 10, timeoutMs) {
  const res = await fetch(`https://search.danawa.com/dsearch.php?query=${encodeURIComponent(q)}`, {
    headers: HEADERS,
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  const out = []
  for (const block of html.split(/class="prod_item/).slice(1)) {
    if (out.length >= limit) break
    const nameM = block.match(/class="prod_name"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/s)
    const priceM = block.match(/price_sect[^>]*>[\s\S]*?<strong>([\d,]+)<\/strong>/)
    if (!nameM || !priceM) continue
    const rawTitle = cleanTitle(nameM[2].replace(/<[^>]+>/g, ''))
    const price = Number(priceM[1].replace(/,/g, ''))
    const pcode = (nameM[1].match(/pcode=(\d+)/) || [])[1]
    if (!rawTitle || !price || !pcode) continue
    const imgM = block.match(/<img[^>]+(?:data-original|src)="([^"]+)"/)
    let image = imgM ? imgM[1] : ''
    if (image.startsWith('//')) image = 'https:' + image
    if (/noimg|blank|loading/i.test(image)) image = ''
    out.push({
      id: `d${pcode}`,
      rawTitle,
      price,
      seller: '다나와 최저가',
      url: `https://prod.danawa.com/info/?pcode=${pcode}`,
      image,
    })
  }
  return out
}
