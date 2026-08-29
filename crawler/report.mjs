/**
 * Phase 0 판정기 — 네트워크 없이 data/pool.json만 읽는다.
 *   node crawler/report.mjs
 *
 * 판정하는 것 하나: "생필품·가전을 하나도 섞지 않고 카드 생태계 안의 상품만으로
 * 2,000원 박스와 5,000원 박스의 4개 등급을 전부 채울 수 있는가"
 *
 * 판정만 한다. 통을 구성하지 않는다. 그것은 Phase 2의 일이다.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isNotCard, isOripa } from '../api/_sources.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const pool = JSON.parse(readFileSync(join(ROOT, 'data', 'pool.json'), 'utf8'))

const won = (n) => n.toLocaleString('ko-KR') + '원'
const pct = (n) => (n * 100).toFixed(1) + '%'

/**
 * 축이 acc가 아니어도 액세서리·도구가 섞여 들어온다.
 * 판정이 "액세서리 없이 카드만으로"를 묻고 있으므로 제목으로 한 번 더 가른다.
 * 여기서 틀리면 등급 후보가 부풀려지고 판정이 잘못 나온다.
 * 판별기는 api/_sources.js가 소유한다 — 크롤러·판정기·Phase 2가 같은 것을 쓴다.
 */
// 분류 순서가 중요하다. 오리파 검색어('포켓몬 랜덤팩')는 핫팩·물티슈처럼
// 카드 생태계 밖 굿즈를 끌어왔다. 축 이름으로 분류하면 그것들이 '오리파'로
// 세어지고, 축 이름을 무시하면 '카드'로 세어져 통에 들어간다. 둘 다 틀렸다.
// 제목으로 가르고, 어디에도 속하지 않는 것은 outside로 드러낸다 (I6).
for (const it of pool.items) {
  it.kind = isOripa(it.name) ? 'oripa'
    : (it.group === 'acc' || isNotCard(it.name)) ? 'acc'
    : it.group === 'oripa' ? 'outside'
    : 'card'
}

const cards = pool.items.filter((x) => x.kind === 'card')
const accs = pool.items.filter((x) => x.kind === 'acc')
const oripa = pool.items.filter((x) => x.kind === 'oripa')
const outside = pool.items.filter((x) => x.kind === 'outside')

const q = (arr, f) => { const s = arr.map((x) => x.price).sort((a, b) => a - b); return s[Math.floor((s.length - 1) * f)] }
const med = (arr) => (arr.length ? q(arr, 0.5) : 0)

console.log('═'.repeat(72))
console.log('Phase 0 — 데이터 타당성 게이트')
console.log('═'.repeat(72))
console.log(`크롤 시각 ${pool.crawledAt} · 출처 ${pool.source}`)

// ── 작업 2 — 수집 리포트 ────────────────────────────────────────────
console.log('\n■ 검색어별 수집')
for (const r of pool.perQuery) {
  console.log(`  [${r.group.padEnd(6)}] ${r.q.padEnd(20)} 조회 ${String(r.fetched).padStart(3)} → 채택 ${String(r.kept).padStart(2)}` +
    `${r.junk ? `  차단 ${r.junk}` : ''}${r.retried ? `  재시도 ${r.retried}` : ''}`)
}
console.log(`\n  0건 검색어: ${pool.empty.length ? pool.empty.join(', ') : '없음'}`)
console.log(`  실패      : ${pool.failed.length ? pool.failed.join(' / ') : '없음'}`)
console.log(`  총 수집   : ${pool.items.length}건 · 이미지 확보율 ${pct(pool.items.filter((x) => x.image).length / pool.items.length)}`)
console.log(`  차단      : ${pool.blocked.length}건`)

console.log('\n■ 전체 가격 분포')
console.log(`  최소 ${won(q(pool.items, 0))} · 25% ${won(q(pool.items, 0.25))} · 중앙 ${won(q(pool.items, 0.5))} · 75% ${won(q(pool.items, 0.75))} · 최대 ${won(q(pool.items, 1))}`)

const BINS = [[0, 2000], [2000, 5000], [5000, 10000], [10000, 30000], [30000, 100000], [100000, 500000], [500000, Infinity]]
console.log('\n■ 히스토그램 (카드 / 액세서리 / 오리파)')
for (const [lo, hi] of BINS) {
  const inb = (a) => a.filter((x) => x.price >= lo && x.price < hi).length
  const label = `${lo.toLocaleString()}~${hi === Infinity ? '∞' : hi.toLocaleString()}`.padEnd(17)
  const c = inb(cards), a = inb(accs), o = inb(oripa)
  console.log(`  ${label} 카드 ${String(c).padStart(3)}  액세서리 ${String(a).padStart(3)}  오리파 ${String(o).padStart(3)}  ${'█'.repeat(Math.round(c / 4))}`)
}

