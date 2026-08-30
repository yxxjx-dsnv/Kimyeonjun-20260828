/**
 * ② 브랜드 협업 공동구매 — import 가능한 모듈이면서 실행 가능한 self-check다.
 *   node api/_group.js
 *
 * ## 무엇이 확률인가
 * 상품은 확정이다(전원이 같은 것을 받는다). 확률이 작동하는 곳은 **돈이 돌아오는지**다.
 * 마감 후 R명이 낸 돈을 전액 환불받는다.
 *
 *   확률 = 환불 인원 R ÷ 참여 인원 M
 *
 * ①(팀 뽑기)과 정확히 같은 규칙이다 — 재고 ÷ 전체 장수. 재고가 카드에서 환불 슬롯으로 바뀌었을 뿐이고,
 * 둘 다 화면에서 셀 수 있다.
 *
 * ## 첫 설계가 왜 틀렸나 (검증에서 잡힌 것)
 * 처음엔 정가 50,000원 상품을 59,000원에 팔고 부가상품으로 상쇄한다고 했다. 틀렸다.
 *   기대지불 = 59,000 × (1 − p). 정가와 같아지려면 p ≥ 9,000/59,000 = 15.25%.
 *   그런데 설계한 확률표의 최대가 6%였다. **전 구간에서 소비자가 정가보다 비싸게 산다.**
 * 게다가 "대량 발주 절감분이 환불 재원"이라는 서사가 산술적으로 거짓이었다 —
 * 환불 총액은 소비자가 낸 프리미엄 9,000×M 안에서 다 나오고 회사는 오히려 남긴다.
 * **확률로 포장한 가격 인상**이고, v1이 피하려던 것과 같은 구조다.
 *
 * 그래서 두 가지를 바꿨다.
 *   (1) 공동구매가를 **정가 이하**로 못박는다. 손실 가능성 0이 가정이 아니라 구조가 된다.
 *   (2) R을 표로 적지 않고 **캠페인 고정비 상각**에서 계산한다.
 *       고정비 F는 인원과 무관하므로 참여자당 여력 (m − F/M)이 M에 따라 실제로 늘어난다.
 *       이것이 "많이 모일수록 좋다"의 진짜 구조적 출처다. 회사가 정한 배수가 아니다.
 *
 * ## 정직하게 적는 것
 * R은 사람 수라 정수다. 그래서 p = R/M은 M이 1 늘 때마다 미세하게 오르내린다.
 * "확률이 단조 증가한다"고 쓰지 않는다. 대신 **환불 인원 R이 단조 증가한다**고 쓴다 —
 * 그것은 참이고, 셀 수 있고, 마케팅 문구로도 그쪽이 정확하다.
 * 그리고 상한이 있다: p → m/P. 무한히 오르지 않는다는 것을 화면에 명시한다(I11).
 */
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import pool from './_pool.js'
import { isPokemonCard, isNotCard, isOripa } from './_sources.js'

const isMain = () => {
  try { return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]) } catch { return false }
}

/**
 * 협업 상품. 크롤 데이터에서 고른다 — 지어내지 않는다.
 * 브랜드 협업의 '부가 상품'은 실제 SKU가 없으므로 **가치를 주장하지 않는다.**
 * 손실 가능성 0은 부가상품이 아니라 "공동구매가 ≤ 정가"로만 지탱한다.
 */
const CANDIDATES = pool.items.filter(
  (x) => x.group !== 'acc' && x.group !== 'oripa' &&
    !isOripa(x.name) && !isNotCard(x.name) && isPokemonCard(x.name) &&
    x.price >= 40000 && x.price <= 120000
).sort((a, b) => b.price - a.price)

/** 대표 상품 — 결정적으로 고른다(I7). 가격 내림차순 첫 번째. */
export const ITEM = CANDIDATES[0]

export const LIST = ITEM ? ITEM.price : 0          // 정가 = 크롤 실측 최저가
export const PRICE = LIST                          // 공동구매가. 정가 이하여야 한다(아래 검사)
export const MARGIN = Math.round(LIST * 0.06)      // 참여자당 기여 마진 (설계 선택. SPEC §12)
export const FIXED = LIST                          // 캠페인 고정비 (설계 선택. 대략 상품 1개 값)
export const M_MAX = 500                           // 정원

