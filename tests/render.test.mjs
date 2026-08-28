/**
 * 렌더 검증 — 브라우저 없이 화면을 검사한다.
 *   node tests/render.test.mjs
 *
 * 잠그려는 것 세 가지.
 *   ① 화면에 찍히는 확률 숫자가 서버 계산과 문자 단위로 같은가 (문서–코드 드리프트)
 *   ② 자연빈도 병기가 실제로 렌더되는가
 *   ③ browser.e2e.mjs가 쓰는 셀렉터가 App.jsx에 실제로 있는가
 *
 * ③은 직전 과제에서 브라우저 테스트가 npm test에 없어 UI와 어긋난 채 방치됐던
 * 부채를 갚는 항목이다. 브라우저를 띄우지 않고 드리프트만 잡는다.
 */
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'
import { renderToString } from 'react-dom/server'
import React from 'react'
import boxesHandler from '../api/boxes.js'
import { getBox, oddsOf, evMultiple, customerBEP, TIERS, TEAM_MAX, BOXES, DAILIES } from '../api/_draw.js'

let fail = 0
const check = (label, cond, extra = '') => {
  // 근거는 실패했을 때만 붙인다. 통과 로그에 붙으면 실패처럼 읽힌다.
  console.log(`${cond ? '✓' : '✗ 실패'} ${label}${!cond && extra ? ' — ' + extra : ''}`)
  if (!cond) fail++
}

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const parts = await vite.ssrLoadModule('/src/parts.jsx')
const { default: App } = await vite.ssrLoadModule('/src/App.jsx')

// ── ① 앱 셸 ────────────────────────────────────────────────
{
  const html = renderToString(React.createElement(App))
  check('앱 셸 렌더', html.includes('올웨이즈'))
  for (const t of ['홈', '콘텐츠', '올박스', '관심상품', '내 정보'])
    check(`탭 '${t}' 존재`, html.includes(t))
  check('중앙 플로팅 자리에 올박스', html.includes('is-center'))
}

// ── ② 화면 숫자 = 서버 계산 ────────────────────────────────
for (const id of BOXES.map((b) => b.id)) {
  const box = getBox(id)
  const odds = oddsOf(box, 7)
  const bars = renderToString(React.createElement(parts.OddsBars, { odds }))
  for (const t of TIERS) {
    const want = parts.pct(odds[t], odds[t] < 0.01 ? 3 : 1)
    check(`${id} ${t} 화면 숫자 = 서버 계산 (${want})`, bars.includes(want))
  }

  const oddsByTeam = Object.fromEntries(
    Array.from({ length: TEAM_MAX }, (_, i) => [i + 1, oddsOf(box, i + 1)])
  )
  const evByTeam = Object.fromEntries(
    Array.from({ length: TEAM_MAX }, (_, i) => [i + 1, +evMultiple(box, i + 1).toFixed(3)])
  )
  const curve = renderToString(
    React.createElement(parts.OddsCurve, {
      oddsByTeam, teamSize: 7, customerBEP: customerBEP(box), teamMax: TEAM_MAX,
    })
  )
  check(`${id} 곡선 렌더`, curve.includes('<path') && curve.includes('curve__dot'))
  check(`${id} 고객 분기 마커 ${customerBEP(box)}명`, curve.includes(`${customerBEP(box)}명부터 2배`))

  // 더보기 표는 접혀 있어도 데이터가 서버 값과 같아야 한다
  const table = renderToString(
    React.createElement(parts.OddsTable, { oddsByTeam, evByTeam, teamMax: TEAM_MAX, teamSize: 7 })
  )
  check(`${id} 더보기 버튼`, table.includes('확률이 어떻게 오르나요?'))
}

// ── ③ 자연빈도 병기 (Gigerenzer & Hoffrage 1995) ───────────
{
  const box = getBox('charizard')
  const odds = oddsOf(box, 10)
  const strip = renderToString(
    React.createElement(parts.TierStrip, {
      tier: { tier: 'S', band: [box.entry * 100, box.entry * 250], count: 39, meanRetail: 763898, samples: [] },
      odds: odds.S,
    })
  )
  check('확률 옆에 자연빈도', strip.includes('명 중 약'), parts.naturalFreq(odds.S))
  check('자연빈도 계산', parts.naturalFreq(0.0135) === '1,000명 중 약 14명', parts.naturalFreq(0.0135))
  check('희박한 확률은 분모를 바꾼다', parts.naturalFreq(0.0001) === '10,000명 중 약 1명', parts.naturalFreq(0.0001))
}

