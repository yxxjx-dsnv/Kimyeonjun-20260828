// data/trend.json → 문서용 SVG + 발표자료용 pgfplots 좌표.
// 두 산출물이 한 데이터에서 나오므로 서로 어긋날 수 없다.
import { readFileSync, writeFileSync } from 'node:fs'

const t = JSON.parse(readFileSync(new URL('../data/trend.json', import.meta.url)))
const pts = t.index
const W = 720, H = 300, L = 52, R = 16, T = 24, B = 46
const lo = Math.floor(Math.min(...pts.map((p) => p.idx)) / 5) * 5 - 5
const hi = Math.ceil(Math.max(...pts.map((p) => p.idx)) / 5) * 5 + 5
const x = (i) => L + (i / (pts.length - 1)) * (W - L - R)
const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.idx).toFixed(1)}`).join(' ')
// 면적은 기준선 100에서 잰다 — 축 바닥(임의값)까지 채우면 상승폭을 과장한다
const area = `${path} L${x(pts.length - 1).toFixed(1)} ${y(100)} L${x(0).toFixed(1)} ${y(100)} Z`
const grid = []
for (let v = lo; v <= hi; v += 5) grid.push(v)

// 상승 구간(지수가 처음으로 100을 넘어 유지되는 달)을 데이터에서 찾는다 — 손으로 적지 않는다
let riseFrom = pts.findIndex((p, i) => i > 0 && p.idx > 100 && pts.slice(i).every((q) => q.idx > 100))
if (riseFrom < 1) riseFrom = pts.length - 1

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<rect width="${W}" height="${H}" fill="#fff"/>
${grid.map((v) => `<line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="${v === 100 ? '#c9ced6' : '#eef0f3'}" stroke-width="1"${v === 100 ? ' stroke-dasharray="4 3"' : ''}/><text x="${L - 8}" y="${(y(v) + 4).toFixed(1)}" font-size="11" fill="#8b93a1" text-anchor="end">${v}</text>`).join('')}
<rect x="${x(riseFrom).toFixed(1)}" y="${T}" width="${(x(pts.length - 1) - x(riseFrom)).toFixed(1)}" height="${H - T - B}" fill="#ea3f48" opacity="0.05"/>
<path d="${area}" fill="#ea3f48" opacity="0.09"/>
<path d="${path}" fill="none" stroke="#ea3f48" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.idx).toFixed(1)}" r="3" fill="#fff" stroke="#ea3f48" stroke-width="2"/>`).join('')}
${pts.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${H - B + 18}" font-size="10.5" fill="#6b7280" text-anchor="middle">${p.m.slice(3)}</text>`).join('')}
<text x="${L}" y="${H - 8}" font-size="10.5" fill="#8b93a1">${pts[0].m.replace('-', '년 ')}월 → ${pts.at(-1).m.replace('-', '년 ')}월 · 다나와 월별 최저가 · 상품 ${t.measured}종 · 각 상품 첫 달을 100으로 정규화한 중앙값</text>
<text x="${x(pts.length - 1).toFixed(1)}" y="${(y(pts.at(-1).idx) - 12).toFixed(1)}" font-size="13" font-weight="700" fill="#ea3f48" text-anchor="end">${pts.at(-1).idx.toFixed(1)}</text>
<text x="${L}" y="${T - 8}" font-size="12" font-weight="600" fill="#111827">포켓몬 카드 가격지수 (첫 달 = 100)</text>
</svg>`
writeFileSync(new URL('../docs/img/trend.svg', import.meta.url), svg)

const tex = `% crawler/chart.mjs 가 data/trend.json 에서 생성한다. 직접 고치지 말 것.
\\def\\trendMeasured{${t.measured}}
\\def\\trendSpanFrom{${pts[0].m}}
\\def\\trendSpanTo{${pts.at(-1).m}}
\\def\\trendRisingShare{${t.risingShare.toFixed(1)}}
\\def\\trendMedianPct{${t.medianPct.toFixed(1)}}
\\def\\trendIndexEnd{${t.indexEnd.toFixed(1)}}
\\def\\trendCoords{${pts.map((p, i) => `(${i},${p.idx.toFixed(2)})`).join('')}}
\\def\\trendLabels{${pts.map((p, i) => `${i}/${p.m.slice(3)}`).join(',')}}
`
writeFileSync(new URL('../docs/trend-data.tex', import.meta.url), tex)

console.log(`지수 ${pts[0].m} ~ ${pts.at(-1).m} · ${pts.length}달 · 끝값 ${pts.at(-1).idx.toFixed(1)}`)
console.log(`상승 전환 ${pts[riseFrom].m} (데이터에서 유도)`)
console.log('  → docs/img/trend.svg')
console.log('  → docs/trend-data.tex')