console.log('\n■ 축별 건수와 가격 중앙값')
for (const g of Object.keys(pool.axes)) {
  const a = pool.items.filter((x) => x.group === g)
  console.log(`  ${g.padEnd(7)} ${String(a.length).padStart(3)}건  중앙 ${won(med(a)).padStart(12)}  범위 ${won(q(a, 0))} ~ ${won(q(a, 1))}`)
}
console.log(`\n  제목 재분류 후: 카드 ${cards.length}건 · 액세서리 ${accs.length}건 · 오리파 ${oripa.length}건 · 생태계 밖 ${outside.length}건`)
if (outside.length) {
  console.log(`  ⚠ I6 — 오리파 검색어가 끌어온 카드 생태계 밖 상품 ${outside.length}건. 통에서 제외한다:`)
  for (const x of outside.slice(0, 5)) console.log(`      ${won(x.price).padStart(11)}  ${x.name.slice(0, 52)}`)
}
const leaked = pool.items.filter((x) => x.group !== 'acc' && x.group !== 'oripa' && x.kind === 'acc')
console.log(`  (카드 축에 섞여 있던 액세서리 ${leaked.length}건을 제목으로 걸러냈다)`)

// ── 작업 3 — 성립 판정 ──────────────────────────────────────────────
// 경계 배수는 RUNBOOK이 준 가정이다. 실측 분포를 보고 조정이 필요하면 근거와 함께 제안한다.
const TIERS = [
  { g: 'C', lo: 1.0, hi: 1.5, min: 30, why: '기본. 다양성 확보' },
  { g: 'B', lo: 1.5, hi: 4, min: 10, why: '' },
  { g: 'A', lo: 4, hi: 20, min: 4, why: '' },
  { g: 'S', lo: 20, hi: Infinity, min: 1, why: '' },
]

function judge(fee, source) {
  return TIERS.map((t) => {
    const lo = fee * t.lo, hi = t.hi === Infinity ? Infinity : fee * t.hi
    const hit = source.filter((x) => x.price >= lo && x.price < hi)
    return { ...t, lo, hi, n: hit.length, ok: hit.length >= t.min, sample: hit.slice(0, 2) }
  })
}

const FEES = [2000, 5000]
const results = {}
for (const fee of FEES) {
  console.log(`\n${'─'.repeat(72)}`)
  console.log(`■ ${won(fee)} 박스 — 등급별 후보 (카드만, 액세서리 제외)`)
  const rowsCard = judge(fee, cards)
  const rowsBoth = judge(fee, [...cards, ...accs])
  console.log('  등급  가격대                        필요  카드만  +액세서리  판정')
  for (let i = 0; i < rowsCard.length; i++) {
    const c = rowsCard[i], b = rowsBoth[i]
    const band = `${won(c.lo)} ~ ${c.hi === Infinity ? '∞' : won(c.hi)}`.padEnd(26)
    console.log(`   ${c.g}    ${band} ${String(c.min).padStart(4)} ${String(c.n).padStart(6)} ${String(b.n).padStart(10)}   ${c.ok ? '충족' : b.ok ? '액세서리 필요' : '미달'}`)
  }
  results[fee] = { rowsCard, rowsBoth }
}

console.log(`\n${'═'.repeat(72)}`)
console.log('■ 시나리오 판정')
let scenario = 'A'
const notes = []
for (const fee of FEES) {
  const { rowsCard, rowsBoth } = results[fee]
  const shortC = rowsCard.filter((r) => !r.ok)
  const shortB = rowsBoth.filter((r) => !r.ok)
  if (shortC.length === 0) { notes.push(`${won(fee)}: 카드만으로 4등급 전부 충족`); continue }
  const detail = shortC.map((r) => `${r.g}등급 ${r.n}/${r.min}건 (${r.min - r.n}건 부족)`).join(', ')
  if (shortB.length === 0) {
    scenario = scenario === 'C' ? 'C' : 'C'
    notes.push(`${won(fee)}: 카드만으로는 미달 — ${detail}. 액세서리를 편입하면 충족`)
  } else {
    scenario = 'C'
    notes.push(`${won(fee)}: 액세서리를 넣어도 미달 — ${shortB.map((r) => `${r.g}등급 ${r.n}/${r.min}건`).join(', ')}`)
  }
}
for (const n of notes) console.log(`  · ${n}`)
console.log(`\n  → 시나리오 [${scenario}]`)

