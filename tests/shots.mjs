/**
 * 발표자료용 스크린샷 — 배포본에서 직접 찍는다.
 *   node tests/shots.mjs [baseUrl] [outDir]
 *
 * 슬라이드가 참조하는 파일을 그대로 만들기 때문에, 화면이 바뀌면 다시 돌리는
 * 것만으로 발표자료가 따라온다. 슬라이드와 제품이 어긋날 수 없다.
 */
import { mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.argv[2] || 'https://albox-alwayz.vercel.app'
const OUT = process.argv[3] || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'images')
await mkdir(OUT, { recursive: true })

const { chromium } = await import('playwright')
const browser = await chromium.launch()

/** 위에서 clipH px만 잘라 찍는다. 폰 캡처는 세로가 길어 여백이 슬라이드를 잡아먹는다. */
const shot = async (page, name, clipH = 780) => {
  await page.screenshot({ path: join(OUT, `${name}.png`), clip: { x: 0, y: 0, width: 414, height: clipH } })
  console.log(`  ${name}.png (${clipH}px)`)
}

const ctx = await browser.newContext({ viewport: { width: 414, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()

console.log(`촬영: ${BASE} → ${OUT}`)
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.bcard', { timeout: 20000 })
await shot(page, 'ob1_list', 720)                     // ① 박스 3종

await page.click('.blist li:nth-child(2) .bcard')  // 리자몽 올박스
await page.waitForSelector('.curve__svg')
await page.waitForTimeout(500)
await shot(page, 'ob2_curve', 700)                    // ② 확률 곡선 (혼자)

await page.click('text=손주 줄 것도 넣어서')
await page.waitForSelector('.tiers__note', { timeout: 40000 })
await page.waitForTimeout(400)
await shot(page, 'ob3_taste', 640)                    // ③ 취향 대화

await page.click('text=명 채우기')
await page.waitForFunction(() => document.querySelectorAll('.av.is-in').length === 10, null, { timeout: 20000 })
await page.waitForTimeout(500)
await page.evaluate(() => document.querySelector('.curve').scrollIntoView({ block: 'start' }))
await page.waitForTimeout(300)
await shot(page, 'ob4_team10', 700)                   // ④ 10명 · 곡선 위 점 이동

await page.click('.btn--go')
await page.waitForTimeout(1100)
await page.evaluate(() => document.querySelector('.rail').scrollIntoView({ block: 'center' }))
await page.waitForTimeout(200)
await shot(page, 'ob5_gate', 620)                     // ⑤ n/10 게이트 진행 중

await page.waitForSelector('.rvlist', { timeout: 60000 })
await page.waitForTimeout(700)
await shot(page, 'ob6_result', 760)                   // ⑥ 개봉 결과 + 정산

await page.click('.top__q')
await page.waitForSelector('.sheet')
await page.waitForTimeout(400)
await shot(page, 'ob7_honesty', 820)                  // ⑦ 정직성 시트

// 더보기 표 — 시트를 닫는 대신 새로 진입한다(시트가 클릭을 가로챈다)
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.click('.bcard')
await page.waitForSelector('.more__btn')
await page.click('.more__btn')
await page.waitForSelector('.otable')
await page.evaluate(() => document.querySelector('.more').scrollIntoView({ block: 'start' }))
await page.waitForTimeout(300)
await shot(page, 'ob8_table', 640)                    // ⑧ 1~10명 확률표

// 뽑기 통 + 천장 — 확률이 재고에서 나온다는 것을 보이는 화면
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.blist li:nth-child(2) .bcard', { timeout: 20000 })
await page.click('.blist li:nth-child(2) .bcard')
await page.waitForSelector('.bin', { timeout: 15000 })
await page.evaluate(() => document.querySelector('.pity').scrollIntoView({ block: 'start' }))
await page.waitForTimeout(400)
await shot(page, 'ob13_pity', 560)                    // ⑬ 천장 진행도
await page.evaluate(() => document.querySelector('.bin').scrollIntoView({ block: 'start' }))
await page.waitForTimeout(300)
await shot(page, 'ob14_bin', 480)                     // ⑭ 뽑기 통 (혼자)
await page.click('text=명 채우기')
await page.waitForFunction(() => document.querySelectorAll('.av.is-in').length === 10, null, { timeout: 20000 })
await page.evaluate(() => document.querySelector('.bin').scrollIntoView({ block: 'start' }))
await page.waitForTimeout(500)
await shot(page, 'ob15_bin10', 480)                   // ⑮ 뽑기 통 (10명, 배수 적용)

// 데일리 100원 — 꽝 있는 포맷, 확률 전부 공개
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.dcard', { timeout: 20000 })
await page.click('.dcard')
await page.waitForSelector('.gbnow', { timeout: 15000 })
await page.waitForTimeout(400)
await shot(page, 'ob16_daily', 900)                   // ⑯ 데일리 + 계산 근거
await page.click('.btn--go')
await page.waitForSelector('.dres', { timeout: 20000 })
await page.waitForTimeout(400)
await shot(page, 'ob17_dresult', 820)                 // ⑰ 뽑기 결과 + 투표

// 공동구매형 — 상품 확정, 확률은 '얼마를 내는가'에만
await page.goto(BASE, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.gbcard', { timeout: 20000 })
await shot(page, 'ob10_list2', 900)                   // ⑩ 목록 전체(박스 + 공동구매)
await page.click('.gbcard')
await page.waitForSelector('.gbnow')
await page.focus('.gbslider input')
for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowRight')  // 20 → 45명
await page.waitForTimeout(500)
await shot(page, 'ob11_group', 880)                   // ⑪ 45명 · 42.9% 할인 · 5명 무료
await page.click('.btn--go')
await page.waitForSelector('.rvlist', { timeout: 30000 })
await page.waitForTimeout(500)
await shot(page, 'ob12_order', 760)                   // ⑫ 발주 결과 — 누가 무료인지

// 데스크톱 — 설계 근거 사이드 레일
const wide = await browser.newContext({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2 })
const wp = await wide.newPage()
await wp.goto(BASE, { waitUntil: 'networkidle' })
await wp.click('.bcard')
await wp.waitForSelector('.curve__svg')
await wp.waitForTimeout(600)
await wp.screenshot({ path: join(OUT, 'ob9_desktop.png'), fullPage: false })
console.log('  ob9_desktop.png (1512×950)')

await browser.close()
console.log('완료')
