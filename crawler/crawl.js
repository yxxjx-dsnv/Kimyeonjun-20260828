/**
 * 올박스 상품 풀 크롤러 — 카드 생태계 전수 조사 (Phase 0)
 *   node crawler/crawl.js          전 축 수집 → data/pool.json, api/_pool.js
 *   node crawler/crawl.js oripa    수집된 오리파 상품의 확률 표기 실측 (작업 4)
 *
 * 이것은 통 구성이 아니라 **조사**다. 가격 밴드로 미리 자르지 않는다.
 * 무엇이 있는지가 아니라 **무엇이 없는지**를 봐야 등급 성립 여부를 판정할 수 있고,
 * 밴드를 걸면 비어 있는 구간이 애초에 안 보인다. 분류와 판정은 crawler/report.mjs가 한다.
 *
 * 출력 두 개.
 *   data/pool.json  사람이 읽는 미러 (심사자가 원본을 직접 확인할 수 있게)
 *   api/_pool.js    ES 모듈. 서버리스 함수가 import하므로 런타임 파일 I/O가 0이다.
 */
import { writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { danawaSearch, flatten, isJunk, authOf, HEADERS, isOripa, PROB_WORD, PROB_NUM, GUARANTEE_WORD } from '../api/_sources.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * 축(axis)은 가격 스펙트럼의 구간이지 등급이 아니다.
 * 등급(C·B·A·S)은 참여비 대비 배수로 정해지므로 report.mjs가 실측 가격에서 유도한다.
 * 여기서는 "그 구간의 상품이 시장에 실제로 존재하는가"만 확인한다.
 *
 * I6: 상품 풀은 카드 생태계 안에 머무른다. 생필품·가전·식품·유니폼을 섞지 않는다.
 * v1은 카드 검색어가 10개뿐이었고 전부 SAR·PSA·부스터박스 등 중고가~최고가대였다.
 * 그래서 2,000~5,000원 구간이 0건이었고, 하한을 카드로 못 채워 생필품을 섞었다.
 */
const AXES = {
  grade: [ // 최고가대 — 그레이딩 / 고레어 단품
    '포켓몬카드 psa10', '포켓몬 리자몽 psa', '포켓몬카드 PSA', '포켓몬카드 BGS',
    '포켓몬카드 SAR', '포켓몬카드 UR', '포켓몬카드 SR', '포켓몬 뮤츠 카드',
  ],
  sealed: [ // 중고가대 — 봉인 제품 (박스 단위)
    '포켓몬 하이클래스팩', '포켓몬 강화확장팩', '포켓몬카드 부스터박스',
    '포켓몬카드 확장팩 박스', '포켓몬카드 트레이너박스',
  ],
  deck: [ // 중저가대 — 덱 / 단품 레어
    '포켓몬카드 스타터덱', '포켓몬카드 배틀덱', '포켓몬카드 테마덱',
    '포켓몬카드 덱빌드박스', '포켓몬카드 V 카드', '포켓몬카드 ex 카드',
  ],
  bulk: [ // 저가대 — 벌크 / 낱장 묶음 (하한을 카드로 채울 수 있는지가 여기서 갈린다)
    '포켓몬카드 낱장', '포켓몬카드 벌크', '포켓몬카드 노멀', '포켓몬카드 커먼',
    '포켓몬카드 100장', '포켓몬카드 랜덤 10장', '포켓몬카드 묶음', '포켓몬카드 중복',
  ],
  acc: [ // 액세서리 — 하한 폴백 후보. 수집만 하고 사용 여부는 판정 후 결정한다.
    '포켓몬카드 슬리브', '포켓몬 카드 바인더', '포켓몬카드 덱케이스',
    '카드 토플로더', '카드 프로텍터', '트레카 슬리브',
  ],
  oripa: [ // 문제의 실재 — 확률 표기 실측 대상 (작업 4)
    '포켓몬카드 오리파', '오리파', '포켓몬 랜덤팩', '포켓몬카드 랜덤',
  ],
}

const QUERIES = Object.entries(AXES).flatMap(([group, qs]) => qs.map((q) => ({ q, group })))
const PER = 25 // 축별 다양성 확보. 조사이므로 v1(8)보다 넉넉히 받는다.

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 다나와는 짧은 간격으로 계속 부르면 **에러가 아니라 빈 목록**을 돌려준다.
 * HTTP 200에 결과 0건이라 실패로 잡히지 않고 조용히 데이터만 사라진다.
 * 크롤러의 진짜 실패는 예외가 아니라 조용한 0건이다. 빈 응답을 재시도 신호로 취급한다.
 */
async function fetchWithBackoff(q, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const rows = await danawaSearch(q, 40, 15000)
    if (rows.length) return { rows, retried: i }
    await pause(2500 * (i + 1))
  }
  return { rows: [], retried: tries }
}

