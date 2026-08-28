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
import { danawaSearch, flatten, isJunk, kcOf } from '../api/_sources.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// 가장 싼 박스의 참여비. 이보다 싼 상품은 어느 박스에도 들어갈 수 없으므로
// 추첨 시점이 아니라 크롤 시점에 잘라낸다 — 꽝 없음을 데이터에 새기는 첫 번째 층.
const MIN_PRICE = 2000

// {검색어, 그룹, 가격 하한, 가격 상한, 최대 수집}
const G = (q, group, min, max, per = 8) => ({ q, group, min, max, per })

const QUERIES = [
  // 컬처 시그널 — 이 제품의 출발점. 하위 티어의 주인공이다.
  G('말랑이', 'trend', 2000, 20000),
  G('슬랑이', 'trend', 2000, 20000),
  G('왁뿌볼', 'trend', 2000, 20000),
  G('스퀴시', 'trend', 2000, 20000),
  G('뿌셔볼', 'trend', 2000, 20000),
  G('피젯토이', 'trend', 2000, 20000),
  G('스트레스볼', 'trend', 2000, 20000),
  G('캡슐토이', 'trend', 2000, 20000),

  // 생필품 — 45~65세 여성이 실제로 반복 구매하는 것. 하한 티어의 신뢰를 만든다.
  ...['참기름', '들기름', '즉석밥', '조미김', '물티슈', '주방세제', '세탁세제', '화장지',
    '핸드크림', '밀폐용기', '샴푸', '치약', '견과류', '수면양말', '고무장갑', '수세미',
    '커피믹스', '건조나물'].map((q) => G(q, 'daily', 2000, 60000)),

  // 중간 티어 — 소형가전·생활가전
  ...['전기포트', '에어프라이어', '가습기', '전기밥솥', '무선청소기', '커피머신',
    '전기요', '음식물처리기'].map((q) => G(q, 'home', 20000, 700000)),

  // 상위 티어(S/A) — 박스의 얼굴이 되는 상품
  ...['아이패드', '닌텐도 스위치', '에어팟', '다이슨 에어랩', '로봇청소기', '노트북',
    'OLED TV', '김치냉장고', '드럼세탁기', '스타일러'].map((q) => G(q, 'prize', 150000, 4000000)),
]

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

const seen = new Set()
const items = []
const failed = []

for (const { q, group, min, max, per } of QUERIES) {
  let rows = []
  try {
    rows = await danawaSearch(q, 40, 12000)
  } catch (e) {
    failed.push(`${q}: ${e.message}`)
    await pause(300)
    continue
  }
  let kept = 0
  for (const r of rows) {
    if (kept >= per) break
    if (seen.has(r.id)) continue
    if (r.price < Math.max(MIN_PRICE, min) || r.price > max) continue
    const flat = flatten(r.rawTitle)
    if (isJunk(flat)) continue
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
      kc: kcOf(r.rawTitle),
    })
  }
  console.log(`${q.padEnd(12)} ${String(rows.length).padStart(3)}건 조회 → ${kept}건 채택`)
  await pause(300)
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
console.log('KC표기 :', by('kc'))
console.log(`가격대 : ${prices[0].toLocaleString()}원 ~ ${prices.at(-1).toLocaleString()}원`)
console.log(`이미지 : ${items.filter((i) => i.image).length}건 확보`)
if (failed.length) console.log('실패   :', failed.join(' / '))
