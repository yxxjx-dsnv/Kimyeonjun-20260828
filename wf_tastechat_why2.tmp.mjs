import { chromium } from 'playwright'
const CHIPS = ['주방 살림 위주로', '손주 줄 것도 넣어서', '내가 쓸 것 위주로', '먹거리 위주로']
const b = await chromium.launch()
for (const c of CHIPS) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } })
  let res = null
  p.on('response', async (r) => { if (r.url().includes('/api/curate')) { try { res = await r.json() } catch {} } })
  await p.goto('http://localhost:3111/', { waitUntil: 'networkidle' })
  await p.waitForSelector('.bcard'); await p.click('.blist li:nth-child(1) .bcard'); await p.waitForSelector('.odds')
  const baseC = await p.$$eval('.tstrip', es => es.map(e => (e.textContent.match(/후보 (\d+)개/)||[])[1]))
  await p.click(`text=${c}`)
  await p.waitForSelector('.tiers__note', { timeout: 60000 })
  await p.waitForFunction(() => !document.querySelector('.bub.is-busy'), null, { timeout: 60000 })
  const after = await p.evaluate(() => {
    const inner = window.innerHeight
    const n = document.querySelector('.tiers__note')
    const t = document.querySelector('.taste')
    const nb = n.getBoundingClientRect(), tb = t.getBoundingClientRect()
    return {
      chips: document.querySelectorAll('.taste__chips .chip').length,
      chipsBox: !!document.querySelector('.taste__chips'),
      axis: document.querySelector('.taste__axis')?.textContent,
      note: n.textContent.trim(),
      lastReply: [...document.querySelectorAll('.bub--assistant')].pop()?.textContent.trim(),
      counts: [...document.querySelectorAll('.tstrip')].map(e => (e.textContent.match(/후보 (\d+)개/)||[])[1]),
      innerH: inner, noteTop: Math.round(nb.top), tasteBottom: Math.round(tb.bottom),
      noteBelowFold: nb.top > inner,
      gapPx: Math.round(nb.top - tb.bottom),
    }
  })
  console.log('\n### 칩: ' + c)
  console.log(' question=' + JSON.stringify(res?.question) + '  options=' + JSON.stringify(res?.options) + '  chips화면=' + after.chips + ' (컨테이너 ' + after.chipsBox + ')')
  console.log(' reply="' + after.lastReply + '"')
  console.log(' axis배지="' + after.axis + '"  note="' + after.note + '"')
  console.log(' usedFallback=' + res?.usedFallback + ' reason=' + res?.fallbackReason + ' llmPicked=' + res?.llmPicked + ' pickedCount=' + res?.pickedCount)
  console.log(' 티어 후보수 S/A/B/C  전:' + baseC.join('/') + '  후:' + after.counts.join('/'))
  console.log(' 배치: innerH=' + after.innerH + ' taste하단=' + after.tasteBottom + ' note상단=' + after.noteTop + ' 사이간격=' + after.gapPx + 'px  폴드아래=' + after.noteBelowFold)
  await p.close()
}
await b.close()
