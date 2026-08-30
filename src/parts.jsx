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
      aria-label={`통 ${slotTiers.length}장. 뽑힌 카드 ${taken.size}개.`}>
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
          <span className="num">{`${t.K.toLocaleString('ko-KR')}장`}</span>
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
        {`${tier.K.toLocaleString('ko-KR')}장 · ${tier.cards.length}종`}
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

   v2에서 한 줄 더한다 — 뽑기 직전의 남은 카드와 그때의 확률.
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
          {`뽑기 직전 남은 카드 ${r.slotsBefore.toLocaleString('ko-KR')}개 · 그때 ${r.tier}등급 확률 ${r.oddsBefore[r.tier].pct}`}
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
        {`낸 돈 ${won(fee)} · 받은 카드 시가 `}<b>{won(r.price)}</b>{' '}
        <Delta v={r.price - fee} />
      </p>
      <p className="rv__before">
        {`뽑기 직전 ${r.slotsBefore.toLocaleString('ko-KR')}장 남음 · S등급 ${r.oddsBefore.S.pct}`}
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
    /* 5열이면 390px에서 가로 스크롤이 생겨 한눈에 안 들어온다.
       재고는 등급 칸으로, 배수는 팀 칸으로 접어 **3열**로 맞춘다.
       서버가 만든 문자열은 하나도 버리지 않는다(I4). */
    <div className="tablewrap tablewrap--odds">
      <table>
        <thead>
          <tr><th>등급</th><th>혼자</th><th>{`팀 ${n}명`}</th></tr>
        </thead>
        <tbody>
          {odds.map((o) => {
            const t = o.team[n - 1]
            return (
              <tr key={o.tier}>
                <td className="ocell">
                  <span className={`tier tier--${o.tier}`}>{o.tier}</span>
                  <span className="freq">{`재고 ${o.K.toLocaleString('ko-KR')}장`}</span>
                </td>
                <td className="n">{o.soloPct}<span className="freq">{o.soloFreq}</span></td>
                <td className="n hi">
                  {t.pct}
                  <span className="freq">{t.freq}</span>
                  <span className="omul">
                    {t.mul}
                    <em>{o.exactlyLinear ? '재고가 1장이라 정확히 n배' : '재고가 여러 장이라 n배보다 작다'}</em>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function UpdateTable({ updates, tiers }) {
  const js = updates[tiers[0]].map((r) => r.j)
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th>등급</th>{js.map((j) => <th key={j} className="num">{`${j}장`}</th>)}</tr></thead>
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
    return <p className="cycle__none">이번 라운드에는 성립한 교환이 없습니다. 서로 원하는 카드가 맞물리지 않았습니다.</p>
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
            {r.worse ? <Badge>{'나빠짐 — 시스템 오류'}</Badge>
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
export function DeadlineTicker({ deadlineAt, label = '', size = 'sm' }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadlineAt) return undefined
    // 올웨이즈 팀구매 타이머는 0.1초까지 흐른다 — 그 감각을 맞춘다
    const t = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(t)
  }, [deadlineAt])
  if (!deadlineAt) return null
  const left = deadlineAt - now
  if (left <= 0) return <span className={`tk tk--${size} tk--over`}>마감됨</span>
  const s = Math.floor(left / 1000)
  const d = Math.floor(s / 86400)
  const pad = (x) => String(x).padStart(2, '0')
  const hms = `${pad(Math.floor(s / 3600) % 24)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
  const tenth = Math.floor((left % 1000) / 100)
  return (
    <span className={`tk tk--${size}`} role="timer">
      {label && <em className="tk__l">{label}</em>}
      <b className="tk__v">
        {d > 0 ? `${d}일 ${hms}` : `${hms}.${tenth}`}
      </b>
      <i className="tk__s">남음</i>
    </span>
  )
}

/* ── 판매 게이지 — 이 제품에서 분모는 장식이 아니라 확률이다 ─────
   누적 판매량은 서버가 세지 않으므로 표시하지 않는다(가짜 판매량 금지).
   그리는 것은 "이 방의 통에서 빠진 카드"뿐 — 서버 값이고 세면 맞는다. */
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
    /* 올웨이즈 상품 그리드 문법 — 2열, 정사각 썸네일, 배지, 취소선 위 / 할인율+최종가 아래.
       할인율만 빨강이고 금액은 잉크색이다(실제 올웨이즈 표기). */
    <button type="button" className={`deal deal--${deal.kind}`} onClick={() => onOpen(deal)}>
      <span className="deal__media">
        {deal.image ? <img src={deal.image} alt="" loading="lazy" /> : <span className="deal__ph" />}
        <span className="deal__kind">{KIND[deal.kind]}</span>
      </span>
      <span className="deal__body">
        <span className="deal__title">{deal.title}</span>
        {deal.price.strike && <s className="deal__was">{deal.price.strike}</s>}
        <span className="deal__price">
          {deal.price.discount && <b className="deal__disc">{deal.price.discount}</b>}
          <b className="deal__big">{deal.price.big}</b>
        </span>
        <span className="deal__note">{deal.price.sub}</span>
        <span className="deal__odds">{deal.oddsLine}</span>
        <span className={`deal__dir deal__dir--${deal.dir}`}>
          {deal.dir === 'up' ? '↑ ' : '↓ '}{deal.dirLine}
        </span>
        {deal.deadlineAt && <DeadlineTicker deadlineAt={deal.deadlineAt} label="마감" />}
      </span>
    </button>
  )
}

/* ── 팀원별 보유 카드 + 직접 교환 요청 ────────────────────────
   자동 배정만 있으면 "내 카드가 동의 없이 넘어갔다"로 읽힌다.
   먼저 사람에게 요청하게 하고, 서로 엇갈려 1:1로 안 풀리는 고리만
   '한 번에 맞추기'(TTC)가 푼다. 요청은 곧 선호의 표명이다. */
export function SwapBoard({ members, holdings, byId, me, requests, onRequest, onRespond, busy }) {
  const mine = holdings?.[me]
  const sent = new Set(requests.filter((q) => q.from === me).map((q) => q.to))
  const inbox = requests.filter((q) => q.to === me)
  return (
    <div className="swap">
      {inbox.length > 0 && (
        <div className="swap__inbox">
          {inbox.map((q) => {
            const who = members.find((m) => m.id === q.from)
            const theirs = byId.get(holdings?.[q.from])
            const ours = byId.get(mine)
            return (
              <div key={q.from} className="swapreq">
                <p className="swapreq__t">
                  <b>{who?.name ?? q.from}</b>님이 교환을 요청했어요
                </p>
                <p className="swapreq__d">
                  {`${theirs?.name?.slice(0, 22) ?? '카드'} (${won(theirs?.price ?? 0)})`}
                  {' ↔ '}
                  {`내 ${ours?.name?.slice(0, 22) ?? '카드'} (${won(ours?.price ?? 0)})`}
                </p>
                <div className="swapreq__b">
                  <button type="button" className="btn btn--go btn--sm"
                    onClick={() => onRespond(q.from, true)} disabled={!!busy}>수락</button>
                  <button type="button" className="btn btn--ghost btn--sm"
                    onClick={() => onRespond(q.from, false)} disabled={!!busy}>거절</button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <ul className="swap__list">
        {members.filter((m) => m.id !== me).map((m) => {
          const c = byId.get(holdings?.[m.id])
          const asked = sent.has(m.id)
          return (
            <li key={m.id} className="swapcard">
              {c?.image ? <img src={c.image} alt="" loading="lazy" /> : <span className="tstrip__ph" />}
              <div className="swapcard__b">
                <span className="swapcard__who">
                  {m.name}{m.sim && <span className="simtag">시뮬</span>}
                </span>
                <span className="swapcard__nm">{c?.name?.slice(0, 30) ?? '—'}</span>
                <span className="swapcard__pr">
                  {c && <span className={`tier tier--${c.tier}`}>{c.tier}</span>}
                  {c ? won(c.price) : ''}
                </span>
              </div>
              <button type="button" className={`swapcard__go ${asked ? 'is-sent' : ''}`}
                onClick={() => onRequest(m.id)} disabled={asked || !!busy}>
                {asked ? '요청함' : '교환 요청'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ── 친구 초대 (목업) ──────────────────────────────────────────
   링크 복사는 **진짜로 동작한다**. 다만 링크를 받은 사람이 실제로 입장하는 것은
   구현하지 않았다(방 저장소가 인스턴스별 메모리라 다른 기기에서 못 찾는다).
   그 한계를 화면에 적는다 — 되는 척하면 그게 이 제품이 비판하는 것과 같아진다. */
export function InviteBox({ roomId, teamMax, joined }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(true)
  const link = typeof window !== 'undefined'
    ? `${window.location.origin}/?room=${roomId}`
    : `/?room=${roomId}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(link) } catch { /* 권한 없으면 조용히 넘어간다 */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="invite">
      <div className="invite__head">
        <b>{`친구 ${Math.max(0, teamMax - joined)}명을 더 부를 수 있어요`}</b>
        <span>같은 박스를 함께 열면 팀 전원의 확률이 올라갑니다</span>
      </div>
      <div className="invite__link">
        <code>{link}</code>
        <button type="button" onClick={copy}>{copied ? '복사됨' : '링크 복사'}</button>
      </div>
      <div className="invite__row">
        <button type="button" className={`invite__mode ${open ? 'is-on' : ''}`} onClick={() => setOpen(true)}>
          공개 참여 {open && '·  켜짐'}
        </button>
        <button type="button" className={`invite__mode ${!open ? 'is-on' : ''}`} onClick={() => setOpen(false)}>
          초대한 사람만
        </button>
      </div>
      <p className="invite__note">
        <SimBadge what="링크 입장" /> 링크 복사는 실제로 됩니다.
        받은 사람이 이 방에 입장하는 것은 이 MVP에서 구현하지 않았습니다 —
        방을 인스턴스 메모리에 두고 있어 다른 기기에서 찾을 수 없습니다.
      </p>
      <p className="invite__note">초대한 사람이 더 받는 건 없어요. 팀 전원이 똑같은 확률입니다.</p>
    </div>
  )
}

/* ── 자동 흐르는 상품 띠 ────────────────────────────────────
   올웨이즈 홈은 기획전 상품이 오른쪽에서 왼쪽으로 계속 흐른다.
   목록을 두 벌 이어 붙이고 CSS로만 밀어 끊김 없이 순환시킨다 —
   타이머도 라이브러리도 쓰지 않는다. 접근성: 움직임 최소화 설정을 존중한다. */
export function Marquee({ items, speed = 42 }) {
  if (!items.length) return null
  const loop = [...items, ...items]
  return (
    <div className="mq" aria-label="지금 많이 찾는 카드">
      <div className="mq__track" style={{ animationDuration: `${speed}s` }}>
        {loop.map((it, i) => (
          <a key={`${it.id}-${i}`} className="mq__card" href={it.url}
            target="_blank" rel="noreferrer" aria-hidden={i >= items.length}>
            {it.image ? <img src={it.image} alt="" loading="lazy" /> : <span className="mq__ph" />}
            <span className="mq__nm">{it.name.replace(/^\[[^\]]*\]\s*/, '').slice(0, 24)}</span>
            <span className="mq__pr">{won(it.price)}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

/* ── 검색 화면 — 올웨이즈 검색 문법 ─────────────────────────
   최근 검색어(이 기기에만 저장) · 추천 검색어(크롤 데이터에서 유도) · 결과.
   눌리는데 아무 일도 안 일어나는 검색창이 가장 나쁜 상태다. */
export function SearchScreen({ onClose, onSearch, suggest, recent, onClearRecent, result, busy, q, setQ }) {
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  const submit = (text) => {
    const t = (text ?? q).trim()
    if (!t) return
    setQ(t)
    onSearch(t)
  }
  return (
    <div className="srch">
      <form className="srch__bar" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <button type="button" className="srch__back" onClick={onClose} aria-label="닫기">‹</button>
        <span className="srch__field">
          <IconSearch />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="올웨이즈에서 상품 검색하기" aria-label="상품 검색" maxLength={40} />
          {q && <button type="button" className="srch__x" onClick={() => setQ('')} aria-label="지우기">✕</button>}
        </span>
      </form>

      {result ? (
        <section className="srch__sec">
          <header className="srch__h">
            <b>{`'${result.q}' 검색 결과`}</b>
            <span>{`${result.count}건${result.count >= 24 ? ' 이상' : ''}`}</span>
          </header>
          {result.count === 0 ? (
            <p className="srch__empty">{`수집한 ${result.total.toLocaleString('ko-KR')}건에서 찾지 못했어요. 다른 낱말로 찾아보세요.`}</p>
          ) : (
            <div className="grid">
              {result.items.map((it) => <ProductCard key={it.id} item={it} />)}
            </div>
          )}
        </section>
      ) : (
        <>
          {recent.length > 0 && (
            <section className="srch__sec">
              <header className="srch__h">
                <b>최근 검색어</b>
                <button type="button" onClick={onClearRecent}>모두 삭제</button>
              </header>
              <div className="chips">
                {recent.map((t) => (
                  <button key={t} type="button" className="chip" onClick={() => submit(t)}>{t}</button>
                ))}
              </div>
            </section>
          )}
          <section className="srch__sec">
            <header className="srch__h">
              <b>올박스 추천 검색어</b>
              <span>수집한 상품명에서 뽑았어요</span>
            </header>
            <div className="chips">
              {suggest.map((t) => (
                <button key={t} type="button" className="chip chip--sug" onClick={() => submit(t)}>{t}</button>
              ))}
            </div>
          </section>
        </>
      )}
      {busy && <p className="srch__empty">찾는 중…</p>}
    </div>
  )
}
