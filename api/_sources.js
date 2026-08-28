/**
 * 상품 소스 파서 — 크롤러(1회성 풀 생성)와 서버가 같은 코드를 쓴다.
 * 반환 스키마 하나로 통일: {id, rawTitle, price, seller, url, image, rating, reviews, spec}
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

// 카드 그룹에만 적용하는 추가 차단.
// 처음엔 '슬리브'·'바인더'도 막았는데, 고가 카드가 슬리브에 넣어 팔리는 경우가 많아
// ("뮤 ex SAR 풀헤드 … 슬리브") 상위 등급 상품이 통째로 사라졌다. 액세서리 단품은
// 가격 밴드가 이미 걸러내므로, 카드가 아닌 것이 확실한 것만 남긴다.
const CARD_EXCLUDE = [
  '플레이매트', '덱케이스', '보관함', '수납장',
  '대여', '프록시', '가짜', '연습용', '코스프레', '피규어', '인형', '스티커',
]

export const isJunk = (flat, group) =>
  EXCLUDE.some((k) => flat.includes(k)) ||
  (group === 'card' && CARD_EXCLUDE.some((k) => flat.includes(k)))

/**
 * 정식 유통 여부. 카드 시장의 실제 쟁점은 KC가 아니라 **짝퉁·재포장**이다
 * (언론이 "전문 리셀러의 재포장 유통"을 반복해 지적했다).
 * 국내 정식 유통사 표기가 있을 때만 official로 두고, 나머지는 unknown이다.
 * 확인되지 않은 것을 정품이라고 주장하지 않는다.
 */
const OFFICIAL = ['포켓몬코리아', '타카라토미']
export const authOf = (rawTitle, seller = '') => {
  const t = rawTitle + ' ' + seller
  if (/\[해외\]|병행|직구/.test(t)) return 'unknown'
  return OFFICIAL.some((m) => t.includes(m)) ? 'official' : 'unknown'
}

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
    const href = nameM[1].replace(/&amp;/g, '&')

    // 다나와에는 자사 상품(pcode)과 **중개 상품**(go_link_goods.php?link_prod_c=…)이
    // 섞여 있다. pcode만 받다가 중개 상품 40건이 통째로 사라졌고, 고가 카드가
    // 전부 거기 속해 상위 등급이 비었다. 두 형식을 모두 받는다.
    const pcode = (href.match(/pcode=(\d+)/) || [])[1]
    const linkCode = (href.match(/link_prod_c=([A-Za-z0-9]+)/) || [])[1]
    if (!rawTitle || !price || (!pcode && !linkCode)) continue
    const imgM = block.match(/<img[^>]+(?:data-original|src)="([^"]+)"/)
    let image = imgM ? imgM[1] : ''
    if (image.startsWith('//')) image = 'https:' + image
    if (/noimg|blank|loading/i.test(image)) image = ''

    // 다나와는 평점·리뷰수·스펙을 같은 블록에 이미 내려준다. 그동안 block을
    // 손에 쥐고도 정규식 4개만 돌려서 전부 버리고 있었다. 실측(참기름 40건)에서
    // 평점·리뷰 35/40, 스펙 40/40. 이게 있어야 상품 카드를 지어내지 않고 채운다.
    const ratingM = block.match(/class="text__score">\s*([\d.]+)\s*</)
    const reviewM = block.match(/class="text__review"[\s\S]{0,160}?\(\s*<span[^>]*>\s*([\d,]+)/)
    const specM = block.match(/class="spec_list">([\s\S]*?)<\/div>/)
    const spec = specM
      ? specM[1]
          .replace(/<em>\/<\/em>/g, '\u0001')
          .replace(/<[^>]+>/g, '')
          .split('\u0001')
          .map((x) => x.replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .slice(0, 4)
      : []

    out.push({
      id: pcode ? `d${pcode}` : `x${linkCode}`,
      rawTitle,
      price,
      seller: pcode ? '다나와 최저가' : '다나와 중개',
      url: pcode ? `https://prod.danawa.com/info/?pcode=${pcode}` : href,
      image,
      rating: ratingM ? Number(ratingM[1]) : null,
      // 다나와는 리뷰수를 999에서 끊는다. 그대로 두고 화면에서 '999+'로 적는다.
      reviews: reviewM ? Number(reviewM[1].replace(/,/g, '')) : null,
      spec,
    })
  }
  return out
}