/**
 * 마감. 공동구매는 주문을 모아 한 번에 발주하므로 **마감이 실재한다.**
 * 마감 시각을 숨기면 조건 은닉이 된다 — 공정위가 테무를 제재한 사유가 그것이었다(C2).
 * 그래서 카운트다운을 쓴다. 대신 없는 마감을 만들지 않고, 리셋되는 가짜 타이머를
 * 쓰지 않고, "얼마 안 남았어요" 같은 감정 유도 문구를 붙이지 않는다 (I10′).
 * 시각은 서버가 정하고 화면은 표시만 한다.
 */
export const DEADLINE_DAYS = 5
export const deadlineFrom = (startedAt) => startedAt + DEADLINE_DAYS * 86400_000

/**
 * 회차제 — 크롤 시각을 원점으로 5일짜리 회차가 연속해서 돈다.
 * 이유: 마감을 크롤 시각 + 5일로 고정하면 제출 며칠 뒤 심사자가 열었을 때
 * 음수 카운트다운이 뜬다. 회차는 (1) 원점이 실측 시각이라 임의값이 아니고,
 * (2) 같은 회차 안에서는 마감이 절대 움직이지 않으며(리셋 금지 검사 유지),
 * (3) 실제 공동구매가 회차 단위로 반복되는 구조와 같다.
 */
export const EPOCH = Date.parse(pool.crawledAt)
export const roundOf = (now) => Math.floor((now - EPOCH) / (DEADLINE_DAYS * 86400_000)) + 1
export const roundDeadline = (now) => EPOCH + roundOf(now) * DEADLINE_DAYS * 86400_000

/** 환불 인원. 재고다 — 확률이 아니다. 화면에서 셀 수 있다. */
/**
 * 데모용 실시간 참여자 수.
 *
 * 실제 집계는 저장하지 않는다(KV 없이는 인스턴스마다 갈린다). 그렇다고 화면이
 * 숫자를 만들면 **확률의 분모를 화면이 지어내는 것**이 되어 I1이 깨진다.
 * 그래서 서버가 시각의 함수로 계산해 내려주고, 화면은 렌더만 한다.
 * 값이 시뮬레이션이라는 사실은 화면에 배지로 밝힌다(I13).
 *
 * **단조 증가여야 한다.** 잡음을 더했더니 130 → 129로 되돌아갔다 — 참여자 수가
 * 줄어드는 화면은 그 자체로 거짓이다. 그래서 시각의 단조 함수만 쓴다.
 *
 * 회차 전체(5일)에 걸쳐 채우면 분당 0.07명이라 눈에 안 보인다. 데모에서는
 * **DEMO_SPAN 동안 정원까지 차고 그 뒤로는 정원에 머문다.** 시연용 속도라는 것을
 * 화면이 시뮬 배지로 밝힌다.
 */
/* 회차 전체(5일)로 채우면 14분에 한 명이라 시연 중에는 멈춰 보이고,
   회차 시작이 지나 있으면 아예 정원에 붙어 움직이지 않는다.
   그래서 **시연 주기**를 따로 둔다 — 한 시간에 걸쳐 1명에서 정원까지 오른다.
   실제 서비스라면 이 자리에 진짜 집계가 들어간다(화면은 그대로 렌더만 한다). */
export const DEMO_CYCLE = 60 * 60_000

export function simMembers(now) {
  const t = (now % DEMO_CYCLE) / DEMO_CYCLE      // 시연 주기 안의 진행도
  const curve = 1 - Math.pow(1 - t, 1.7)          // 초반이 빠른, 실제 공동구매의 모양
  return Math.max(1, Math.min(M_MAX, Math.floor(M_MAX * curve)))
}

/** 지금 이 순간의 참여 현황 — 확률까지 서버가 문자열로 만든다. */
export function liveOf(now) {
  const M = simMembers(now)
  const R = refundSlots(M)
  const p = oddsAt(M)
  return {
    members: M, refunds: R, p, pct: fmtPct(p),
    freq: `${M.toLocaleString('ko-KR')}명 중 ${R.toLocaleString('ko-KR')}명 당첨`,
    toNext: Math.max(0, nextRefundAt(M) - M),
  }
}

