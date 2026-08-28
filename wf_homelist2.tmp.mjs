import { chromium } from 'playwright'
const b = await chromium.launch()
for (const [w,h] of [[390,844],[414,900]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:2 })
  const p = await ctx.newPage()
  await p.goto('http://localhost:3111/', {waitUntil:'networkidle'})
  await p.click('.tabbar__b:nth-child(1)'); await p.waitForSelector('.pcard'); await p.waitForTimeout(500)
  console.log('=====', w)
  console.log('cats', await p.evaluate(()=>{
    const c=document.querySelector('.cats'); const cb=c.getBoundingClientRect()
    const last=[...c.children].at(-1).getBoundingClientRect()
    const cs=getComputedStyle(c)
    return {hostRight:Math.round(cb.right), lastRight:Math.round(last.right), sw:c.scrollWidth, cw:c.clientWidth, padR:cs.paddingRight, gap:cs.gap, mask:cs.maskImage}
  }))
  // thumb 내부 요소
  console.log('thumbKids', await p.evaluate(()=>[...document.querySelectorAll('.pcard')].slice(0,4).map(c=>({
    name:c.querySelector('.pcard__name')?.textContent.slice(0,20),
    kids:[...c.querySelector('.pcard__thumb').children].map(e=>e.tagName+'.'+e.className),
    img:c.querySelector('.pcard__thumb img')?.naturalWidth+'x'+c.querySelector('.pcard__thumb img')?.naturalHeight
  }))))
  // 한 행 안 카드들의 내부 baseline 정렬
  console.log('rowAlign', await p.evaluate(()=>{
    const cs=[...document.querySelectorAll('.pcard')].slice(0,8)
    return cs.map(c=>{const g=s=>{const e=c.querySelector(s);return e?Math.round(e.getBoundingClientRect().top):null}
      return {y:Math.round(c.getBoundingClientRect().top), chips:g('.pcard__chips'), seller:g('.pcard__seller'), name:g('.pcard__name'), price:g('.pcard__price'), badge:g('.badge'), rate:g('.pcard__rate'), h:Math.round(c.getBoundingClientRect().height)}})
  }))
  // 칩 개수 / spec 없는 카드 비율
  console.log('slotStats', await p.evaluate(()=>{
    const cs=[...document.querySelectorAll('.pcard')]
    return {total:cs.length, noChips:cs.filter(c=>!c.querySelector('.pcard__chips')).length,
      noRate:cs.filter(c=>!c.querySelector('.pcard__rate')).length,
      badge:cs.filter(c=>c.querySelector('.badge')).length,
      name2:cs.filter(c=>c.querySelector('.pcard__name').getBoundingClientRect().height>30).length}
  }))
  // 칩 잘림
  console.log('chipCut', await p.evaluate(()=>[...document.querySelectorAll('.pcard__chips')].filter(e=>e.scrollWidth>e.clientWidth+1).length))
  // NEW 배지 겹침
  console.log('newTag', await p.evaluate(()=>{
    const t=document.querySelector('.quick__tag').getBoundingClientRect()
    const ico=document.querySelector('.quick__t--olbox .quick__ico').getBoundingClientRect()
    const cats=document.querySelector('.cats').getBoundingClientRect()
    return {tag:{x:Math.round(t.x),y:Math.round(t.y),r:Math.round(t.right),w:Math.round(t.width)}, icoR:Math.round(ico.right), icoT:Math.round(ico.top), catsBottom:Math.round(cats.bottom)}
  }))
  // 검색 시 shead
  await p.fill('.hsearch input','수세미'); await p.waitForTimeout(300)
  console.log('searchHead', await p.$eval('.shead', e=>({t:e.textContent, sw:e.scrollWidth, cw:e.clientWidth, h2sw:e.querySelector('h2').scrollWidth, h2cw:e.querySelector('h2').clientWidth})))
  await p.fill('.hsearch input','친환경 무형광 3겹 데코 롤화장지 30m 30롤 대용량'); await p.waitForTimeout(300)
  console.log('longQueryHead', await p.$eval('.shead h2', e=>({t:e.textContent.slice(0,60), sw:e.scrollWidth, cw:e.clientWidth, h:Math.round(e.getBoundingClientRect().height)})))
  console.log('longQueryOverflow', await p.evaluate(()=>{
    const host=document.querySelector('.body'); const W=host.clientWidth, L=host.getBoundingClientRect().left
    return [...document.querySelectorAll('.body *')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.right>L+W+1}).map(e=>e.tagName+'.'+e.className)
  }))
  await p.screenshot({path:`/tmp/hl/${w}-longq.png`})
  await ctx.close()
}
await b.close()