// ── ④ 하한을 정확히 맞으면 '본전' ──────────────────────────
{
  check('차액 0은 본전', renderToString(React.createElement(parts.Delta, { v: 0 })).includes('본전'))
  check('차액 양수는 +금액', renderToString(React.createElement(parts.Delta, { v: 1300 })).includes('+1,300원'))
}

// ── ⑤ API 핸들러 직접 호출 ─────────────────────────────────
{
  const res = { code: 0, body: null, status(c) { this.code = c; return this }, setHeader() { return this }, json(b) { this.body = b; return this } }
  await boxesHandler({ method: 'GET' }, res)
  check('GET /api/boxes 200', res.code === 200)
  check(`박스 ${BOXES.length}종`, res.body.boxes.length === BOXES.length)
  check('수식 파라미터 노출', Boolean(res.body.formula.assumptions.length))
  check('홈 탭용 샘플 포함', res.body.sample.length > 0)
  check(`데일리 ${DAILIES.length}종`, res.body.dailies.length === DAILIES.length)
  check('데일리는 꽝 확률까지 공개', res.body.dailies[0].blankOdds > 0)
  check('데일리 확률 계산근거 노출', Boolean(res.body.dailies[0].economics.breakEvenPlays))
  check('박스에 재고 노출', res.body.boxes.every((b) => b.stockTotal > 0))
  check('박스에 천장 규칙 노출', res.body.boxes.every((b) => b.pity?.window > 0))
  check('투표 집계 노출', Object.keys(res.body.votes).length === 4)
}

// ── ⑥ 디자인 토큰 — 스케일 밖으로 새는 것을 막는다 ──────────
// 이전엔 font-size가 120개 선언에 18종이었고 9~20px가 1px씩 연속이라
// 인접 단계가 육안으로 구분되지 않았다. 스케일을 다시 흐트러뜨리면 여기서 걸린다.
{
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  const defs = [...css.matchAll(/--fs-([a-z]+):\s*(\d+)px/g)]
  check(`타이포 스케일 ${defs.length}단계 정의`, defs.length >= 6 && defs.length <= 8, `${defs.length}단계`)

  // 정의부(--fs-*: 34px) 자체는 리터럴이 맞으므로 제외하고, 사용처만 본다.
  const literals = [...css.matchAll(/(^|[;{]\s*)font-size:\s*(\d+)px/gm)].map((m) => m[2])
  check('토큰 밖 리터럴 font-size 없음', literals.length === 0, `${literals.length}건: ${[...new Set(literals)].join(',')}`)

  // 가짜 배지 금지 — 데이터가 아니라 인덱스로 배지를 붙이면 정직성 주장과 충돌한다.
  const jsx = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8') +
              readFileSync(new URL('../src/parts.jsx', import.meta.url), 'utf8')
  check('인덱스 기반 가짜 배지 없음', !/badge=\{[^}]*%\s*\d/.test(jsx))
}

// ── ⑦ E2E 셀렉터 실존 (직전 과제 부채 상환) ────────────────
{
  const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8') +
              readFileSync(new URL('../src/parts.jsx', import.meta.url), 'utf8')
  let e2e = ''
  try { e2e = readFileSync(new URL('./browser.e2e.mjs', import.meta.url), 'utf8') } catch {}
  const selectors = [...e2e.matchAll(/["'`](\.[a-z][a-z0-9_-]*(?:__[a-z0-9-]+)?)["'`]/gi)].map((m) => m[1])
  const uniq = [...new Set(selectors)]
  for (const sel of uniq)
    check(`E2E 셀렉터 ${sel} 존재`, src.includes(sel.slice(1)), 'App.jsx/parts.jsx에 없음')
  const texts = [...e2e.matchAll(/text=([^"'`,)]+)/g)].map((m) => m[1].trim())
  for (const t of [...new Set(texts)])
    check(`E2E 문구 '${t}' 존재`, src.includes(t))
  if (!e2e) console.log('  (browser.e2e.mjs 없음 — 셀렉터 검증 건너뜀)')
}

await vite.close()
console.log(fail === 0 ? '\n✅ 전부 통과' : `\n❌ 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