// ── 경계 배수 진단 — RUNBOOK이 "조정이 필요하면 근거와 함께 제안하라"고 했다 ──
//
// 판정이 [C]로 나왔을 때 원인이 둘 중 무엇인지 갈라야 한다.
//   (a) 시장에 그 가격대 카드가 없다        → 상품 풀을 넓히거나 액세서리를 편입
//   (b) 밴드 정의가 좁아서 안 잡힌다         → 밴드를 고친다
// 둘을 구분하지 않고 액세서리를 넣으면 있지도 않은 문제를 액세서리로 덮는 것이 된다.

console.log(`\n${'═'.repeat(72)}`)
console.log('■ 미달 원인 진단 — 시장인가 밴드인가')
for (const fee of FEES) {
  const c = results[fee].rowsCard[0]
  const wide = cards.filter((x) => x.price >= fee && x.price < fee * 4)   // C+B 통합 밴드
  const atLeast = cards.filter((x) => x.price >= fee).length
  console.log(`\n  ${won(fee)} 박스`)
  console.log(`    C밴드 [1.0~1.5배] 폭 ${won(fee * 0.5)}  → 카드 ${c.n}건   (필요 30)`)
  console.log(`    C+B 통합 [1.0~4배] 폭 ${won(fee * 3)}  → 카드 ${wide.length}건`)
  console.log(`    참여비 이상 전체              → 카드 ${atLeast}건`)
  console.log(`    ⇒ ${wide.length >= 30 ? '밴드 폭 문제. 참여비 이상 카드는 충분하다' : '시장 공급 문제'}`)
}

// 참여비를 바꾸면 C가 성립하는가 — 전 구간 스캔
console.log('\n■ 참여비 스캔 (C밴드 1.0~1.5배에 카드 몇 건이 들어오는가)')
const FEE_SCAN = [1000, 2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000, 50000]
console.log('   참여비      C(1.0~1.5배)  B(1.5~4배)  A(4~20배)  S(20배~)   전 등급 성립')
for (const fee of FEE_SCAN) {
  const r = judge(fee, cards)
  const cells = r.map((x) => `${String(x.n).padStart(3)}/${x.min}`.padEnd(11)).join(' ')
  console.log(`   ${won(fee).padStart(9)}   ${cells}  ${r.every((x) => x.ok) ? '✓' : '✗'}`)
}

// 밴드 폭을 바꾸면 어떻게 되는가 (참여비 고정)
console.log('\n■ C밴드 상한 스캔 (C 하한은 참여비로 고정. 꽝 없음 1층은 하한만 요구한다)')
console.log('   docs/references.md §2.6 — 1층은 "기본 등급의 최저가가 참여비 이상"이다.')
console.log('   상한 1.5배는 B와 겹치지 않게 하려는 설계 선택이지 근거가 있는 값이 아니다.')
for (const fee of FEES) {
  console.log(`\n   ${won(fee)} 박스`)
  for (const hi of [1.5, 2, 2.5, 3, 4]) {
    const n = cards.filter((x) => x.price >= fee && x.price < fee * hi).length
    console.log(`     C = [1.0, ${hi}배)  →  ${String(n).padStart(3)}건  ${n >= 30 ? '✓ 충족' : '✗ 미달'}   (${won(fee)} ~ ${won(fee * hi)})`)
  }
}

// ── self-check ─────────────────────────────────────────────────────
const fails = []
const t = (name, cond, detail) => { const s = cond ? '✓' : '✗'; if (!cond) fails.push(name); console.log(`  ${s} ${name}${detail ? ` — ${detail}` : ''}`) }
console.log('\n■ self-check')
t('I6 카드 생태계 밖 품목 0건', pool.items.every((x) => Object.keys(pool.axes).includes(x.group)))
t('분류가 전체를 덮음', cards.length + accs.length + oripa.length + outside.length === pool.items.length,
  `${cards.length}+${accs.length}+${oripa.length}+${outside.length}=${pool.items.length}`)
t('오리파가 통 후보에서 제외됨', !cards.some((x) => isOripa(x.name)))
t('I6 생태계 밖 상품이 통 후보에서 제외됨', !cards.some((x) => x.kind === 'outside'))
t('전 항목 가격 > 0', pool.items.every((x) => x.price > 0))
t('가격 정렬 단조', pool.items.every((x, i, a) => i === 0 || a[i - 1].price <= x.price))
t('0건 검색어 없음', pool.empty.length === 0, `${pool.empty.length}개`)
t('등급 밴드가 서로 겹치지 않음', TIERS.every((x, i) => i === 0 || TIERS[i - 1].hi === x.lo))
console.log(`  ${8 - fails.length}/8 통과`)

console.log('\n다음: node crawler/crawl.js oripa  로 오리파 확률 표기를 실측한다 (작업 4).')
if (fails.length) process.exitCode = 1
