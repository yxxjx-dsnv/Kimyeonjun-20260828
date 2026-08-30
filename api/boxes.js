/**
 * GET /api/boxes — 통 구성과 확률표.
 *
 * 화면이 확률을 계산하지 않는다. 여기서 계산한 것을 **문자열까지** 내려보내고
 * 화면은 렌더만 한다(I4). 두 벌로 관리하면 반드시 어긋난다 — v1에서 실제로
 * 코드·덱·문서의 배수가 서로 달랐다.
 *
 * roomId를 주면 그 방의 **현재** 통 상태로 갱신된 확률을 함께 내려준다(I3).
 */
import { BOX, BOXES, TIERS, slotsOf, remainingFrom, tierCountsOf } from './_box.js'
import { allOdds, updateTable, pSolo, fmtPct, naturalFreq } from './_draw.js'
import * as G from './_group.js'
import * as D from './_daily.js'
import { SUGGEST } from './search.js'
import { readRoom, kvEnabled } from './_room.js'
import conversion from '../data/conversion.json' with { type: 'json' }
import oripaAudit from '../data/oripa-audit.json' with { type: 'json' }


const won = (n) => n.toLocaleString('ko-KR') + '원'

/**
 * 딜 목록 — 화면 카드에 찍히는 **모든 문자열**을 여기서 만든다.
 * 화면이 숫자를 조립하기 시작하면(I4 위반) 서버와 두 벌이 되고 반드시 어긋난다.
 * 시간 의존 값(마감)은 요청 시각으로 계산하되, 규칙은 각 모듈이 소유한다.
 */
export function buildDeals(now) {
  const teamDeals = BOXES.map((box) => {
    const odds = allOdds(box)
    const S = odds[0]
    const nMax = S.team[box.teamMax - 1]
    const cTier = box.tiers.find((t) => t.tier === 'C')
    const sTier = box.tiers[0]
    return {
      kind: 'team', id: box.id,
      title: `${box.name} 올박스`, subtitle: box.desc,
      image: sTier.cards[0].image,
      topCard: { name: sTier.cards[0].name, priceLine: `시가 ${won(sTier.maxPrice)}` },
      // 가격 블록 — 가장 큰 활자는 언제나 "내가 내는 돈". 뽑기에는 정가가 없으므로
      // 취소선·할인율을 만들지 않는다(만드는 순간 지어낸 수다).
      price: {
        big: won(box.fee), strike: null, discount: null,
        sub: `받는 카드 최소 ${won(cTier.minPrice)} ~ 최대 ${won(sTier.maxPrice)}`,
        bands: box.tiers.slice().reverse().map((t) =>
          `${t.tier} ${won(t.minPrice)}${t.minPrice !== t.maxPrice ? `~${won(t.maxPrice)}` : ''}`).join(' · '),
      },
      oddsLine: `팀 ${box.teamMax}명이면 S등급 ${nMax.pct} · 혼자 대비 ${nMax.mul}`,
      varietyLine: box.tiers.map((t) => `${t.tier} ${t.cards.length}종`).join(' · '),
      dir: 'up', dirLine: '사람이 모일수록 확률이 오릅니다',
      floorLine: `꽝 없음 — 최저 ${won(cTier.minPrice)}, 참여비 ${won(box.fee)} 이상`,
      deadlineAt: null,   // 전원 준비 시 즉시 열린다. 마감이 실재하지 않으므로 적지 않는다(I10')
      cta: `${won(box.fee)} 참여하기`,
    }
  })

  const gRound = G.roundOf(now)
  const gDeal = {
    kind: 'group', id: 'group',
    title: '브랜드 공동구매', subtitle: `${gRound}회차 · 당첨되면 제품을 무료로 드려요`,
    image: G.ITEM?.image ?? null,
    topCard: { name: G.ITEM?.name ?? '', priceLine: `정가 ${won(G.LIST)}` },
    // 공동구매가 = 정가. 할인율 0%이므로 취소선을 만들지 않는다 — 여기서 -x%를
    // 지어내면 "확률로 포장한 가격 인상을 피했다"는 논증 전체가 무너진다.
    price: {
      big: won(G.PRICE), strike: null, discount: null,
      sub: `정가 ${won(G.LIST)} · 웃돈 0원`,
      bands: null,
    },
    oddsLine: `${G.M_MAX}명이 모이면 ${G.milestones([G.M_MAX])[0].freq} · 전액 무료`,
    milestones: G.milestones(),
    ceilLine: `당첨 확률은 최대 ${G.fmtPct(G.CEIL)}까지 올라갑니다`,
    live: G.liveOf(now),
    dir: 'up', dirLine: '사람이 모일수록 당첨 인원이 늘어납니다',
    deadlineAt: G.roundDeadline(now), round: gRound,
    cta: `${won(G.PRICE)} 공동구매 참여하기`,
  }

  const dDeal = {
    kind: 'daily', id: 'daily',
    title: '0원 응모 특가', subtitle: '오늘 자정 추첨 · 응모는 무료입니다',
    image: D.ITEM?.image ?? null,
    topCard: { name: D.ITEM?.name ?? '', priceLine: `정가 ${won(D.LIST)}` },
    price: {
      big: won(D.DEAL), strike: won(D.LIST),
      discount: `-${Math.round((1 - D.DEAL / D.LIST) * 100)}%`,
      // 큰 활자 1,000원은 **당첨됐을 때 사는 값**이다. 그 말을 안 하면
      // "응모 0원"과 정면으로 충돌해 읽는 사람이 무엇을 내는지 모른다.
      sub: `당첨되면 이 가격에 구매합니다 · 응모는 무료입니다`,
      bands: null,
    },
    /* 목록 카드에서 가장 큰 활자는 **지금 내는 돈**이어야 한다.
       1,000원은 당첨됐을 때 사는 값이라 카드에 크게 박으면 "응모비"로 오독된다.
       배너는 맥락(오늘의 0원 응모)이 있어 price를 그대로 쓴다. */
    entry: {
      big: '무료 응모', strike: null, discount: null,
      sub: `당첨되면 ${won(D.LIST)} → ${won(D.DEAL)} (${`-${Math.round((1 - D.DEAL / D.LIST) * 100)}%`})`,
      bands: null,
    },
    oddsLine: `특가 ${D.SLOTS}개 · 응모자 수에 따라 확률이 정해집니다`,
    table: D.table(),
    live: D.liveOf(now),
    dir: 'down', dirLine: '응모가 많을수록 확률이 내려갑니다',
    deadlineAt: D.closesAt(now),
    cta: `0원으로 응모하기`,
  }

  return [...teamDeals, gDeal, dDeal]
}

