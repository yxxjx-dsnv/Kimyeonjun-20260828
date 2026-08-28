import { chromium } from 'playwright'

const snap = async (p, label) => {
  const s = await p.evaluate(() => {
    const q = (s) => document.querySelector(s)
    const all = (s) => [...document.querySelectorAll(s)].map(e => e.textContent.trim())
    return {
      axisBadge: q('.taste__axis')?.textContent.trim() ?? null,
      bubbles: [...document.querySelectorAll('.bub')].map(e => e.className.replace('bub bub--','') + ': ' + e.textContent.trim()),
      chips: all('.taste__chips .chip'),
      chipCount: document.querySelectorAll('.taste__chips .chip').length,
      chipsBoxExists: !!q('.taste__chips'),
      note: q('.tiers__note')?.textContent.trim() ?? null,
      oddsS: q('.now__num')?.textContent.trim() ?? null,
      oddsNf: q('.now__nf')?.textContent.trim() ?? null,
      stock: q('.odds__stock')?.textContent.trim() ?? null,
      tiers: [...document.querySelectorAll('.tstrip')].map(e => e.textContent.trim().replace(/\s+/g,' ').slice(0,110)),
      inputDisabled: q('.taste__in input')?.disabled ?? null,
      err: q('.taste__err')?.textContent.trim() ?? null,
      // where is the note relative to viewport / to the taste box
      geo: (() => {
        const t = q('.taste'), n = q('.tiers__note'), o = q('.odds')
        const b = q('.body')
        const r = (e) => e ? { top: Math.round(e.getBoundingClientRect().top), h: Math.round(e.getBoundingClientRect().height) } : null
        return { taste: r(t), note: r(n), odds: r(o), bodyScrollTop: Math.round(b?.scrollTop||0), bodyH: Math.round(b?.clientHeight||0) }
      })(),
    }
  })
  console.log('\n===== ' + label + ' =====')
  console.log(JSON.stringify(s, null, 1))
  return s
}

const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 390, height: 844 } })
const net = []
p.on('response', async (r) => {
  if (r.url().includes('/api/curate')) {
    let j = null; try { j = await r.json() } catch {}
    net.push({ status: r.status(), reply: j?.reply, question: j?.question, options: j?.options,
      axis: j?.axis, pickedCount: j?.pickedCount, llmPicked: j?.llmPicked, usedFallback: j?.usedFallback,
      fallbackReason: j?.fallbackReason, rescuedIds: j?.rescuedIds, aiEnabled: j?.aiEnabled,
      odds: j?.odds, tierCounts: j?.tiers?.map(t=>`${t.tier}:${t.count}`) })
  }
})

await p.goto('http://localhost:3111/', { waitUntil: 'networkidle' })
await p.waitForSelector('.bcard')
await p.click('.blist li:nth-child(1) .bcard')
await p.waitForSelector('.odds')
const before = await snap(p, 'BEFORE (박스 상세 진입 직후)')

// turn 1
const t0 = Date.now()
await p.click('text=손주 줄 것도 넣어서')
await p.waitForSelector('.tiers__note', { timeout: 60000 })
await p.waitForFunction(() => !document.querySelector('.bub.is-busy'), null, { timeout: 60000 })
console.log('\n[턴1 응답 소요] ' + Math.round((Date.now()-t0)/1000) + 's')
const a1 = await snap(p, 'AFTER TURN 1')
await p.screenshot({ path: 'wf_tc_t1.png', fullPage: true })

// turn 2 — if there are chips, click one; else type
if (a1.chipCount > 0) {
  console.log('\n[턴2] 칩 클릭: ' + a1.chips[0])
  const t1 = Date.now()
  await p.click('.taste__chips .chip')
  await p.waitForFunction(() => !document.querySelector('.bub.is-busy'), null, { timeout: 60000 })
  console.log('[턴2 응답 소요] ' + Math.round((Date.now()-t1)/1000) + 's')
} else {
  console.log('\n[턴2] 칩이 0개 → 직접 타이핑해야 함')
  const t1 = Date.now()
  await p.fill('.taste__in input', '국물 요리 위주')
  await p.click('.taste__in .btn--ghost')
  await p.waitForFunction(() => !document.querySelector('.bub.is-busy'), null, { timeout: 60000 })
  console.log('[턴2 응답 소요] ' + Math.round((Date.now()-t1)/1000) + 's')
}
const a2 = await snap(p, 'AFTER TURN 2')
await p.screenshot({ path: 'wf_tc_t2.png', fullPage: true })

// turn 3 to check the >=2 userTurns rule
if (a2.chipCount > 0) {
  await p.click('.taste__chips .chip')
} else {
  await p.fill('.taste__in input', '가전 위주')
  await p.click('.taste__in .btn--ghost')
}
await p.waitForFunction(() => !document.querySelector('.bub.is-busy'), null, { timeout: 60000 })
const a3 = await snap(p, 'AFTER TURN 3')
await p.screenshot({ path: 'wf_tc_t3.png', fullPage: true })

console.log('\n===== /api/curate 응답 원본 =====')
console.log(JSON.stringify(net, null, 1))

console.log('\n===== 화면 변화 대조 =====')
console.log('oddsS: ' + before.oddsS + ' -> ' + a1.oddsS + ' -> ' + a2.oddsS + ' -> ' + a3.oddsS)
console.log('tiers[0] before: ' + before.tiers[0])
console.log('tiers[0] after1: ' + a1.tiers[0])
console.log('tiers[3] before: ' + before.tiers[3])
console.log('tiers[3] after1: ' + a1.tiers[3])
console.log('tiers[3] after3: ' + a3.tiers[3])

await b.close()
