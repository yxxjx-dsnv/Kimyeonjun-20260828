import { chromium } from 'playwright'

const VPS = [[390,844],[414,900],[1512,950]]

function ovf(hostSel) {
  const host = document.querySelector(hostSel)
  if (!host) return [{ sel: 'MISSING ' + hostSel }]
  const W = host.clientWidth, L = host.getBoundingClientRect().left
  const scrollable = (e) => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      const ov = getComputedStyle(p).overflowX
      if (ov === 'auto' || ov === 'scroll' || ov === 'hidden') return true
      if (p === host) return false
    }
    return false
  }
  return [...host.querySelectorAll('*')]
    .filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > L + W + 1 && !scrollable(e) })
    .map(e => ({ sel: e.tagName.toLowerCase() + '.' + String(e.className.baseVal ?? e.className).slice(0, 42),
      over: Math.round(e.getBoundingClientRect().right - (L + W)),
      w: Math.round(e.getBoundingClientRect().width),
      txt: (e.textContent || '').trim().slice(0, 44) }))
}

function clip(hostSel) {
  const host = document.querySelector(hostSel); if (!host) return ['MISSING']
  return [...host.querySelectorAll('*')].filter(e => {
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || e.tagName === 'svg' || e.ownerSVGElement) return false
    const ovX = e.scrollWidth > e.clientWidth + 1, ovY = e.scrollHeight > e.clientHeight + 1
    if (!ovX && !ovY) return false
    if (/auto|scroll/.test(cs.overflowX + cs.overflowY)) return false
    if (cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none') return false
    if (cs.overflow === 'visible') return false
    return (e.textContent || '').trim().length > 0
  }).map(e => ({ sel: e.tagName.toLowerCase() + '.' + String(e.className.baseVal ?? e.className).slice(0, 40),
    sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight,
    txt: (e.textContent || '').trim().slice(0, 50) }))
}

function svgtxt(scope) {
  const out = []
  for (const svg of document.querySelectorAll(scope + ' svg')) {
    const sb = svg.getBoundingClientRect()
    for (const t of svg.querySelectorAll('text')) {
      const b = t.getBoundingClientRect()
      if (b.width === 0) continue
      const dl = sb.left - b.left, dr = b.right - sb.right, dt = sb.top - b.top, db = b.bottom - sb.bottom
      if (dl > 0.5 || dr > 0.5 || dt > 0.5 || db > 0.5)
        out.push({ cls: String(t.className.baseVal), txt: t.textContent,
          outLeft: +dl.toFixed(1), outRight: +dr.toFixed(1), outTop: +dt.toFixed(1), outBottom: +db.toFixed(1),
          svgW: Math.round(sb.width), svgOverflow: getComputedStyle(svg).overflow })
    }
  }
  return out
}

function cover() {
  const cta = document.querySelector('.cta'); if (!cta) return null
  const c = cta.getBoundingClientRect()
  const behind = []
  for (const e of document.querySelectorAll('.body *')) {
    if (cta.contains(e) || e.contains(cta) || e.children.length) continue
    const b = e.getBoundingClientRect()
    if (b.width === 0 || b.height === 0) continue
    if (b.top < c.bottom - 1 && b.bottom > c.top + 1 && b.left < c.right && b.right > c.left)
      behind.push({ sel: e.tagName.toLowerCase() + '.' + String(e.className).slice(0, 30),
        txt: (e.textContent || '').trim().slice(0, 30), top: Math.round(b.top), bottom: Math.round(b.bottom) })
  }
  const bodyEl = document.querySelector('.body')
  const bb = bodyEl.getBoundingClientRect()
  return { ctaPos: getComputedStyle(cta).position, ctaTop: Math.round(c.top), ctaBottom: Math.round(c.bottom),
    bodyBottom: Math.round(bb.bottom), vh: innerHeight, gapUnderCta: Math.round(bb.bottom - c.bottom),
    behind: behind.slice(0, 8) }
}

function geom() {
  const g = (s) => { const e = document.querySelector(s); if (!e) return null
    const b = e.getBoundingClientRect(); return { x: Math.round(b.left), w: Math.round(b.width), y: Math.round(b.top), h: Math.round(b.height) } }
  return { doc: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
    stage: g('.stage'), phone: g('.phone'), body: g('.body'), sheet: g('.sheet'), rail: g('.rail2--left') }
}

