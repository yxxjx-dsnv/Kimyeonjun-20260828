import { chromium } from 'playwright'

const VPS = [[390,844],[414,900],[1512,950]]
const OUT = '/tmp/hl'
import fs from 'fs'
fs.mkdirSync(OUT, {recursive:true})

const PROBE = () => {
  const host = document.querySelector('.body')
  if (!host) return {err:'no .body'}
  const W = host.clientWidth, L = host.getBoundingClientRect().left
  const scrollable = (e) => {
    for (let p = e.parentElement; p; p = p.parentElement) {
      const ov = getComputedStyle(p).overflowX
      if (ov === 'auto' || ov === 'scroll' || ov === 'hidden') return true
      if (p === host) return false
    }
    return false
  }
  const nm = (e) => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).slice(0,50) : '')
  const overflow = [...document.querySelectorAll('.body *')]
    .filter(e => { const b = e.getBoundingClientRect(); return b.width>0 && b.right > L+W+1 && !scrollable(e) })
    .map(e => ({ sel: nm(e), over: Math.round(e.getBoundingClientRect().right-(L+W)), w: Math.round(e.getBoundingClientRect().width) }))
  const clipped = [...document.querySelectorAll('.body *')]
    .filter(e => {
      if (e.children.length && ![...e.children].every(c=>getComputedStyle(c).display==='inline'||c.tagName==='BR'||c.tagName==='SPAN'||c.tagName==='EM'||c.tagName==='B')) return false
      const cs = getComputedStyle(e)
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return false
      const hOver = e.scrollWidth > e.clientWidth + 1
      const vOver = e.scrollHeight > e.clientHeight + 1
      if (!hOver && !vOver) return false
      const ell = cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none'
      return !ell
    })
    .map(e => ({ sel: nm(e), sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight, t: (e.textContent||'').trim().slice(0,40) }))
  return { overflow, clipped, bodyW: W, scrollW: document.documentElement.scrollWidth, winW: window.innerWidth }
}

const boxOf = async (page, sel) => page.$$eval(sel, els => els.map(e=>{const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),t:(e.textContent||'').trim().slice(0,30)}}))

const b = await chromium.launch()
const report = {}
for (const [w,h] of VPS) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:2 })
  const page = await ctx.newPage()
  await page.goto('http://localhost:3111/', { waitUntil:'networkidle' })
  await page.waitForSelector('.bcard')
  const key = `${w}x${h}`
  report[key] = {}

  // ── 올박스 목록
  report[key].list = await page.evaluate(PROBE)
  report[key].listCounts = await page.evaluate(() => ({
    bcard: document.querySelectorAll('.bcard').length,
    dcard: document.querySelectorAll('.dcard').length,
    gbcard: document.querySelectorAll('.gbcard').length,
    vote: document.querySelectorAll('[class*=vote]').length,
  }))
  await page.screenshot({ path:`${OUT}/${key}-list.png`, fullPage:true })

  // ── 홈 탭
  await page.click('.tabbar__b:nth-child(1)')
  await page.waitForSelector('.pcard')
  await page.waitForTimeout(600)
  report[key].home = await page.evaluate(PROBE)
  report[key].homeGeom = {
    quickTiles: await boxOf(page,'.quick__t'),
    quickIco: await boxOf(page,'.quick__ico'),
    quickLb: await boxOf(page,'.quick__lb'),
    cats: await boxOf(page,'.cats__b'),
    catsHost: await boxOf(page,'.cats'),
    search: await boxOf(page,'.hsearch'),
    shead: await boxOf(page,'.shead'),
  }
  report[key].catScroll = await page.$eval('.cats', e => ({sw:e.scrollWidth, cw:e.clientWidth}))
  // 첫 상품카드 내부 요소 좌표
  report[key].card0 = await page.evaluate(() => {
    const c = document.querySelector('.pcard'); if(!c) return null
    const g = s => { const e = c.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); return {y:Math.round(b.y),h:Math.round(b.height),w:Math.round(b.width),sw:e.scrollWidth,cw:e.clientWidth,t:(e.textContent||'').trim().slice(0,40)} }
    return { chips:g('.pcard__chips'), seller:g('.pcard__seller'), name:g('.pcard__name'), price:g('.pcard__price'), badge:g('.badge'), rate:g('.pcard__rate') }
  })
  // 카드 높이 편차(정렬 깨짐)
  report[key].cardRows = await page.evaluate(() => {
    const cs=[...document.querySelectorAll('.hsec:first-of-type .pcard')].slice(0,6)
    return cs.map(c=>{const b=c.getBoundingClientRect();return {y:Math.round(b.y),h:Math.round(b.height)}})
  })
  await page.screenshot({ path:`${OUT}/${key}-home.png`, fullPage:true })
  await page.screenshot({ path:`${OUT}/${key}-home-fold.png` })

  // ── 검색어
  await page.fill('.hsearch input', '포켓몬')
  await page.waitForTimeout(400)
  report[key].search = await page.evaluate(PROBE)
  report[key].searchHead = await page.$eval('.shead h2', e=>({t:e.textContent, sw:e.scrollWidth, cw:e.clientWidth}))
  await page.screenshot({ path:`${OUT}/${key}-search.png`, fullPage:true })

  await page.fill('.hsearch input','')
  await page.waitForTimeout(200)
  // ── 카테고리 변경 (포켓몬 카드)
  await page.click('.cats__b:nth-child(4)')
  await page.waitForTimeout(500)
  report[key].cat = await page.evaluate(PROBE)
  await page.screenshot({ path:`${OUT}/${key}-cat.png`, fullPage:true })

  // 없는 검색어
  await page.fill('.hsearch input','존재하지않는상품명xyz')
  await page.waitForTimeout(300)
  report[key].none = await page.evaluate(PROBE)
  await page.screenshot({ path:`${OUT}/${key}-none.png` })

  await ctx.close()
}
await b.close()
fs.writeFileSync('/tmp/hl/report.json', JSON.stringify(report,null,1))
console.log(JSON.stringify(report,null,1))
