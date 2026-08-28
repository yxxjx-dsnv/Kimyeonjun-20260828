import { chromium } from 'playwright'

const VPS = [ {w:390,h:844}, {w:414,h:900}, {w:1512,h:950} ]
const URL = 'http://localhost:3111/'

const PROBE = () => {
  const host = document.querySelector('.body')
  if (!host) return { err: 'no .body' }
  const W = host.clientWidth, L = host.getBoundingClientRect().left
  const scrollable = (e) => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      const ov = getComputedStyle(p).overflowX
      if (ov === 'auto' || ov === 'scroll' || ov === 'hidden') return true
      if (p === host) return false
    }
    return false
  }
  const nm = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '')
  const all = [...document.querySelectorAll('.body *')]
  const overflow = all.filter(e => {
    const b = e.getBoundingClientRect()
    return b.width > 0 && b.right > L + W + 1 && !scrollable(e)
  }).map(e => ({ sel: nm(e).slice(0,70), over: Math.round(e.getBoundingClientRect().right - (L+W)), w: Math.round(e.getBoundingClientRect().width), txt: (e.textContent||'').trim().slice(0,40) }))

  // horizontal truncation without ellipsis/clamp
  const clipH = all.filter(e => {
    if (e.children.length && ![...e.children].every(c=>getComputedStyle(c).display==='inline'||c.tagName==='BR'||c.tagName==='EM'||c.tagName==='SPAN'||c.tagName==='B')) return false
    if (e.scrollWidth <= e.clientWidth + 1) return false
    const cs = getComputedStyle(e)
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return false
    if (cs.textOverflow === 'ellipsis') return false
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') return false
    return (e.textContent||'').trim().length > 0
  }).map(e => ({ sel: nm(e).slice(0,70), sw: e.scrollWidth, cw: e.clientWidth, ov: getComputedStyle(e).overflow, txt: (e.textContent||'').trim().slice(0,50) }))

  // vertical clipping: overflow hidden and content taller
  const clipV = all.filter(e => {
    const cs = getComputedStyle(e)
    if (cs.overflowY !== 'hidden' && cs.overflow !== 'hidden') return false
    if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') return false
    return e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 0
  }).map(e => ({ sel: nm(e).slice(0,70), sh: e.scrollHeight, ch: e.clientHeight, txt: (e.textContent||'').trim().slice(0,40) }))

  // fixed/sticky overlap
  const fixed = all.concat([...document.querySelectorAll('.cta,.tabbar,.top')]).filter(e => {
    const p = getComputedStyle(e).position
    return p === 'fixed' || p === 'sticky'
  })
  const fixedInfo = [...new Set(fixed)].map(e => { const b=e.getBoundingClientRect(); return { sel: nm(e).slice(0,50), top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) } })
  return { overflow, clipH, clipV, fixedInfo, docH: document.documentElement.scrollHeight, vpH: innerHeight, bodyW: W }
}

// what is hidden under a fixed bottom bar at max scroll
const COVER = () => {
  const bars = [...document.querySelectorAll('.cta, .tabbar')].filter(e=>{const p=getComputedStyle(e).position; return p==='fixed'||p==='sticky'})
  if (!bars.length) return []
  const topOfBars = Math.min(...bars.map(b=>b.getBoundingClientRect().top))
  const out = []
  const scroller = document.scrollingElement
  for (const e of document.querySelectorAll('.body *')) {
    if (bars.some(b=>b.contains(e)||e.contains(b))) continue
    if (!e.textContent || !e.textContent.trim()) continue
    if (e.children.length) continue
    const b = e.getBoundingClientRect()
    if (b.height===0) continue
    if (b.bottom > topOfBars + 1 && b.top < innerHeight) out.push({ sel: e.tagName.toLowerCase()+'.'+String(e.className).slice(0,40), covered: Math.round(b.bottom - topOfBars), txt: e.textContent.trim().slice(0,40) })
  }
  return { atBottom: Math.abs(scroller.scrollTop + innerHeight - scroller.scrollHeight) < 3, topOfBars: Math.round(topOfBars), out }
}