const scrollTo = (frac) => {
  const b = document.querySelector('.body')
  const sc = (b.scrollHeight > b.clientHeight + 2) ? b : document.scrollingElement
  sc.scrollTop = Math.round((sc.scrollHeight - sc.clientHeight) * frac)
  return { host: sc === b ? '.body' : 'page', top: sc.scrollTop, max: sc.scrollHeight - sc.clientHeight }
}

const br = await chromium.launch()
const P = (l, v) => console.log(l, JSON.stringify(v))

for (const [w, h] of VPS) {
  const page = await br.newPage({ viewport: { width: w, height: h } })
  console.log(`\n${'='.repeat(72)}\nVIEWPORT ${w}x${h}\n${'='.repeat(72)}`)
  await page.goto('http://localhost:3111/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.bcard')
  await page.click('.blist li:nth-child(1) .bcard')
  await page.waitForSelector('.odds')
  await page.waitForTimeout(600)

  console.log('\n--- [A] 상세 기본 ---')
  P('geom  ', await page.evaluate(geom))
  P('ovf   ', await page.evaluate(ovf, '.body'))
  P('clip  ', await page.evaluate(clip, '.body'))
  P('scroll', await page.evaluate(scrollTo, 1))
  await page.waitForTimeout(300)
  P('cta@bottom', await page.evaluate(cover))
  await page.screenshot({ path: `/tmp/yk_${w}_A_bottom.png` })
  P('scroll', await page.evaluate(scrollTo, 0.5))
  await page.waitForTimeout(250)
  P('cta@mid   ', await page.evaluate(cover))
  await page.screenshot({ path: `/tmp/yk_${w}_A_mid.png` })

  console.log('\n--- [B] 확률 근거 시트 ---')
  await page.evaluate(scrollTo, 0)
  await page.click('.odds__why')
  await page.waitForSelector('.sheet')
  await page.waitForTimeout(600)
  P('geom  ', await page.evaluate(geom))
  P('ovf   ', await page.evaluate(ovf, '.sheet'))
  P('clip  ', await page.evaluate(clip, '.sheet'))
  P('svgtxt', await page.evaluate(svgtxt, '.sheet'))
  P('binRow', await page.evaluate(() => [...document.querySelectorAll('.bin__row')].map(r =>
    ({ cells: [...r.children].map(c => ({ s: String(c.className).slice(0,14), w: Math.round(c.getBoundingClientRect().width), sw: c.scrollWidth, cw: c.clientWidth, t: c.textContent.trim().slice(0,22) })) }))))
  await page.screenshot({ path: `/tmp/yk_${w}_B_sheet.png` })

  // open the OddsTable
  const moreBtn = await page.$('.sheet .more__btn')
  if (moreBtn) {
    await moreBtn.click()
    await page.waitForSelector('.sheet .otable')
    await page.waitForTimeout(250)
    console.log('\n--- [C] 시트 + 더보기 표 열림 ---')
    P('ovf ', await page.evaluate(ovf, '.sheet'))
    P('clip', await page.evaluate(clip, '.sheet'))
    P('otable', await page.evaluate(() => { const t = document.querySelector('.otable'), m = t.closest('.more__body')
      return { tableSW: t.scrollWidth, tableCW: t.clientWidth, tableW: Math.round(t.getBoundingClientRect().width),
        bodyCW: m.clientWidth, bodyOvX: getComputedStyle(m).overflowX,
        cells: [...t.querySelectorAll('tbody tr:nth-child(10) td')].map(c => ({ w: Math.round(c.getBoundingClientRect().width), sw: c.scrollWidth, cw: c.clientWidth, t: c.textContent })),
        heads: [...t.querySelectorAll('th')].map(c => ({ w: Math.round(c.getBoundingClientRect().width), sw: c.scrollWidth, cw: c.clientWidth, t: c.textContent })) } }))
    await page.screenshot({ path: `/tmp/yk_${w}_C_table.png` })
    // scroll sheet to bottom
    await page.evaluate(() => { const s = document.querySelector('.sheet'); s.scrollTop = s.scrollHeight })
    await page.waitForTimeout(250)
    await page.screenshot({ path: `/tmp/yk_${w}_C_sheetbottom.png` })
    P('sheetScroll', await page.evaluate(() => { const s = document.querySelector('.sheet'); const b = s.getBoundingClientRect()
      return { sh: s.scrollHeight, ch: s.clientHeight, top: Math.round(b.top), bottom: Math.round(b.bottom), vh: innerHeight } }))
  }
  await page.click('.sheet .btn--ghost')
  await page.waitForTimeout(300)
  await page.close()
}
await br.close()
