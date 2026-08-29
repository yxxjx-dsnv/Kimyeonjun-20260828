/**
 * 화면 조각 — 전부 표시 전용이다.
 *
 * ## 규칙 하나: 이 파일은 확률을 계산하지도 포맷하지도 않는다 (I4)
 * 확률 문자열은 서버가 만든 것을 그대로 렌더한다. 화면에서 toFixed를 부르는 순간
 * 서버와 두 벌이 되고, 두 벌은 반드시 어긋난다. v1에서 같은 배수가 코드·덱·문서에서
 * 서로 달랐던 것이 그 결과다. tests/render.test.mjs가 문자 단위 일치를 검사한다.
 *
 * ## 규칙 둘: 숫자와 단위를 한 노드에 담는다
 * v1에서 `+{won(v)}`가 React 렌더에서 `+<!-- -->1,300원`으로 쪼개져 E2E 문구 매칭이
 * 깨진 적이 있다. 템플릿 리터럴로 합친다.
 */

/** 포켓몬 TCG의 실제 레어도 기호. 이 세계의 어휘를 그대로 쓴다. */
const GLYPH = { C: '●', B: '◆', A: '★', S: '✦' }
export const Rarity = ({ tier }) => (
  <span className={`rarity t-${tier}`} aria-hidden="true">{GLYPH[tier]}</span>
)
export const TierLabel = ({ tier }) => (
  <span className="row" style={{ gap: 6 }}><Rarity tier={tier} /><b>{`${tier}등급`}</b></span>
)

export const Badge = ({ kind = '', children }) => <span className={`badge ${kind}`}>{children}</span>
/** 시뮬레이션인 것은 반드시 배지를 단다 (I13). */
export const SimBadge = ({ what }) => <Badge kind="sim">{`시뮬 · ${what}`}</Badge>

/**
 * 통 — 1,000칸. 이 페이지의 서명이다.
 * 오리파가 보여주지 않는 것을 화면이 직접 보여준다. 세어볼 수 있다는 것이 요점이라
 * 요약하거나 축약하지 않는다.
 */
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
          <span className="num" style={{ color: 'var(--ink-3)' }}>{`${t.K.toLocaleString('ko-KR')}구좌`}</span>
        </span>
      ))}
    </div>
  )
}

/** 상단바의 남은 구좌 스트립. */
export const Strip = ({ left, total }) => (
  <span className="strip" aria-hidden="true"><i style={{ width: `${(left / total) * 100}%` }} /></span>
)

/**
 * 인원별 확률표. pct·freq·mul은 전부 서버가 만든 문자열이다.
 * K=1인 등급만 "정확히 n배"이고 나머지는 아니다 — 그것을 그대로 표시한다.
 */
export function OddsTable({ odds, n }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>등급</th><th>재고</th><th>혼자</th><th>{`팀 ${n}명`}</th><th>혼자 대비</th>
          </tr>
        </thead>
        <tbody>
          {odds.map((o) => {
            const t = o.team[n - 1]
            return (
              <tr key={o.tier}>
                <td><TierLabel tier={o.tier} /></td>
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
        <thead>
          <tr><th>등급</th>{js.map((j) => <th key={j} className="num">{`${j}구좌 소진`}</th>)}</tr>
        </thead>
        <tbody>
          {tiers.map((g) => (
            <tr key={g}>
              <td><TierLabel tier={g} /></td>
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

/** 통 안의 카드 하나. 지목 버튼이기도 하다. */
export const CardPick = ({ card, picked, onPick, count = 0 }) => (
  <button type="button" className="cardpick" aria-pressed={picked} onClick={() => onPick(card.id)}>
    {card.image ? <img src={card.image} alt="" loading="lazy" /> : <span className="cardpick-noimg" aria-hidden="true" />}
    <span style={{ minWidth: 0 }}>
      <span className="row" style={{ gap: 6, marginBottom: 2 }}>
        <Rarity tier={card.tier} />
        <span className="pr">{`${card.price.toLocaleString('ko-KR')}원`}</span>
        {count > 0 && <span className="pr">{`· ${count}명 지목`}</span>}
      </span>
      <span className="nm">{card.name}</span>
    </span>
  </button>
)

/** 교환 사이클 — A→B→C→A가 실제로 보여야 한다. */
export function CycleView({ cycles }) {
  if (!cycles.length) return <p style={{ color: 'var(--ink-3)', margin: 0 }}>이번 라운드에는 성립한 교환이 없습니다. 서로 원하는 것이 엇갈리지 않았습니다.</p>
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
export function TradeTable({ results }) {
  return (
    <div className="tablewrap">
      <table>
        <thead><tr><th>참여자</th><th>교환 전</th><th>교환 후</th><th>결과</th></tr></thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.memberId}>
              <td>{r.name}</td>
              <td className="n">{r.before ? `${r.before.tier} · ${r.before.price.toLocaleString('ko-KR')}원` : '—'}
                <span className="freq">{r.before?.name?.slice(0, 28)}</span></td>
              <td className="n">{r.after ? `${r.after.tier} · ${r.after.price.toLocaleString('ko-KR')}원` : '—'}
                <span className="freq">{r.after?.name?.slice(0, 28)}</span></td>
              <td>
                {r.worse ? <Badge>{'나빠짐 — 있으면 안 되는 결과'}</Badge>
                  : r.improved ? <Badge kind="ai">{`선호 ${r.gain}단계 개선`}</Badge>
                    : <Badge kind="rule">{'그대로'}</Badge>}
                {r.gotTarget && <span className="freq">{'지목한 카드를 받았다'}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