export default async function handler(req, res) {
  // 코드와 크롤 데이터로 정해지므로 배포마다 내용이 바뀐다.
  // v1은 s-maxage=3600을 걸어 배포해도 화면이 안 바뀌는 사고가 있었다.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600')

  const roomId = req.query?.roomId
  let live = null
  if (roomId) {
    const room = await readRoom(roomId)
    if (room) {
      const remaining = remainingFrom(room.drawn)
      const counts = tierCountsOf(remaining)
      live = {
        roomId,
        drawn: room.drawn.length,
        left: remaining.length,
        tiers: TIERS.map((g) => {
          const p = remaining.length ? counts[g] / remaining.length : null
          return { tier: g, K: counts[g], N: remaining.length, p, pct: fmtPct(p), freq: naturalFreq(p, BOX.N) }
        }),
      }
    }
  }

  res.status(200).json({
    /** 추천 검색어 — 크롤 상품명 빈도에서 유도. 손으로 고르지 않는다. */
    suggest: SUGGEST,
    /** 딜 목록 — 목록 화면의 유일한 출처. */
    deals: buildDeals(Date.now()),
    /** 통별 상세 — ① 상세 화면이 통 선택에 따라 읽는다. */
    boxes: BOXES.map((b) => ({
      box: b,
      slotTiers: slotsOf(b).map((s) => s.tier).join(''),
      odds: allOdds(b),
      updates: Object.fromEntries(TIERS.map((g) => [g, updateTable(g, [0, 250, 500, 750, 900, 990], b)])),
    })),
    box: BOX,
    /**
     * 장별 등급을 인덱스 순서대로 이어붙인 문자열 (길이 N).
     * 화면의 1,000칸 그리드가 이것을 그대로 읽는다. 클라이언트가 통을 다시
     * 펼치면 서버와 두 벌이 되고, 두 벌은 반드시 어긋난다(I15).
     */
    slotTiers: slotsOf().map((s) => s.tier).join(''),
    odds: allOdds(),
    updates: Object.fromEntries(TIERS.map((g) => [g, updateTable(g, [0, 250, 500, 750, 900, 990])])),
    live,
    /**
     * 교환 전환율 — node api/_trade.js가 10만 회 시뮬로 재서 파일로 내보낸 값이다.
     * 화면은 이 문자열을 그대로 렌더한다. 손으로 적지 않는다.
     */
    conversion,
    /**
     * 오리파 확률 표기 실측 — node crawler/crawl.js oripa 의 출력이다.
     * 화면의 첫 문단이 이 숫자를 쓴다. 손으로 적으면 크롤을 다시 돌려도 화면이
     * 안 바뀌고, 그 순간 "직접 조사했다"는 주장이 검증 불가능해진다.
     */
    oripa: {
      total: oripaAudit.oripaTotal,
      probNum: oripaAudit.probNum,
      guarantee: oripaAudit.guarantee,
      undisclosed: oripaAudit.undisclosed,
      detailReached: oripaAudit.detailReached,
      unreachable: oripaAudit.oripaTotal - oripaAudit.detailAttempted,
      auditedAt: oripaAudit.auditedAt,
      limit: oripaAudit.method.limit,
    },
    // 계산 근거 — 화면의 '근거' 시트가 이 문자열을 그대로 쓴다.
    basis: {
      individual: 'P(g) = K_g / N  (재고 ÷ 전체 장수). 정의이지 수식이 아니다.',
      team: 'P_team(g,n) = 1 − C(N−K_g, n) / C(N, n)  (초기하분포, 비복원)',
      exact: 'K_g = 1이면 정확히 n/N — 혼자 대비 정확히 n배. 회사가 보태는 값이 없다.',
      update: 'j장이 빠지고 g가 안 나왔다면 P(g) = K_g / (N − j). 이것이 천장을 대체한다.',
      overflow: 'C(N−K,n)/C(N,n)은 곱 형태 ∏(N−n−i)/(N−i)로 계산한다. 로그감마와 1e-10 이내 일치를 self-check가 확인한다.',
      noCeiling: '천장 장치가 없다. 비복원 추출이 그 역할을 한다.',
      source: `크롤 ${BOX.crawledAt} · 다나와 · data/pool.json`,
    },
    storage: kvEnabled() ? 'kv' : 'memory',
  })
}
