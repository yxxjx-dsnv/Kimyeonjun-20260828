/**
 * 발표자료용 스크린샷 — **배포본에서 직접 찍는다.**
 *   npm i -D playwright --no-save
 *   node tests/shots.mjs [URL] [출력폴더]
 *
 * 손으로 찍으면 화면이 바뀐 뒤 슬라이드만 옛것이 남는다. 덱을 다시 만들 때마다
 * 이 스크립트를 돌려 같은 URL에서 다시 찍으면 화면과 슬라이드가 어긋날 수 없다.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = (process.argv[2] || 'http://localhost:3111').replace(/\/$/, '')
const OUT = process.argv[3] || '../images'
// 세 번째 인자로 찍을 컷을 고른다. 개봉까지 가는 컷은 방이 다 차야 해서 실패할 때가 있고,
// 그때 20장을 전부 다시 찍으면 6분이 든다. 실패한 컷만 다시 찍기 위한 필터다.
const ONLY = (process.argv[4] || '').split(',').map((x) => x.trim()).filter(Boolean)
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const shot = async (name, { w = 390, h = 844, steps = [] } = {}) => {
  if (ONLY.length && !ONLY.includes(name)) return
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  await pg.goto(`${BASE}/?v=${Math.random().toString(36).slice(2)}`, { waitUntil: 'networkidle', timeout: 45000 })
  for (const s of steps) {
    try {
      if (s.click) await pg.click(s.click)
      if (s.text) await pg.getByText(s.text, { exact: false }).first().click()
      if (s.role) await pg.getByRole('button', { name: s.role, exact: true }).click()
      if (s.check) await pg.locator(s.check).check()
      if (s.waitFor) await pg.waitForSelector(s.waitFor, { timeout: s.timeout ?? 60000 })
      if (s.wait) await pg.waitForTimeout(s.wait)
      // .body가 스크롤 컨테이너가 되는 것은 데스크톱 폭에서뿐이다(index.css의 미디어쿼리).
      // 모바일 뷰포트에서는 창이 스크롤한다 — 구분하지 않으면 스크롤 컷이 전부 같은 그림이 된다.
      if (s.scroll != null) await pg.evaluate((y) => {
        const el = document.querySelector('.body')
        if (el && el.scrollHeight > el.clientHeight + 4) el.scrollTop = y
        else window.scrollTo(0, y)
      }, s.scroll)
    } catch (e) { console.log(`    · ${name}: ${JSON.stringify(s)} 건너뜀 (${e.message.split('\n')[0].slice(0, 50)})`) }
  }
  await pg.waitForTimeout(500)
  await pg.screenshot({ path: `${OUT}/${name}.png` })
  await pg.close()
  console.log('  ✓', name)
}

// 구매 전 — 목록·상세·검증
const toList = [{ click: '.tabbar__b.is-center' }, { waitFor: '.deallist' }, { wait: 600 }]
const toDetail = [...toList, { text: '스탠다드 올박스' }, { waitFor: '.pricebox' }, { wait: 400 }]
const toPay = [...toDetail, { click: '.cta .btn--go' }, { waitFor: '.agree' }, { wait: 300 }]
const toOrdered = [...toPay, { check: '.agree input' }, { click: '.cta .btn--go' }, { waitFor: '.done' }, { wait: 400 }]
const toFlow = [...toOrdered, { text: '팀 모으러 가기' }, { wait: 3000 }]
const toOpened = [...toFlow, { role: '준비 완료' }, { waitFor: '.rv__list', timeout: 180000 }, { wait: 900 },
  { click: '.scene' }, { wait: 500 }]

console.log(`발표자료 스크린샷 — ${BASE} → ${OUT}`)
await shot('s01_home', { steps: [{ wait: 800 }] })
await shot('s02_list', { steps: toList })
await shot('s03_list_scroll', { steps: [...toList, { scroll: 420 }] })
await shot('s04_detail', { steps: toDetail })
await shot('s05_detail_tiers', { steps: [...toDetail, { scroll: 700 }] })
await shot('s06_grid', { steps: [...toDetail, { click: '.verify' }, { waitFor: '.sheet' }, { wait: 700 }] })
await shot('s07_odds', { steps: [...toDetail, { scroll: 1700 }] })
await shot('s08_checkout', { steps: toPay })
await shot('s09_ordered', { steps: toOrdered })
await shot('s10_recruit', { steps: toFlow })
await shot('s11_reveal', { steps: toOpened })
await shot('s12_trade', { steps: [...toOpened, { text: '교환 실행' }, { wait: 2000 }, { scroll: 2000 }] })
await shot('s13_compare', { steps: [...toOpened, { text: '교환 실행' }, { wait: 2000 }, { scroll: 2600 }] })
await shot('s21_contrast', { steps: [...toOpened, { text: '교환 실행' }, { wait: 2000 }, { scroll: 3600 }] })
await shot('s14_orders', { steps: [...toOpened, { click: '.tabbar__b:last-child' }, { waitFor: '.order' }, { wait: 500 }] })
await shot('s15_group', { steps: [...toList, { text: '브랜드 공동구매' }, { waitFor: '.pricebox' }, { wait: 500 }] })
await shot('s16_group_table', { steps: [...toList, { text: '브랜드 공동구매' }, { waitFor: '.pricebox' }, { scroll: 520 }] })
await shot('s17_daily', { steps: [...toList, { click: '.dbanner' }, { waitFor: '.pricebox' }, { wait: 500 }] })
// 데스크톱 — 3단 셸과 챗봇
await shot('s18_desktop', { w: 1440, h: 900, steps: [{ wait: 900 }] })
await shot('s19_chatbot', { w: 1440, h: 1000, steps: [
  { click: '.dock--closed' }, { wait: 400 }, { text: '왜 올웨이즈인가요?' },
  { waitFor: '.dockmsg--assistant:not(.dockmsg--wait) p' }, { wait: 800 }] })
await shot('s20_ops', { w: 1440, h: 900, steps: [{ click: '.tabbar__b.is-center' }, { wait: 800 }] })

await browser.close()
console.log('완료')
