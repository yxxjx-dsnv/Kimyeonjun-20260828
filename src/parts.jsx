/**
 * 화면 조각들. 로직은 App.jsx가 갖고, 여기는 그리기만 한다.
 *
 * ## 규칙 하나: 이 파일은 확률을 계산하지도 포맷하지도 않는다 (I4)
 * 확률 문자열은 서버가 만든 것을 그대로 렌더한다. 화면에서 toFixed를 부르는 순간
 * 서버와 두 벌이 되고, 두 벌은 반드시 어긋난다. v1에서 같은 배수가 코드·덱·문서에서
 * 서로 달랐던 것이 그 결과다.
 * v1의 이 파일에는 pct()·naturalFreq()가 있었고 TierStrip이 그것을 불렀다.
 * v2에서는 되살리지 않는다 — 앱 셸은 가져오되 그 습관은 가져오지 않는다.
 *
 * ## 규칙 둘: 숫자와 단위를 한 노드에 담는다
 * v1에서 `+{won(v)}`가 React 렌더에서 `+<!-- -->1,300원`으로 쪼개져 문구 매칭이
 * 깨진 적이 있다. 템플릿 리터럴로 합친다.
 */
import { useEffect, useRef, useState } from 'react'

export const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`

/** 참여비 대비 손익. 꽝이 없으므로 항상 0 이상이지만, 값은 그대로 보여준다. */
export const Delta = ({ v }) =>
  v === 0 ? null : <b className={v > 0 ? 'delta up' : 'delta dn'}>{`${v > 0 ? '+' : ''}${won(v)}`}</b>

export const TIERS = ['S', 'A', 'B', 'C']
export const TIER_LABEL = { S: '최고 등급', A: '상위 등급', B: '중간 등급', C: '기본 등급' }

/** 포켓몬 TCG의 실제 레어도 기호. 이 세계의 어휘를 그대로 쓴다. */
const GLYPH = { C: '●', B: '◆', A: '★', S: '✦' }
export const Rarity = ({ tier }) => (
  <span className={`rarity t-${tier}`} aria-hidden="true">{GLYPH[tier]}</span>
)

/* ── 아이콘 (v1 원문) ──────────────────────────────────────── */
const I = (d) => (p) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}><path d={d} /></svg>
)
export const IconHome = I('M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5')
export const IconContent = I('M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM16 10l5-3v10l-5-3')
export const IconHeart = I('M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20Z')
export const IconUser = I('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0')
export const IconBox = I('M12 3 3.5 7.5 12 12l8.5-4.5L12 3ZM3.5 7.5v9L12 21l8.5-4.5v-9M12 12v9')
export const IconCart = I('M4 5h2l2.2 9.4a1.5 1.5 0 0 0 1.5 1.1h7.5a1.5 1.5 0 0 0 1.45-1.1L20.5 8H7M10 19.5h.01M17 19.5h.01')
export const IconSearch = I('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4')

export const Badge = ({ kind = '', children }) => <span className={`badge ${kind}`}>{children}</span>
/** 시뮬레이션인 것은 반드시 배지를 단다 (I13). */
export const SimBadge = ({ what }) => <span className="simtag">{`시뮬 · ${what}`}</span>

/* ── 홈 탭 상품 카드 (v1 원문 그대로) ───────────────────────── */
export function ProductCard({ item, badge }) {
  return (
    <a className="pcard" href={item.url} target="_blank" rel="noreferrer noopener">
      <div className="pcard__thumb">
        {item.image ? <img src={item.image} alt="" loading="lazy" /> : <div className="pcard__ph" />}
        {/* 실제 앱은 여기가 장바구니 버튼이다. 담기를 구현하지 않았으므로
            같은 자리에 '판매처에서 보기'를 둔다 — 슬롯은 채우되 거짓말은 안 한다. */}
        <span className="pcard__go" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </div>
      {/* 칩 줄은 스펙이 없어도 자리를 차지한다 — 옆 카드와 행이 어긋나지 않게. */}
      <span className="pcard__chips">
        {(item.spec || []).slice(0, 2).map((c, i) => (
          <span key={i} className="chip2">{c.length > 12 ? c.slice(0, 12) + '…' : c}</span>
        ))}
      </span>
      <p className="pcard__seller">{item.seller} <span aria-hidden="true">›</span></p>
      <p className="pcard__name">{item.name}</p>
      <p className="pcard__price"><em>최저가</em>{won(item.price)}</p>
      {badge && <span className="badge badge--sale">{badge}</span>}
      {item.rating != null && (
        <p className="pcard__rate">
          <span className="pcard__star" aria-hidden="true">★</span>{item.rating}
          {item.reviews != null && (
            /* 다나와는 리뷰수를 999에서 끊는다. 그 이상은 999+로 적는다. */
            <span className="pcard__rv">{`(리뷰 ${item.reviews >= 999 ? '999+' : item.reviews.toLocaleString('ko-KR')})`}</span>
          )}
        </p>
      )}
    </a>
  )
}

/* ── 박스 그리드 — 1,000칸. 이 제품의 서명 ─────────────────────
   오리파가 보여주지 않는 것을 화면이 직접 보여준다.
   세어볼 수 있다는 것이 요점이라 요약하거나 축약하지 않는다. */
export function BoxGrid({ slotTiers, drawn = [], revealed = null }) {
  const taken = new Set(revealed === null ? drawn : drawn.slice(0, revealed))
  return (
    <div className="boxgrid" role="img"
      aria-label={`통 ${slotTiers.length}구좌. 뽑힌 구좌 ${taken.size}개.`}>
      {Array.from(slotTiers, (t, i) => (
        <div key={i} className={`cell t-${t}${taken.has(i) ? ' gone' : ''}`} />
      ))}
    </div>
  )
}

export function GridLegend({ tiers }) {
  return (
    <div className="grid-legend">
      {tiers.map((t) => (
        <span className="legend-item" key={t.tier}>
          <Rarity tier={t.tier} />
          <span>{`${t.tier}등급`}</span>
          <span className="num">{`${t.K.toLocaleString('ko-KR')}구좌`}</span>
        </span>
      ))}
    </div>
  )
}

/* ── 등급별 진열 — 소비자가 보는 "뭐가 들어있나" ─────────────
   1,000칸 그리드를 여기 두었더니 970개 회색 네모가 "97% 확률로 별거 아닌 게
   나옵니다"로 읽혔다. 검증용으로는 좋지만 사고 싶어지는 화면이 아니다.
   진열은 실물 카드로 하고, 1,000칸은 근거 시트에서 요청했을 때 보여준다.

   확률 문자열은 서버가 만든 것을 그대로 쓴다(I4). 여기서 계산하지 않는다. */
export function TierShowcase({ tier, pct, freq, hero }) {
  const shown = tier.cards.slice(0, hero ? 1 : 6)
  return (
    <section className={`tshow ${hero ? 'tshow--hero' : ''}`}>
      <header className="tshow__head">
        <span className={`tier tier--${tier.tier}`}>{tier.tier}</span>
        <span className="tshow__label">{TIER_LABEL[tier.tier]}</span>
        <span className="tshow__odds">
          <b>{pct}</b>
          <em>{freq}</em>
        </span>
      </header>

      {hero ? (
        <div className="tshow__hero">
          {shown[0]?.image
            ? <img src={shown[0].image} alt="" loading="lazy" />
            : <span className="tshow__ph" />}
          <div className="tshow__heroinfo">
            <p className="tshow__heronm">{shown[0]?.name}</p>
            <p className="tshow__heropr">{won(shown[0]?.price ?? 0)}</p>
            {shown[0]?.auth !== 'official' && <span className="kc">정품 미확인</span>}
          </div>
        </div>
      ) : (
        <ul className="tshow__row">
          {shown.map((it) => (
            <li key={it.id}>
              <a href={it.url} target="_blank" rel="noreferrer noopener">
                {it.image ? <img src={it.image} alt="" loading="lazy" /> : <span className="tshow__ph" />}
                <span className="tshow__nm">{it.name}</span>
                <span className="tshow__pr">{won(it.price)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="tshow__foot">
        {`${tier.K.toLocaleString('ko-KR')}구좌 · ${tier.cards.length}종`}
        {tier.cards.length > shown.length && `  ·  외 ${tier.cards.length - shown.length}종`}
        {`  ·  ${won(tier.minPrice)} ~ ${won(tier.maxPrice)}`}
      </p>
    </section>
  )
}

/* ── 참여자 + n/10 게이트 (v1 원문) ─────────────────────────── */
export function MemberRail({ members, teamMax, readyCount, phase }) {
  const slots = Array.from({ length: teamMax }, (_, i) => members[i] || null)
  const sims = members.filter((m) => m.sim).length
  return (
    <div className="rail">
      <div className="rail__row">
        {slots.map((m, i) => (
          // 시뮬 표시를 아바타마다 붙였더니 글자를 가려 읽히지 않았다.
          // 아바타는 점선 테두리로만 구분하고, 문구는 아래 한 줄에서 한 번만 밝힌다.
          <div key={i} className={`av ${m ? 'is-in' : ''} ${m?.sim ? 'is-sim' : ''} ${m?.ready ? 'is-ready' : ''}`}
            title={m ? `${m.name}${m.sim ? ' (체험용)' : ''}` : '빈 자리'}>
            <span className="av__face">{m ? m.name.slice(0, 1) : ''}</span>
          </div>
        ))}
      </div>
      <p className="rail__count">
        <strong>{members.length}</strong>
        <span>{`/ ${teamMax}명 참여`}</span>
        {sims > 0 && <span className="rail__sim">{`${sims}명은 체험용`}</span>}
        {phase === 'ready' && (
          <em className={readyCount === members.length ? 'is-full' : ''}>
            {`뽑기 ${readyCount}/${members.length}`}
          </em>
        )}
      </p>
    </div>
  )
}

/* ── 개봉 장면 — 이 제품의 유일한 극장 (v1 원문, v2 데이터) ────
   평소 화면은 올웨이즈 문법을 따르고, 대담함은 여기에만 쓴다.
   등급색 광선 + 카드 플립. S/A만 색종이가 떨어진다.
   prefers-reduced-motion이면 전역 규칙이 모든 animation을 끈다.

   v2에서 한 줄 더한다 — 뽑기 직전의 남은 구좌와 그때의 확률.
   비복원이라는 주장을 개봉 순간에 바로 보여주기 위해서다. */
export function RevealScene({ r, fee, onClose }) {
  const big = r.tier === 'S' || r.tier === 'A'
  return (
    <div className={`scene scene--${r.tier}`} onClick={onClose}
      role="button" tabIndex={0} aria-label="결과 확인 — 눌러서 전체 결과 보기"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose() }}>
      <span className="scene__rays" aria-hidden="true" />
      {big && (
        <span className="scene__confetti" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => <i key={i} />)}
        </span>
      )}
      <div className="scene__card">
        <span className={`tier tier--${r.tier} scene__tier`}>{r.tier}</span>
        <p className="scene__grade">{`${TIER_LABEL[r.tier]} 당첨`}</p>
        {r.image ? <img src={r.image} alt="" /> : <span className="scene__ph" />}
        <p className="scene__nm">{r.name_}</p>
        <p className="scene__pr">
          {`낸 돈 ${won(fee)} → 시가 `}<b>{won(r.price)}</b>{' '}
          <Delta v={r.price - fee} />
        </p>
        <p className="scene__odds">
          {`뽑기 직전 남은 구좌 ${r.slotsBefore.toLocaleString('ko-KR')}개 · 그때 ${r.tier}등급 확률 ${r.oddsBefore[r.tier].pct}`}
        </p>
      </div>
      <p className="scene__hint">탭해서 전체 결과 보기</p>
    </div>
  )
}

/* ── 개봉 결과 카드 (v1 원문, v2 데이터) ────────────────────── */
export function RevealCard({ r, mine, fee, delay }) {
  return (
    <li className={`rv ${mine ? 'is-mine' : ''}`} style={{ animationDelay: `${delay}ms` }}>
      <header className="rv__head">
        <span className="rv__who">{`${r.name}${mine ? ' (나)' : ''}`}</span>
        {!mine && <span className="simtag">시뮬</span>}
        <span className={`tier tier--${r.tier}`}>{r.tier}</span>
      </header>
      <ul className="rv__items">
        <li>
          {r.image ? <img src={r.image} alt="" loading="lazy" /> : <span className="tstrip__ph" />}
          <span className="rv__nm">{r.name_}</span>
          <span className="rv__pr">{won(r.price)}</span>
        </li>
      </ul>
      <p className="rv__settle">
        {`낸 돈 ${won(fee)} · 받은 시가 `}<b>{won(r.price)}</b>{' '}
        <Delta v={r.price - fee} />
      </p>
      <p className="rv__before">
        {`뽑기 직전 ${r.slotsBefore.toLocaleString('ko-KR')}구좌 남음 · S ${r.oddsBefore.S.pct}`}
      </p>
      {/* 이 카드가 실재하고 지금 이 가격에 팔린다는 증명 — 크롤 url을 그대로 쓴다.
          배송 리드타임은 가진 데이터가 없으므로 지어내지 않고 한계를 그 자리에 적는다. */}
      {mine && r.url && (
        <p className="rv__src">
          <a href={r.url} target="_blank" rel="noreferrer">판매처에서 보기 ›</a>
          <span>실물 배송·수령은 이 MVP에서 구현하지 않았습니다</span>
        </p>
      )}
    </li>
  )
}

/* ── 인원별 확률표 ─────────────────────────────────────────
   pct·freq·mul은 전부 서버가 만든 문자열이다.
   K=1인 등급만 "정확히 n배"이고 나머지는 아니다 — 그것을 그대로 표시한다. */
export function OddsTable({ odds, n }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr><th>등급</th><th>재고</th><th>혼자</th><th>{`팀 ${n}명`}</th><th>혼자 대비</th></tr>
        </thead>
        <tbody>
          {odds.map((o) => {
            const t = o.team[n - 1]
            return (
              <tr key={o.tier}>
                <td><span className={`tier tier--${o.tier}`}>{o.tier}</span></td>
                <td className="n">{`${o.K.toLocaleString('ko-KR')}장`}</td>
                <td className="n">{o.soloPct}<span className="freq">{o.soloFreq}</span></td>
                <td className="n hi">{t.pct}<span className="freq">{t.freq}</span></td>
                <td className="n hi">
                  {t.mul}
                  <span className="freq">{o.exactlyLinear ? '재고가 1장이라 정확히 n배' : '재고가 여러 장이라 n배보다 작다'}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** 갱신 확률표. —는 확률 0이 아니라 성립 불가능한 상태다 (I17). */
export function UpdateTable({ updates, tiers }) {
  const js = updates[tiers[0]].map((r) => r.j)
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th>등급</th>{js.map((j) => <th key={j} className="num">{`${j}구좌`}</th>)}</tr></thead>
        <tbody>
          {tiers.map((g) => (
            <tr key={g}>
              <td><span className={`tier tier--${g}`}>{g}</span></td>
              {updates[g].map((r) => (
                <td key={r.j} className="n">{r.possible ? r.pct : <span className="unknown">—</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** 박스 안의 카드 하나. 지목 버튼이기도 하다. */
export const CardPick = ({ card, picked, onPick, count = 0 }) => (
  <button type="button" className="cardpick" aria-pressed={picked} onClick={() => onPick(card.id)}>
    {card.image ? <img src={card.image} alt="" loading="lazy" /> : <span className="cardpick__ph" aria-hidden="true" />}
    <span className="cardpick__body">
      <span className="cardpick__top">
        <Rarity tier={card.tier} />
        <span className="cardpick__pr">{won(card.price)}</span>
        {count > 0 && <span className="cardpick__cnt">{`${count}명 지목`}</span>}
      </span>
      <span className="cardpick__nm">{card.name}</span>
    </span>
  </button>
)

/** 교환 고리 — A→B→C→A가 실제로 보여야 한다. */
export function CycleView({ cycles }) {
  if (!cycles.length) {
    return <p className="cycle__none">이번 라운드에는 성립한 교환이 없습니다. 서로 원하는 것이 엇갈리지 않았습니다.</p>
  }
  return (
    <div>
      {cycles.map((c, i) => (
        <div className="cycle" key={i}>
          {c.map((m, j) => (
            <span key={m.id}>
              <span className="who">{m.name}</span>
              <span className="arrow">{' → '}</span>
              {j === c.length - 1 && <span className="who">{c[0].name}</span>}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

/** 교환 전/후. worse는 개별 합리성상 나올 수 없고, 나오면 화면이 그것을 드러낸다. */
export function TradeTable({ results, me }) {
  return (
    <ul className="tr__list">
      {results.map((r) => (
        <li key={r.memberId} className={`tr ${r.memberId === me ? 'is-mine' : ''}`}>
          <header className="tr__head">
            <span className="tr__who">{`${r.name}${r.memberId === me ? ' (나)' : ''}`}</span>
            {r.worse ? <Badge>{'나빠짐 — 있으면 안 되는 결과'}</Badge>
              : r.improved ? <Badge kind="ai">{`선호 ${r.gain}단계 개선`}</Badge>
                : <Badge kind="rule">{'그대로'}</Badge>}
          </header>
          <div className="tr__swap">
            <span className="tr__side">
              <span className={`tier tier--${r.before?.tier}`}>{r.before?.tier}</span>
              <span className="tr__nm">{r.before?.name?.slice(0, 22)}</span>
              <span className="tr__pr">{r.before ? won(r.before.price) : '—'}</span>
            </span>
            <span className="tr__arrow" aria-hidden="true">→</span>
            <span className="tr__side">
              <span className={`tier tier--${r.after?.tier}`}>{r.after?.tier}</span>
              <span className="tr__nm">{r.after?.name?.slice(0, 22)}</span>
              <span className="tr__pr">{r.after ? won(r.after.price) : '—'}</span>
            </span>
          </div>
          {r.gotTarget && <p className="tr__got">지목한 카드를 받았습니다</p>}
        </li>
      ))}
    </ul>
  )
}

/* ── 마감 시계 — 마감이 실재하는 형식(②③)에만 그려진다 ─────────
   ①(팀 뽑기)은 전원 준비 시 즉시 열리므로 마감이 실재하지 않고, 서버가
   deadlineAt을 null로 내려 이 컴포넌트 자체가 그려지지 않는다(I10').
   "얼마 안 남았어요" 같은 감정 문구는 쓰지 않는다 — 시각은 사실이고 재촉은 연출이다. */
export function DeadlineTicker({ deadlineAt, label = '마감까지' }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadlineAt) return undefined
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [deadlineAt])
  if (!deadlineAt) return null
  const left = deadlineAt - now
  if (left <= 0) return <span className="ticker ticker--over">마감됨</span>
  const s = Math.floor(left / 1000)
  const d = Math.floor(s / 86400)
  const pad = (x) => String(x).padStart(2, '0')
  const hms = `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
  return (
    <span className="ticker" role="timer">
      <em>{label}</em>
      <b>{d > 0 ? `${d}일 ${hms}` : hms}</b>
    </span>
  )
}