async function crawlAll() {
  const seen = new Set()
  const items = []
  const failed = []
  const empty = []        // 조용한 0건 — 반드시 별도로 나열한다
  const blocked = []      // 차단어가 지운 것 — 샘플을 남겨 '슬리브 사고' 재발을 탐지한다
  const perQuery = []

  for (const { q, group } of QUERIES) {
    let rows = [], retried = 0
    try {
      ;({ rows, retried } = await fetchWithBackoff(q))
    } catch (e) {
      failed.push(`${q}: ${e.message}`)
      await pause(1200)
      continue
    }
    if (!rows.length) empty.push(q)

    let kept = 0, dupe = 0, junk = 0
    for (const r of rows) {
      if (kept >= PER) break
      if (seen.has(r.id)) { dupe++; continue }
      const flat = flatten(r.rawTitle)
      if (isJunk(flat, group)) {
        junk++
        if (blocked.length < 40) blocked.push({ group, q, name: r.rawTitle.slice(0, 60), price: r.price })
        continue
      }
      if (!(r.price > 0)) continue
      seen.add(r.id)
      kept++
      items.push({
        id: r.id,
        name: r.rawTitle.slice(0, 80),
        price: r.price,
        image: r.image,
        url: r.url,
        seller: r.seller,
        query: q,
        group,
        auth: authOf(r.rawTitle, r.seller),
        rating: r.rating ?? null,
        reviews: r.reviews ?? null,
        spec: r.spec ?? [],
      })
    }
    perQuery.push({ q, group, fetched: rows.length, kept, dupe, junk, retried })
    console.log(
      `[${group.padEnd(6)}] ${q.padEnd(20)} ${String(rows.length).padStart(3)}건 조회 → ${String(kept).padStart(2)}건 채택` +
      `${dupe ? `  중복 ${dupe}` : ''}${junk ? `  차단 ${junk}` : ''}${retried ? `  재시도 ${retried}` : ''}` +
      `${rows.length ? '' : '  ⚠ 빈 응답'}`
    )
    await pause(1200)
  }

  const pool = {
    crawledAt: new Date().toISOString(),
    source: 'danawa',
    axes: Object.fromEntries(Object.entries(AXES).map(([g, qs]) => [g, qs.length])),
    queries: QUERIES.map((x) => x.q),
    perQuery,
    empty,
    failed,
    blocked,
    items: items.sort((a, b) => a.price - b.price),
  }

  writeFileSync(join(ROOT, 'data', 'pool.json'), JSON.stringify(pool, null, 2))
  writeFileSync(
    join(ROOT, 'api', '_pool.js'),
    `// 자동 생성 파일 — 직접 수정하지 말 것. \`npm run crawl\`로 재생성됨.\nexport default ${JSON.stringify(pool)}\n`
  )
  return pool
}

