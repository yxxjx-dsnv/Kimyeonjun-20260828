// data/trend.json → 문서용 SVG + 발표자료용 pgfplots 좌표.
// 두 산출물이 한 데이터에서 나오므로 서로 어긋날 수 없다.
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

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

// ══════════════════════════════════════════════════════════════════════
// 발표자료용 도표 데이터 — 덱의 모든 그래프가 여기서 나온다.
// 슬라이드에 손으로 적은 좌표가 하나도 없게 만드는 것이 목적이다.
//   node crawler/chart.mjs  →  docs/deck-data.tex
// ══════════════════════════════════════════════════════════════════════
import { BOX, BOXES, K, N, FEE, slotsOf, TIERS } from '../api/_box.js'
import { pSolo, pTeam, teamMultiple, pUpdated } from '../api/_draw.js'
import { econOf } from '../api/_econ.js'

const D = []
const def = (k, v) => D.push(`\\def\\${k}{${v}}`)
const f1 = (x) => x.toFixed(1)

// ── 1. 오리파 실태 (직접 크롤) ──────────────────────────────────────
const au = JSON.parse(readFileSync(new URL('../data/oripa-audit.json', import.meta.url)))
def('oripaTotal', au.oripaTotal)
def('oripaProbNum', au.probNum)
def('oripaGuarantee', au.guarantee)
def('oripaGuaranteePct', f1((au.guarantee / au.oripaTotal) * 100))
def('oripaAxisTotal', au.axisTotal)
def('oripaReached', `${au.detailReached}/${au.detailAttempted}`)

// ── 2. 크롤 규모와 가격 분포 ────────────────────────────────────────
const pool = JSON.parse(readFileSync(new URL('../data/pool.json', import.meta.url)))
const prices = pool.items.map((i) => i.price).filter((p) => p > 0).sort((a, b) => a - b)
const q = (p) => prices[Math.floor((prices.length - 1) * p)]
def('crawlTotal', pool.items.length)
def('crawlQueries', pool.queries.length)
def('crawlAt', pool.crawledAt.slice(0, 10))
// 축별 건수 — 덱이 "그레이딩이 가장 큰 축"이라고 말하므로 그 값도 코드에서 가져간다
const byGroup = {}
for (const it of pool.items) byGroup[it.group] = (byGroup[it.group] || 0) + 1
def('crawlGrade', byGroup.grade)
def('crawlOripaAxis', byGroup.oripa)
def('priceMin', prices[0].toLocaleString('ko-KR'))
def('priceMed', q(0.5).toLocaleString('ko-KR'))
def('priceMax', prices.at(-1).toLocaleString('ko-KR'))

// 가격대 히스토그램 — 로그 구간. 막대 좌표를 그대로 넘긴다
const EDGES = [0, 2e3, 5e3, 1e4, 3e4, 1e5, 5e5, Infinity]
const ELAB = ['~2천', '2~5천', '5천~1만', '1~3만', '3~10만', '10~50만', '50만~']
const hist = EDGES.slice(0, -1).map((lo, i) => prices.filter((p) => p >= lo && p < EDGES[i + 1]).length)
def('histCoords', hist.map((c, i) => `(${i},${c})`).join(''))
def('histLabels', ELAB.map((l, i) => `${i}/${l}`).join(','))
def('histMax', Math.max(...hist))

// ── 3. 인원별 팀 확률 (초기하분포) ──────────────────────────────────
for (const g of ['S', 'A', 'B']) {
  def(`odds${g}Coords`, Array.from({ length: 10 }, (_, i) => `(${i + 1},${(pTeam(K[g], i + 1) * 100).toFixed(4)})`).join(''))
  def(`odds${g}Solo`, (pSolo(K[g]) * 100).toFixed(3))
  def(`odds${g}Ten`, (pTeam(K[g], 10) * 100).toFixed(3))
  def(`odds${g}Mult`, teamMultiple(K[g], 10).toFixed(2))
}

// ── 4. 비복원 갱신 확률 — 천장을 대체하는 곡선 ──────────────────────
const JS = [0, 250, 500, 750, 900, 950, 990]
def('updSCoords', JS.map((j) => `(${j},${(pUpdated(K.S, j) * 100).toFixed(3)})`).join(''))
def('updACoords', JS.map((j) => `(${j},${(pUpdated(K.A, j) * 100).toFixed(3)})`).join(''))
def('updSEnd', (pUpdated(K.S, 990) * 100).toFixed(1))