/* ── 판매 게이지 — 이 제품에서 분모는 장식이 아니라 확률이다 ─────
   누적 판매량은 서버가 세지 않으므로 표시하지 않는다(가짜 판매량 금지).
   그리는 것은 "이 방의 통에서 빠진 구좌"뿐 — 서버 값이고 세면 맞는다. */
export function Gauge({ num, den, label }) {
  const ratio = den > 0 ? Math.min(1, num / den) : 0
  return (
    <div className="gauge" role="img" aria-label={label}>
      {/* 폭은 정수 %면 충분하다 — toFixed는 확률 경로에서 금지라 여기서도 안 쓴다 */}
      <div className="gauge__bar"><span style={{ width: `${Math.round(ratio * 100)}%` }} /></div>
      <span className="gauge__t">{label}</span>
    </div>
  )
}

/* ── 딜 카드 — 목록 화면의 단위. 모든 문자열은 서버(deals[])가 만든다 ──
   커머스 카드의 표준 위계: 가장 큰 활자는 언제나 "내가 내는 돈".
   취소선·할인율은 서버가 내려준 것만 그린다 — ①은 정가가 없어 null이고,
   여기서 %를 만들어 그리는 순간 지어낸 수가 된다(I4). */
export function DealCard({ deal, onOpen }) {
  const KIND = { team: '팀 뽑기', group: '공동구매', daily: '0원 응모' }
  return (
    <button type="button" className={`deal deal--${deal.kind}`} onClick={() => onOpen(deal)}>
      <span className="deal__media">
        {deal.image ? <img src={deal.image} alt="" loading="lazy" /> : <span className="deal__ph" />}
        <span className="deal__kind">{KIND[deal.kind]}</span>
        {deal.deadlineAt && <span className="deal__due"><DeadlineTicker deadlineAt={deal.deadlineAt} label="" /></span>}
      </span>
      <span className="deal__body">
        <span className="deal__title">{deal.title}</span>
        <span className="deal__sub">{deal.subtitle}</span>
        <span className="deal__price">
          {deal.price.discount && <b className="deal__disc">{deal.price.discount}</b>}
          {deal.price.strike && <s>{deal.price.strike}</s>}
          <b className="deal__big">{deal.price.big}</b>
        </span>
        <span className="deal__note">{deal.price.sub}</span>
        <span className="deal__odds">{deal.oddsLine}</span>
        <span className={`deal__dir deal__dir--${deal.dir}`}>
          {deal.dir === 'up' ? '↑ ' : '↓ '}{deal.dirLine}
        </span>
      </span>
      <span className="deal__go" aria-hidden="true">›</span>
    </button>
  )
}