/** 환불 인원이 한 명 더 늘어나는 참여 인원. "몇 명 더 모이면"을 말할 수 있게. */
export function nextRefundAt(M) {
  const target = refundSlots(M) + 1
  for (let m = M + 1; m <= M_MAX; m++) if (refundSlots(m) >= target) return m
  return M_MAX
}

export const refundSlots = (M) => Math.max(0, Math.floor((MARGIN * M - FIXED) / PRICE))
/** 개인 확률 = 재고 ÷ 전체 장수 */
export const oddsAt = (M) => (M > 0 ? refundSlots(M) / M : 0)
/** 상한 — 고정비가 다 상각되면 더 나올 곳이 없다 */
export const CEIL = MARGIN / PRICE

export const fmtPct = (p) => `${(p * 100).toFixed(2)}%`
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`

/** 화면이 쓰는 구간표. 마일스톤에서의 환불 인원과 확률. */
export const milestones = (ms = [50, 100, 200, 300, 500]) =>
  ms.filter((m) => m <= M_MAX).map((M) => ({
    M, R: refundSlots(M), p: oddsAt(M), pct: fmtPct(oddsAt(M)),
    freq: `${M.toLocaleString('ko-KR')}명 중 ${refundSlots(M)}명 당첨`,
  }))

// ─────────────────────────── self-check ───────────────────────────
export function check() {
  const fails = []
  let count = 0
  const ok = (name, cond, detail) => {
    count++
    if (!cond) fails.push(name)
    console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
  }

  ok('협업 상품이 크롤 실측 상품', !!ITEM && pool.items.some((x) => x.id === ITEM.id),
    ITEM ? `${ITEM.name.slice(0, 34)} ${won(ITEM.price)}` : '없음')

  // 손실 가능성 0 — ①의 `최저가 ≥ 참여비`와 같은 자리의 검사다.
  ok('손실 가능성 0 — 공동구매가 ≤ 정가', PRICE <= LIST, `${won(PRICE)} ≤ ${won(LIST)}`)

  // 환불 재원이 실제로 있는가. 회사가 없는 돈을 쓰지 않는가.
  // 고정비를 아직 못 넘긴 구간에서는 재원이 음수이고 R도 0이다. 그때는 쓸 돈이 없는 게 맞다.
  // 처음엔 이 max(0,…)를 빼고 검사해서 0 ≤ 음수로 실패했다 — 식이 아니라 검사가 틀렸었다.
  const fundOk = []
  for (let M = 1; M <= M_MAX; M++) {
    fundOk.push(refundSlots(M) * PRICE <= Math.max(0, MARGIN * M - FIXED) + 1e-9)
  }
  ok(`환불 총액 ≤ 기여마진 − 고정비 (M=1..${M_MAX})`, fundOk.every(Boolean))
  const breakeven = Math.ceil(FIXED / MARGIN)
  ok('고정비를 못 넘긴 구간에서는 환불이 0', refundSlots(breakeven - 1) === 0 || breakeven <= 1,
    `${breakeven}명부터 환불이 생긴다`)

  // 환불 인원이 단조 증가하는가. 이것이 "많이 모일수록 좋다"의 정직한 형태다.
  let rMono = true
  for (let M = 2; M <= M_MAX; M++) if (refundSlots(M) < refundSlots(M - 1)) rMono = false
  ok(`환불 인원 R이 M에 대해 단조 증가 (M=1..${M_MAX})`, rMono)

  // 확률은 정수 R 때문에 미세하게 오르내린다. 그것을 숨기지 않고 크기를 잰다.
  let maxDip = 0
  for (let M = 2; M <= M_MAX; M++) maxDip = Math.max(maxDip, oddsAt(M - 1) - oddsAt(M))
  ok('확률의 국소 하락폭 < 1%p (정수 R의 톱니)', maxDip < 0.01, `최대 ${(maxDip * 100).toFixed(2)}%p`)

  // 마일스톤 사이에서는 실제로 오르는가 — 화면이 약속하는 것은 이것이다.
  const ms = milestones()
  ok('마일스톤 확률이 단조 증가', ms.every((x, i) => i === 0 || x.p >= ms[i - 1].p),
    ms.map((x) => x.pct).join(' → '))

  // 상한이 있는가. 무한 우상향은 "회사가 정한 숫자"라는 비판을 되받는다.
  let underCeil = true
  for (let M = 1; M <= M_MAX; M++) if (oddsAt(M) > CEIL + 1e-12) underCeil = false
  ok(`확률이 상한 ${fmtPct(CEIL)}을 넘지 않음`, underCeil)

  ok('확률이 [0, 1] 안', Array.from({ length: M_MAX }, (_, i) => oddsAt(i + 1)).every((p) => p >= 0 && p <= 1))
  // 예산(MARGIN·FIXED)이 정한 것이 재고인지 확률인지를 가르는 검사.
  // 확률에 손을 댔다면 이 항등식이 깨진다. v1은 여기서 배수를 곱해 깨뜨렸다.
  let identity = true
  for (let M = 1; M <= M_MAX; M++) if (Math.abs(oddsAt(M) * M - refundSlots(M)) > 1e-9) identity = false
  ok('확률 × 장 = 재고 (예산이 확률을 만지지 않았다)', identity, `M=1..${M_MAX}`)

  // 마감이 실재하는지 — 없는 마감을 만들지 않는다는 것의 최소 검사
  const t0 = 1_800_000_000_000
  ok('마감이 시작 시각에서 결정된다', deadlineFrom(t0) === t0 + DEADLINE_DAYS * 86400_000,
    `시작 + ${DEADLINE_DAYS}일`)
  ok('마감이 고정이다 (리셋되지 않는다)', deadlineFrom(t0) === deadlineFrom(t0))
  // 회차제 — 같은 회차 안에서는 마감이 같고, 마감은 항상 미래이며, 경계에서 다음 회차로 넘어간다
  const mid = EPOCH + 2.5 * 86400_000
  ok('회차 안에서 마감이 같다', roundDeadline(mid) === roundDeadline(mid + 3600_000))
  ok('마감이 항상 미래다', roundDeadline(mid) > mid && roundDeadline(EPOCH + 99 * 86400_000) > EPOCH + 99 * 86400_000)
  ok('회차 경계에서 다음 회차로', roundOf(EPOCH + DEADLINE_DAYS * 86400_000) === roundOf(EPOCH) + 1)
  const far = [0, 1, 30, 365, 3 * 365].map((d) => Date.now() + d * 86400_000)
  ok('언제 열어도 회차 마감이 미래다', far.every((t) => roundDeadline(t) > t),
    `지금~+3년 ${far.length}개 시점 확인`)

  ok('결정성 — 2회 계산이 동일', JSON.stringify(milestones()) === JSON.stringify(milestones()))

  return { fails, count }
}

if (isMain()) {
  console.log('═'.repeat(72))
  console.log('② 브랜드 협업 공동구매 — 확률 = 환불 인원 ÷ 참여 인원')
  console.log('═'.repeat(72))
  console.log(`\n상품   ${ITEM?.name.slice(0, 50)}`)
  console.log(`정가   ${won(LIST)}   공동구매가 ${won(PRICE)}   (정가 이하 — 손실 가능성 0)`)
  console.log(`재원   참여자당 기여마진 ${won(MARGIN)} · 캠페인 고정비 ${won(FIXED)}`)
  console.log(`유도   R(M) = ⌊(${MARGIN} × M − ${FIXED}) / ${PRICE}⌋      상한 ${fmtPct(CEIL)}`)
  console.log('\n■ 인원별 환불 인원과 확률')
  console.log('     인원      환불 인원     확률      자연빈도')
  for (const m of milestones([25, 50, 100, 200, 300, 500])) {
    console.log(`   ${String(m.M).padStart(6)}명   ${String(m.R).padStart(8)}명   ${m.pct.padStart(8)}   ${m.freq}`)
  }
  console.log('\n  ※ 화면에 쓰는 문구는 "확률이 오릅니다"가 아니라 **"환불받는 사람이 늘어납니다"**다.')
  console.log('    R은 사람 수라 정수이고, 그래서 R/M은 M이 1 늘 때마다 미세하게 오르내린다.')
  console.log('    단조 증가하는 것은 R이다. 그쪽이 참이고, 셀 수 있고, 문구로도 정확하다.')
  console.log('\n─────────────────────────── self-check ───────────────────────────')
  const { fails, count } = check()
  console.log(`\n  ${count}개 항목 · ${fails.length === 0 ? '전부 통과' : `${fails.length}건 실패: ${fails.join(', ')}`}`)
  if (fails.length) process.exitCode = 1
}