/** self-check — v1이 조용히 실패한 지점을 전부 검사로 바꾼다. */
function check(pool) {
  const it = pool.items
  const fail = []
  const ok = []
  const t = (name, cond, detail) => (cond ? ok : fail).push(`${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)

  // v1은 pcode만 받아 중개상품(go_link_goods) 40건을 HTTP 200인 채로 잃었다.
  // 0건이면 파서가 한쪽 형식만 보고 있다는 뜻이므로 실패로 판정한다.
  const broker = it.filter((x) => x.id.startsWith('x')).length
  t('중개상품 id(x접두어) 수집', broker > 0, `${broker}건`)

  t('전 항목 가격 > 0', it.every((x) => x.price > 0))
  t('전 항목 id 유일', new Set(it.map((x) => x.id)).size === it.length)
  t('전 항목 이름 비어있지 않음', it.every((x) => x.name && x.name.trim()))

  // I6 — 카드 생태계 밖 품목이 섞이지 않았는가
  const axes = new Set(Object.keys(pool.axes))
  t('I6 카드 생태계 밖 group 0건', it.every((x) => axes.has(x.group)))

  const imgRate = it.filter((x) => x.image).length / (it.length || 1)
  t('이미지 확보율 ≥ 60%', imgRate >= 0.6, `${(imgRate * 100).toFixed(1)}%`)

  // 조용한 0건은 실패가 아니라 경고로 남기되 반드시 나열한다
  t('빈 응답 검색어 나열됨', Array.isArray(pool.empty))

  console.log('\n─────────── self-check ───────────')
  for (const l of [...ok, ...fail]) console.log(' ', l)
  console.log(`  ${ok.length}/${ok.length + fail.length} 통과`)
  if (pool.empty.length) console.log(`  ⚠ 빈 응답 ${pool.empty.length}개: ${pool.empty.join(', ')}`)
  if (pool.failed.length) console.log(`  ⚠ 실패 ${pool.failed.length}건: ${pool.failed.join(' / ')}`)
  return fail.length === 0
}

/**
 * 작업 4 — 오리파 확률 공시 실측 (docs/references.md B7을 채운다)
 *
 * 1차 시도는 **틀린 100%를 만들었다.** 오리파 91건의 상세 URL을 전부 받아
 * "확률 단어 0건 → 91/91 미공시"라고 판정했는데, 84건이 다나와 중개 링크였고
 * 전부 "현재 로딩중입니다. 해당 쇼핑몰로 이동 중입니다"라는 578자짜리 대기
 * 페이지를 200으로 돌려줬다. 목적지는 JS로만 넘어간다. 상품 페이지를 한 건도
 * 보지 못한 채 100%를 선언한 것이다. v1의 "HTTP 200이 성공이 아니었다"와 같다.
 *
 * 그래서 두 가지를 바꿨다.
 *  (1) **유효성 게이트** — 받아온 문서에 상품명 조각이나 가격이 없으면 판정하지
 *      않고 unreachable로 둔다. 검사가 없으면 다음에 또 같은 100%가 나온다.
 *  (2) **측정 가능한 것으로 옮긴다** — 상세는 37건 중 1건만 도달 가능하다.
 *      대신 상품명·스펙의 확률 표기는 전수 측정할 수 있고, 그것이 B7의 논지다.
 *      오리파는 "SAR 확정"·"RR RRR 3장 확정"처럼 **보장**을 광고하면서 **확률**은
 *      적지 않는다. 확정 문구 대비 확률 문구의 비를 세면 그것이 바로 근거가 된다.
 *
 * 도달 불가를 미공시로 세지 않는다. 둘은 다른 주장이다.
 */
async function oripaAudit() {
  const pool = JSON.parse(readFileSync(join(ROOT, 'data', 'pool.json'), 'utf8'))
  const raw = pool.items.filter((x) => x.group === 'oripa')
  const targets = raw.filter((x) => isOripa(x.name))
  console.log(`오리파 축 ${raw.length}건 → 실제 오리파 ${targets.length}건 (굿즈·앨범 등 ${raw.length - targets.length}건 제외)\n`)

  // ── 1. 표기 전수 측정 (네트워크 불필요) ──────────────────────────
  const surface = targets.map((x) => {
    const text = [x.name, ...(x.spec || [])].join(' ')
    return {
      id: x.id, name: x.name, price: x.price, url: x.url,
      probWord: PROB_WORD.test(text),
      probNum: PROB_WORD.test(text) && PROB_NUM.test(text),
      guarantee: GUARANTEE_WORD.test(text),
    }
  })
  const nProbNum = surface.filter((r) => r.probNum).length
  const nProbWord = surface.filter((r) => r.probWord).length
  const nGuar = surface.filter((r) => r.guarantee).length

  console.log('─────── ① 상품 표기 전수 측정 (상품명 + 스펙) ───────')
  console.log(`  대상 ${surface.length}건`)
  console.log(`  확률 수치 표기      ${String(nProbNum).padStart(3)}건  (${(nProbNum / surface.length * 100).toFixed(1)}%)`)
  console.log(`  확률 단어라도 있음   ${String(nProbWord).padStart(3)}건  (${(nProbWord / surface.length * 100).toFixed(1)}%)`)
  console.log(`  '확정·보장'류 표기   ${String(nGuar).padStart(3)}건  (${(nGuar / surface.length * 100).toFixed(1)}%)`)
  console.log(`  ⇒ 확률 미표기 ${surface.length - nProbNum} / ${surface.length}건`)

  // ── 2. 상세 페이지 — 도달 가능한 것만 ────────────────────────────
  const reachable = targets.filter((x) => x.id.startsWith('d'))
  console.log(`\n─────── ② 상세 페이지 확인 ───────`)
  console.log(`  중개 링크 ${targets.length - reachable.length}건은 브리지 페이지가 목적지를 JS로만 넘겨 도달 불가.`)
  console.log(`  도달 시도 대상: ${reachable.length}건`)

  const detail = []
  for (const it of reachable) {
    let verdict = 'unreachable', why = ''
    try {
      const res = await fetch(it.url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(15000) })
      const html = (await res.text()).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
      // 유효성 게이트 — 이 검사가 없어서 1차에 틀린 100%가 나왔다.
      const nameHit = html.includes(it.name.replace(/^\[[^\]]*\]\s*/, '').slice(0, 8))
      const priceHit = html.includes(it.price.toLocaleString('ko-KR'))
      if (!res.ok) why = `HTTP ${res.status}`
      else if (!nameHit && !priceHit) why = '상품 내용 없음(브리지/로딩 페이지)'
      else {
        const m = html.match(PROB_WORD)
        if (!m) { verdict = 'none'; why = '확률 언급 없음' }
        else {
          const i = html.indexOf(m[0])
          const near = html.slice(Math.max(0, i - 120), i + 120)
          const num = near.match(PROB_NUM)
          verdict = num ? 'disclosed' : 'word-only'
          why = num ? num[0] : near.replace(/\s+/g, ' ').trim().slice(0, 60)
        }
      }
    } catch (e) { why = e.message.slice(0, 40) }
    detail.push({ id: it.id, name: it.name, verdict, why })
    console.log(`   ${verdict === 'disclosed' ? '●' : verdict === 'word-only' ? '◐' : verdict === 'none' ? '○' : '·'} ${it.name.slice(0, 46)} — ${why}`)
    await pause(700)
  }
  const dOk = detail.filter((r) => r.verdict !== 'unreachable')
  console.log(`\n  상세 도달 ${dOk.length}/${reachable.length}건 · 확률 수치 공시 ${detail.filter((r) => r.verdict === 'disclosed').length}건`)

  // ── self-check — 1차 결함을 검사로 고정한다 ──────────────────────
  const fails = []
  const t = (n, c, d) => { if (!c) fails.push(n); console.log(`  ${c ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`) }
  console.log('\n─────── self-check ───────')
  t('오리파 판별이 굿즈를 걸러냄', raw.length > targets.length, `${raw.length}→${targets.length}건`)
  t('전 대상이 오리파 표현을 가짐', targets.every((x) => isOripa(x.name)))
  t('도달 불가를 미공시로 세지 않음', detail.every((r) => r.verdict !== 'unreachable' || r.why))
  t('표기 측정은 네트워크와 무관', surface.length === targets.length)
  t('확정 표기가 확률 표기보다 많음 (B7 논지)', nGuar > nProbNum, `확정 ${nGuar} vs 확률 ${nProbNum}`)
  console.log(`  ${5 - fails.length}/5 통과`)

  writeFileSync(join(ROOT, 'data', 'oripa-audit.json'), JSON.stringify({
    auditedAt: new Date().toISOString(),
    method: {
      surface: '상품명 + 다나와 스펙 문자열에서 확률 단어와 수치를 전수 탐색',
      detail: '상세 HTML을 받되, 상품명 조각이나 가격이 본문에 있어야만 판정. 없으면 unreachable',
      limit: '다나와 중개 상품은 브리지 페이지가 목적지를 JS로만 넘겨 상세 도달 불가. 도달 불가는 미공시로 세지 않는다',
    },
    axisTotal: raw.length, oripaTotal: targets.length,
    probNum: nProbNum, probWord: nProbWord, guarantee: nGuar,
    undisclosed: targets.length - nProbNum,
    detailAttempted: reachable.length, detailReached: dOk.length,
    surface, detail,
  }, null, 2))
  console.log('\n  → data/oripa-audit.json 저장')
}

if (process.argv[2] === 'oripa') {
  await oripaAudit()
} else {
  const pool = await crawlAll()
  const by = (k) => pool.items.reduce((m, i) => ((m[i[k]] = (m[i[k]] || 0) + 1), m), {})
  const prices = pool.items.map((i) => i.price)
  console.log('\n─────────── 수집 결과 ───────────')
  console.log(`총 ${pool.items.length}건 · 검색어 ${QUERIES.length}개 · 빈 응답 ${pool.empty.length}개 · 실패 ${pool.failed.length}건`)
  console.log('축별   :', by('group'))
  console.log('정품표기:', by('auth'))
  console.log(`가격대 : ${prices[0]?.toLocaleString()}원 ~ ${prices.at(-1)?.toLocaleString()}원`)
  console.log(`이미지 : ${pool.items.filter((i) => i.image).length}건 확보`)
  console.log(`차단   : ${pool.blocked.length}건 (샘플 5)`)
  for (const b of pool.blocked.slice(0, 5)) console.log(`         [${b.group}] ${b.name} — ${b.price.toLocaleString()}원`)
  const passed = check(pool)
  console.log('\n다음: node crawler/report.mjs  로 등급 성립을 판정한다.')
  if (!passed) process.exitCode = 1
}

export { AXES, crawlAll, check }