const R = []
const log = (vp, screen, data) => { R.push({ vp, screen, data }) }

const b = await chromium.launch()
for (const vp of VPS) {
  const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  const tag = `${vp.w}x${vp.h}`
  const shot = async (n) => page.screenshot({ path: `/private/tmp/claude-501/-Users-henrykim-Documents-Henry-Kim-Personal-Business---------------/8c9602c2-37c2-426b-b7e5-7c33a612ded8/scratchpad/dgo3_${tag}_${n}.png`, fullPage: true })

  // ---------- 1. DAILY ----------
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.bcard', { timeout: 30000 })
  await page.click('.dcard')
  await page.waitForSelector('.gbnow', { timeout: 30000 })
  await page.waitForTimeout(400)
  log(tag, 'daily-before', await page.evaluate(PROBE))
  await shot('daily1')
  await page.click('.btn--go')
  await page.waitForSelector('.dres', { timeout: 60000 })
  await page.waitForTimeout(700)
  log(tag, 'daily-result', await page.evaluate(PROBE))
  await shot('daily2')
  await page.evaluate(()=>document.scrollingElement.scrollTo(0, 1e6))
  await page.waitForTimeout(300)
  log(tag, 'daily-result-bottom-cover', await page.evaluate(COVER))
  await shot('daily3-bottom')

  // ---------- 2. GROUPBUY ----------
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.gbcard', { timeout: 30000 })
  await page.click('.gbcard')
  await page.waitForSelector('.gbslider', { timeout: 30000 })
  await page.waitForTimeout(400)
  const sl = await page.evaluate(()=>{ const i=document.querySelector('.gbslider input'); return {min:i.min,max:i.max,val:i.value,step:i.step} })
  log(tag, 'gb-slider-attrs', sl)
  log(tag, 'gb-20', await page.evaluate(PROBE))
  await shot('gb1-20')
  // open the table
  await page.click('.more__btn')
  await page.waitForSelector('.otable', { timeout: 10000 })
  await page.waitForTimeout(300)
  log(tag, 'gb-table-open-20', await page.evaluate(PROBE))
  log(tag, 'gb-table-metrics', await page.evaluate(()=>{
    const t=document.querySelector('.otable'), body=document.querySelector('.body')
    const p=t.parentElement
    return { tableW: Math.round(t.getBoundingClientRect().width), parentW: Math.round(p.clientWidth), parentOverflowX: getComputedStyle(p).overflowX, bodyW: body.clientWidth, tableRight: Math.round(t.getBoundingClientRect().right), bodyRight: Math.round(body.getBoundingClientRect().right), scrollW: p.scrollWidth, clientW: p.clientWidth }
  }))
  await shot('gb2-table')
  // slide 20 -> 60
  await page.evaluate(()=>{ const i=document.querySelector('.gbslider input'); const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i, i.max); i.dispatchEvent(new Event('input',{bubbles:true})); i.dispatchEvent(new Event('change',{bubbles:true})) })
  await page.waitForTimeout(500)
  log(tag, 'gb-max', await page.evaluate(PROBE))
  log(tag, 'gb-curve-metrics', await page.evaluate(()=>{
    const c=document.querySelector('.curve__svg'); const cap=document.querySelector('.curve__cap')
    const b=document.querySelector('.body')
    const ticks=[...document.querySelectorAll('.curve__tick')].map(t=>t.textContent)
    const dots=[...document.querySelectorAll('.curve__dot')].map(d=>({cx:d.getAttribute('cx'),cy:d.getAttribute('cy')}))
    return { svgW: Math.round(c.getBoundingClientRect().width), capW: Math.round(cap.getBoundingClientRect().width), capSW: cap.scrollWidth, capCW: cap.clientWidth, capH: Math.round(cap.getBoundingClientRect().height), bodyW: b.clientWidth, ticks, dots, viewBox: c.getAttribute('viewBox') }
  }))
  await shot('gb3-max')
  await page.click('.btn--go')
  await page.waitForSelector('.rvlist, .gbres, .rv', { timeout: 60000 }).catch(()=>{})
  await page.waitForTimeout(1200)
  log(tag, 'gb-order-result', await page.evaluate(PROBE))
  log(tag, 'gb-rv-count', await page.evaluate(()=>({ rv: document.querySelectorAll('.rv').length, myrv: document.querySelectorAll('.myrv').length, vote: document.querySelectorAll('.vote').length })))
  await shot('gb4-result')
  await page.evaluate(()=>document.scrollingElement.scrollTo(0, 1e6))
  await page.waitForTimeout(300)
  log(tag, 'gb-result-bottom-cover', await page.evaluate(COVER))
  await shot('gb5-bottom')

  // ---------- 3. OPEN (reveal) ----------
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.bcard', { timeout: 30000 })
  await page.click('.blist li:nth-child(1) .bcard')
  await page.waitForSelector('.odds', { timeout: 30000 })
  await page.click('text=명 채우기')
  await page.waitForFunction(()=>document.querySelectorAll('.av.is-in').length>=10, { timeout: 30000 }).catch(()=>{})
  await page.waitForTimeout(600)
  await page.click('.cta .btn--go')
  await page.waitForSelector('.rvlist', { timeout: 60000 })
  await page.waitForTimeout(2500)
  log(tag, 'open-result', await page.evaluate(PROBE))
  log(tag, 'open-metrics', await page.evaluate(()=>{
    const nm=(e)=>e.tagName.toLowerCase()+'.'+String(e.className).slice(0,50)
    const rvs=[...document.querySelectorAll('.rv')].map(e=>{const b=e.getBoundingClientRect();return{w:Math.round(b.width),h:Math.round(b.height),sw:e.scrollWidth,cw:e.clientWidth,txt:e.textContent.trim().slice(0,60)}})
    const my=document.querySelector('.myrv')
    const heads=[...document.querySelectorAll('.rv__head')].map(e=>({sw:e.scrollWidth,cw:e.clientWidth,txt:e.textContent.trim().slice(0,50)}))
    return { count: rvs.length, rvs: rvs.slice(0,4), myrv: my?{w:Math.round(my.getBoundingClientRect().width),sw:my.scrollWidth,cw:my.clientWidth,txt:my.textContent.trim().slice(0,80)}:null, heads: heads.slice(0,4) }
  }))
  await shot('open1')
  await page.evaluate(()=>document.scrollingElement.scrollTo(0, 1e6))
  await page.waitForTimeout(300)
  log(tag, 'open-bottom-cover', await page.evaluate(COVER))
  // vote card
  const hasVote = await page.$('.vote')
  if (hasVote) {
    log(tag, 'vote-metrics', await page.evaluate(()=>{
      const v=document.querySelector('.vote'); const ch=document.querySelector('.vote__chips')
      const b=document.querySelector('.body')
      const chips=[...document.querySelectorAll('.vote__chips .chip')].map(c=>{const r=c.getBoundingClientRect();return{w:Math.round(r.width),right:Math.round(r.right),sw:c.scrollWidth,cw:c.clientWidth,txt:c.textContent.trim()}})
      return { voteW:Math.round(v.getBoundingClientRect().width), chipsW:Math.round(ch.getBoundingClientRect().width), chipsSW:ch.scrollWidth, chipsCW:ch.clientWidth, flexWrap:getComputedStyle(ch).flexWrap, bodyRight:Math.round(b.getBoundingClientRect().right), chips }
    }))
  }
  await shot('open2-bottom')
  await ctx.close()
}
await b.close()
console.log(JSON.stringify(R, null, 1))