// ── 5. 교환 전환율 — 선호 이질성이 전부다 ───────────────────────────
const cv = JSON.parse(readFileSync(new URL('../data/conversion.json', import.meta.url)))
const row = (m, k) => cv.models[m].rows.find((r) => r.k === k)
def('tradeHomoOne', f1(row('homogeneous', 1).movedByTrade * 100))
def('tradeHeteroOne', f1(row('heterogeneous', 1).movedByTrade * 100))
def('tradeHomoCoords', cv.models.homogeneous.rows.map((r, i) => `(${i},${(r.movedByTrade * 100).toFixed(2)})`).join(''))
def('tradeHeteroCoords', cv.models.heterogeneous.rows.map((r, i) => `(${i},${(r.movedByTrade * 100).toFixed(2)})`).join(''))
def('tradeKLabels', cv.models.homogeneous.rows.map((r, i) => `${i}/${r.k}명`).join(','))
def('tradeImproved', f1(row('heterogeneous', 1).improvedRate * 100))
def('tradeTrials', cv.trials.toLocaleString('en-US'))

// ── 6. 통 구성 ──────────────────────────────────────────────────────
const slots = slotsOf(BOX)
def('boxN', N.toLocaleString('ko-KR'))
def('boxFee', FEE.toLocaleString('ko-KR'))
for (const g of TIERS) def(`boxK${g}`, K[g])
def('boxValue', Math.round(slots.reduce((s, x) => s + x.price, 0)).toLocaleString('ko-KR'))

// ── 7. 가치 집중도 — D12(Heck 2026)와 같은 절단점에서 비교 ──────────
// 논문: 상위 19.1%(Rare)가 매출의 58.8%. 우리 통을 같은 절단점으로 자른다.
const PAPER_CUT = 0.191, PAPER_SHARE = 58.8
const sortedV = slots.map((s) => s.price).sort((a, b) => b - a)
const cut = Math.round(sortedV.length * PAPER_CUT)
const total = sortedV.reduce((a, b) => a + b, 0)
const ourShare = (sortedV.slice(0, cut).reduce((a, b) => a + b, 0) / total) * 100
def('concCut', f1(PAPER_CUT * 100))
def('concPaper', f1(PAPER_SHARE))
def('concOurs', f1(ourShare))
def('concRatio', (PAPER_SHARE / ourShare).toFixed(2))

// ── 8. 단위 경제 — 마진은 확률이 아니라 매입에서 나온다 ─────────────
const ec = econOf(BOX, 0.60)
def('econRevenue', Math.round(ec.revenue / 1e4).toLocaleString('ko-KR'))
def('econPayout', Math.round(ec.payout / 1e4).toLocaleString('ko-KR'))
def('econBreakEven', f1(ec.breakEven * 100))
def('econMargin', f1(ec.margin * 100))
def('econSShare', f1((ec.byTier.S.value / ec.revenue) * 100))
def('econCShare', f1((ec.byTier.C.value / ec.revenue) * 100))
def('econTierCoords', TIERS.map((g, i) => `(${i},${((ec.byTier[g].value / ec.revenue) * 100).toFixed(1)})`).join(''))
def('econTierLabels', TIERS.map((g, i) => `${i}/${g} ${K[g]}장`).join(','))
def('econBoxCount', BOXES.length)

// ── 9. self-check 총 항목 수 ────────────────────────────────────────
// 덱이 이 숫자를 말하는데 손으로 적으면 검사를 추가할 때마다 조용히 낡는다.
// 실제로 돌려서 세고, 못 세면 실패한다 — 틀린 수를 싣느니 빌드를 멈춘다.
const out = execSync('npm test', { cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const counts = [...out.matchAll(/(\d+)개(?: 항목 ·)? (?:전부 )?통과/g)].map((m) => Number(m[1]))
if (!counts.length) throw new Error('self-check 항목 수를 세지 못했다')
def('checkTotal', counts.reduce((a, b) => a + b, 0))

writeFileSync(new URL('../docs/deck-data.tex', import.meta.url),
  `% crawler/chart.mjs 가 생성한다. 직접 고치지 말 것 — 고치면 코드와 어긋난다.\n${D.join('\n')}\n`)
console.log(`  → docs/deck-data.tex (${D.length}개 값)`)
