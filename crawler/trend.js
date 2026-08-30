// 다나와 월별 최저가 시계열 — 과제1 "최근 1년간 화제" 근거.
// 스냅샷 크롤(crawl.js)은 한 시점만 본다. 추세는 여기서만 나온다.
//
// 다나와 창(window) 구조 — 실측으로 확인했다:
//   키 '1','3'      주별,  Fulldate="YY-MM-DD"
//   키 '6','12','24' 월별,  date="YY-MM"   ← Fulldate 없음
// 1차 버전은 "가장 긴 창"을 골라 키 24를 잡고 없는 Fulldate를 읽어
// 날짜를 전부 undefined로 만들었다. 그래서 창을 이름으로 명시한다.
import { writeFileSync, readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const nap = (ms) => new Promise((r) => setTimeout(r, ms))

export const WINDOW = '12'          // 12개월 = 과제가 말하는 "최근 1년"
const MONTHLY = new Set(['6', '12', '24'])

export function parseWindow(json, key = WINDOW) {
  const res = json?.[key]?.result
  if (!Array.isArray(res) || !res.length) return null
  const monthly = MONTHLY.has(key)
  const pts = res.map((p) => ({
    d: monthly ? p.date : p.Fulldate,          // 창마다 날짜 필드가 다르다
    p: Number(p.minPrice),
  }))
  // 날짜나 가격이 빠진 점이 하나라도 있으면 그 창은 못 쓴다 — 조용히 넘기지 않는다
  if (pts.some((x) => !x.d || !(x.p > 0))) return null
  return pts
}

export async function trendOf(pcode, key = WINDOW) {
  const res = await fetch(`https://prod.danawa.com/info/ajax/getProductPriceList.ajax.php?productCode=${pcode}`, {
    headers: { 'user-agent': UA, 'x-requested-with': 'XMLHttpRequest',
      referer: `https://prod.danawa.com/info/?pcode=${pcode}` },
  })
  if (!res.ok) return null
  const txt = await res.text()
  if (!txt.startsWith('{')) return null            // 차단/로그인 페이지를 데이터로 오인하지 않는다
  try { return parseWindow(JSON.parse(txt), key) } catch { return null }
}

export const changeOf = (s) => (!s || s.length < 2) ? null : {
  from: s[0].p, to: s.at(-1).p, months: s.length,
  pct: ((s.at(-1).p - s[0].p) / s[0].p) * 100,
  lo: Math.min(...s.map((x) => x.p)), hi: Math.max(...s.map((x) => x.p)),
}

export const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

// 각 상품을 자기 첫 달 = 100 으로 정규화하고 달마다 중앙값을 낸다.
// 정규화 없이 평균을 내면 비싼 상품 하나가 지수를 끌고 간다.
export function indexOf(items) {
  const months = [...new Set(items.flatMap((i) => i.series.map((s) => s.d)))].sort()
  return months.map((m) => {
    const v = items.map((i) => {
      const hit = i.series.find((s) => s.d === m)
      return hit ? (hit.p / i.series[0].p) * 100 : null
    }).filter((x) => x !== null)
    return { m, idx: median(v), n: v.length }
  })
}

function selfCheck() {
  const f = []
  const t = (n, c, d) => { if (!c) f.push(n); console.log(`  ${c ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`) }
  console.log('─────── self-check ───────')

  // 1차 결함 고정: 월별 창은 Fulldate가 없다. 그걸 읽으면 날짜가 undefined가 된다.
  const monthly = { 12: { result: [{ date: '25-09', minPrice: 100 }, { date: '25-10', minPrice: 150 }] } }
  const weekly = { 3: { result: [{ Fulldate: '26-06-09', date: '06-09', minPrice: 100 }, { Fulldate: '26-06-16', date: '06-16', minPrice: 150 }] } }
  t('월별 창에서 날짜를 읽는다', parseWindow(monthly, '12')?.every((x) => /^\d\d-\d\d$/.test(x.d)))
  t('주별 창에서 날짜를 읽는다', parseWindow(weekly, '3')?.every((x) => /^\d\d-\d\d-\d\d$/.test(x.d)))
  t('월별 창을 주별로 읽으면 버린다', parseWindow(monthly, '3') === null, 'Fulldate 없음 → null')
  t('빈 창은 null', parseWindow({ 12: { result: [] } }) === null)
  t('가격 0은 통째로 버린다', parseWindow({ 12: { result: [{ date: '25-09', minPrice: 0 }] } }) === null)

  const c = changeOf([{ d: 'a', p: 100 }, { d: 'b', p: 250 }])
  t('변동률 계산', c.pct === 150, `100→250 = +${c.pct}%`)
  t('한 점은 변동률 없음', changeOf([{ d: 'a', p: 1 }]) === null)
  t('중앙값 짝수', median([1, 2, 3, 4]) === 2.5)
  t('중앙값 홀수', median([3, 1, 2]) === 2)

  // 정규화가 실제로 규모를 지우는지 — 비싼 상품과 싼 상품이 같은 비율로 오르면 지수는 하나다
  const idx = indexOf([
    { series: [{ d: 'm1', p: 1000 }, { d: 'm2', p: 2000 }] },
    { series: [{ d: 'm1', p: 10 }, { d: 'm2', p: 20 }] },
  ])
  t('정규화가 가격 규모를 지운다', idx[1].idx === 200, `둘 다 2배 → 지수 ${idx[1].idx}`)
  t('달마다 관측 수를 남긴다', idx.every((x) => x.n === 2))

  console.log(`  ${11 - f.length}개 항목 · ${f.length ? f.length + '건 실패' : '전부 통과'}`)
  return f.length
}

async function main() {
  if (selfCheck() > 0) process.exit(1)
  const pool = JSON.parse(readFileSync(new URL('../data/pool.json', import.meta.url)))
  const targets = pool.items.filter((x) => /pcode=(\d+)/.test(x.url))
    .map((x) => ({ ...x, pcode: x.url.match(/pcode=(\d+)/)[1] }))

  console.log(`\n다나와 월별 시세 — 창 ${WINDOW}개월 · 대상 ${targets.length}건`)
  const out = []
  for (const [i, t] of targets.entries()) {
    const series = await trendOf(t.pcode)
    if (series) out.push({ pcode: t.pcode, name: t.name, group: t.group, url: t.url, series, change: changeOf(series) })
    process.stdout.write(`\r  ${i + 1}/${targets.length}  수집 ${out.length}건`)
    await nap(400)
  }
  console.log()

  const ok = out.filter((o) => o.change)
  const up = ok.filter((o) => o.change.pct > 0)
  const index = indexOf(ok)
  const summary = {
    crawledAt: new Date().toISOString(),
    source: 'prod.danawa.com/info/ajax/getProductPriceList.ajax.php',
    window: `${WINDOW}개월`, attempted: targets.length, measured: ok.length,
    monthsMax: Math.max(...ok.map((o) => o.change.months)),
    span: [index[0].m, index.at(-1).m],
    rising: up.length, risingShare: (up.length / ok.length) * 100,
    medianPct: median(ok.map((o) => o.change.pct)),
    indexEnd: index.at(-1).idx,
    index, items: out,
  }
  writeFileSync(new URL('../data/trend.json', import.meta.url), JSON.stringify(summary, null, 2))

  console.log(`\n  시계열 확보  ${ok.length}/${targets.length}건 · ${summary.span[0]} ~ ${summary.span[1]} (${summary.monthsMax}개월)`)
  console.log(`  상승 품목    ${up.length}건 (${summary.risingShare.toFixed(1)}%)`)
  console.log(`  중앙 변동률  ${summary.medianPct >= 0 ? '+' : ''}${summary.medianPct.toFixed(1)}%`)
  console.log(`  지수(첫달=100) 끝값 ${summary.indexEnd.toFixed(1)}`)
  console.log('\n  월별 지수')
  for (const p of index) console.log(`    ${p.m}  ${String(p.idx.toFixed(1)).padStart(7)}   n=${p.n}`)
  console.log('\n  상승 상위')
  for (const o of [...ok].sort((a, b) => b.change.pct - a.change.pct).slice(0, 6))
    console.log(`    ${((o.change.pct >= 0 ? '+' : '') + o.change.pct.toFixed(1) + '%').padEnd(11)}` +
      `${o.change.from.toLocaleString()} → ${o.change.to.toLocaleString()}원  ${o.name.slice(0, 38)}`)
  console.log('\n  → data/trend.json 저장')
}

if (fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  // 'check' 는 검사만 돌린다 — npm test 가 네트워크 없이 파싱 규칙을 고정한다
  if (process.argv[2] === 'check') process.exit(selfCheck() > 0 ? 1 : 0)
  await main()
}