/* ── 프로젝트 Q&A 독 — VS Code 터미널 문법 ────────────────────
   채용 담당자용. 화면 하단에 접혀 있다가 열면 패널이 올라온다.
   답변은 /api/ask가 저장소 문서 발췌 안에서만 생성한다. 키가 없으면
   문서 발췌를 그대로 보여주는 폴백으로 내려앉고 배지로 표기한다(I13). */
export function ChatDock({ open, onToggle, messages, onSend, busy }) {
  const [q, setQ] = useState('')
  const listRef = useRef(null)
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, busy])
  const submit = (text) => {
    const t = (text ?? q).trim()
    if (!t || busy) return
    setQ('')
    onSend(t)
  }
  const PRESETS = ['왜 이 문제를 골랐나요?', '확률은 어떻게 정해지나요?', '왜 올웨이즈인가요?', '크롤 데이터는 어디에 쓰이나요?']
  if (!open) {
    return (
      <button type="button" className="dock dock--closed" onClick={onToggle} aria-expanded="false">
        <span className="dock__dot" aria-hidden="true">●</span>
        프로젝트 Q&A — 이 과제에 대해 물어보세요
        <span className="dock__caret" aria-hidden="true">▲</span>
      </button>
    )
  }
  return (
    <section className="dock dock--open" aria-label="프로젝트 Q&A">
      <header className="dock__head">
        <span className="dock__dot" aria-hidden="true">●</span>
        <b>프로젝트 Q&A</b>
        <span className="dock__hint">저장소 문서(README · SPEC · 근거 대장)에서만 답합니다</span>
        <button type="button" className="dock__x" onClick={onToggle} aria-label="접기">▼</button>
      </header>
      <div className="dock__list" ref={listRef}>
        {messages.length === 0 && (
          <div className="dock__empty">
            <p>지원자의 의도·설계 근거를 물어보세요. 답은 저장소 문서 발췌에 근거합니다.</p>
            <div className="dock__chips">
              {PRESETS.map((t) => (
                <button key={t} type="button" onClick={() => submit(t)}>{t}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`dockmsg dockmsg--${m.role}`}>
            <p>{m.content}</p>
            {m.role === 'assistant' && (
              <footer>
                {m.source === 'fallback' && <span className="simtag">문서 발췌 · AI 미사용</span>}
                {m.source === 'openai' && m.refs?.length > 0 && (
                  <details><summary>근거 {m.refs.length}건</summary>
                    <ul>{m.refs.map((r) => <li key={r}>{r}</li>)}</ul>
                  </details>
                )}
              </footer>
            )}
          </div>
        ))}
        {busy && <div className="dockmsg dockmsg--assistant dockmsg--wait"><p className="dock__wait">문서를 찾는 중…</p></div>}
      </div>
      <form className="dock__input" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="예: 천장이 왜 없나요?" aria-label="질문" maxLength={300} />
        <button type="submit" disabled={busy || !q.trim()}>질문</button>
      </form>
    </section>
  )
}
