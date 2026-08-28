/**
 * 올박스 상품 풀 크롤러 — 1회 실행 후 결과를 커밋한다.
 *   node crawler/crawl.js
 *
 * 두 개를 동시에 쓴다.
 *   data/pool.json  사람이 읽는 미러 (심사자가 원본을 직접 확인할 수 있게)
 *   api/_pool.js    ES 모듈. 서버리스 함수가 import하므로 런타임 파일 I/O가 0이다.
 *                   (이 구조 덕분에 vercel.json이 필요 없다)
 *
 * 크롤 데이터는 장식이 아니다. 티어별 평균 시가가 확률 계산의 입력이라
 * 이 파일의 출력이 바뀌면 api/_draw.js의 확률표가 바뀐다.
 */
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { danawaSearch, flatten, isJunk, authOf } from '../api/_sources.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// 가장 싼 박스의 참여비. 이보다 싼 상품은 어느 박스에도 들어갈 수 없으므로
// 추첨 시점이 아니라 크롤 시점에 잘라낸다 — 꽝 없음을 데이터에 새기는 첫 번째 층.
const MIN_PRICE = 2000

// {검색어, 그룹, 가격 하한, 가격 상한, 최대 수집}
const G = (q, group, min, max, per = 8) => ({ q, group, min, max, per })

const QUERIES = [
  // 컬처 시그널 — 포켓몬 카드. 상위 등급의 주인공이다.
  // 오리파(オリパ, 오리지널 팩)는 카드숍이 내용물을 직접 구성해 무작위로 파는
  // 확률형 상품인데, 실물 판매로 분류돼 확률형 아이템 규제도 사행성 심의도
  // 받지 않는다. 그 상품이 실제로 커머스에 올라와 있다는 것을 데이터로 남긴다.
  G('포켓몬카드 오리파', 'card', 20000, 400000),
  G('포켓몬 카드', 'card', 5000, 200000),
  G('포켓몬 강화확장팩', 'card', 5000, 400000),
  G('포켓몬카드 하이클래스', 'card', 30000, 600000),
  G('포켓몬 카드 부스터박스', 'card', 15000, 400000),
  G('포켓몬카드 배틀덱', 'card', 5000, 60000),
  G('포켓몬카드 SAR', 'card', 100000, 1400000),
  G('포켓몬 카드 psa10', 'card', 200000, 1800000),
  G('포켓몬 리자몽 psa', 'card', 300000, 2200000),
  G('포켓몬 카드 PSA', 'card', 100000, 900000),

  // 기본 등급 — 45~65세 여성이 실제로 반복 구매하는 것.
  // 오리파는 꽝이면 쓸모없는 카드가 남지만, 올박스는 최소한 참기름이 온다.
  ...['참기름', '들기름', '즉석밥', '조미김', '물티슈', '주방세제', '세탁세제', '화장지',
    '핸드크림', '밀폐용기', '샴푸', '치약', '견과류', '수면양말', '고무장갑', '수세미',
    '커피믹스', '건조나물'].map((q) => G(q, 'daily', 2000, 60000)),

  // 데일리 100원 박스의 경품 — 45~65세 여성이 실제로 사는 고관여 건강식품.
  // 참여비 100원에 대해 상품 원가가 충분히 커야 '재고 소진형'이 성립한다.
  ...['홍삼정', '홍삼스틱', '흑마늘즙'].map((q) => G(q, 'prize', 20000, 200000)),

  // 중간 등급 — 소형가전·생활가전
  ...['전기포트', '에어프라이어', '가습기', '전기밥솥', '무선청소기', '커피머신',
    '전기요', '음식물처리기'].map((q) => G(q, 'home', 20000, 700000)),

  // 공동구매형 대상 — 상품이 확정이고 확률은 '얼마를 내는가'에만 작동한다.
  // 유니폼은 사이즈·마킹 때문에 원래도 여럿이 모여 한 번에 주문하는 품목이라
  // 팀구매와 궁합이 좋다.
  ...['축구 유니폼', '야구 유니폼', '손흥민 유니폼', '레플리카 유니폼',
    '농구 유니폼', '유니폼 마킹'].map((q) => G(q, 'uniform', 20000, 500000)),
]

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 다나와는 짧은 간격으로 계속 부르면 **에러가 아니라 빈 목록**을 돌려준다.
 * HTTP 200에 결과 0건이라 실패로 잡히지 않고 조용히 데이터만 사라진다
 * (직전 과제의 "200 OK가 성공이 아니었다"와 같은 함정이다).
 * 그래서 빈 응답을 재시도 신호로 취급하고, 간격을 넉넉히 둔다.
 */
async function fetchWithBackoff(q, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const rows = await danawaSearch(q, 40, 15000)
    if (rows.length) return rows
    await pause(2500 * (i + 1))
  }
  return []
}

const seen = new Set()
const items = []
const failed = []

for (const { q, group, min, max, per } of QUERIES) {
  let rows = []
  try {
    rows = await fetchWithBackoff(q)
  } catch (e) {
    failed.push(`${q}: ${e.message}`)
    await pause(1200)
    continue
  }
  let kept = 0
  for (const r of rows) {
    if (kept >= per) break
    if (seen.has(r.id)) continue
    if (r.price < Math.max(MIN_PRICE, min) || r.price > max) continue
    const flat = flatten(r.rawTitle)
    if (isJunk(flat, group)) continue
    seen.add(r.id)
    kept++
    items.push({
      id: r.id,
      name: r.rawTitle.slice(0, 70),
      price: r.price,
      image: r.image,
      url: r.url,
      seller: r.seller,
      query: q,
      group,
      auth: authOf(r.rawTitle, r.seller),
    })
  }
  console.log(`${q.padEnd(14)} ${String(rows.length).padStart(3)}건 조회 → ${kept}건 채택${rows.length ? '' : '  ⚠ 빈 응답'}`)
  await pause(1200)
}

const pool = {
  crawledAt: new Date().toISOString(),
  source: 'danawa',
  minPrice: MIN_PRICE,
  queries: QUERIES.map((x) => x.q),
  items: items.sort((a, b) => a.price - b.price),
}

writeFileSync(join(ROOT, 'data', 'pool.json'), JSON.stringify(pool, null, 2))
writeFileSync(
  join(ROOT, 'api', '_pool.js'),
  `// 자동 생성 파일 — 직접 수정하지 말 것. \`npm run crawl\`로 재생성됨.\nexport default ${JSON.stringify(pool)}\n`
)

// README·과제1·발표자료에 쓰는 수치는 전부 이 출력에서 가져온다.
const by = (k) => items.reduce((m, i) => ((m[i[k]] = (m[i[k]] || 0) + 1), m), {})
const prices = items.map((i) => i.price)
console.log('\n─────────── 수집 결과 ───────────')
console.log(`총 ${items.length}건 · 검색어 ${QUERIES.length}개 · 실패 ${failed.length}건`)
console.log('그룹별 :', by('group'))
console.log('정품표기 :', by('auth'))
console.log(`가격대 : ${prices[0].toLocaleString()}원 ~ ${prices.at(-1).toLocaleString()}원`)
console.log(`이미지 : ${items.filter((i) => i.image).length}건 확보`)
if (failed.length) console.log('실패   :', failed.join(' / '))
