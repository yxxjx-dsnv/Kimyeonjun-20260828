/**
 * 화면 조각들. 로직은 App.jsx가 갖고, 여기는 그리기만 한다.
 *
 * 확률을 표시할 때는 언제나 자연빈도를 함께 쓴다.
 * Gigerenzer & Hoffrage(1995) — 확률 형식은 오인되고 빈도 형식은 덜 오인된다.
 */
import { useState } from 'react'

export const won = (n) => `${Math.round(n).toLocaleString()}원`

/**
 * 차액 표기. 하한을 정확히 맞으면 차액이 0이 되는데, 그때 '+0원'을 이득처럼
 * 초록색으로 보이면 거짓말이 된다. 꽝은 아니지만 이득도 아니므로 '본전'이라 쓴다.
 */
export const Delta = ({ v }) =>
  // 텍스트를 한 노드로 만든다. JSX가 쪼개면 DOM에 주석이 끼어 문구 매칭이 깨진다.
  v > 0 ? <span className="rv__delta">{`+${won(v)}`}</span> : <span className="rv__even">본전</span>
export const pct = (p, d = 2) => `${(p * 100).toFixed(d)}%`
export const naturalFreq = (p, base = 1000) => {
  if (!p || p <= 0) return '—'
  const n = p * base
  if (n >= 1) return `${base.toLocaleString()}명 중 약 ${Math.round(n).toLocaleString()}명`
  return `${Math.round(1 / p).toLocaleString()}명 중 약 1명`
}

export const TIERS = ['S', 'A', 'B', 'C']
export const TIER_LABEL = { S: '최고 등급', A: '상위 등급', B: '중간 등급', C: '기본 등급' }

/* ── 아이콘 (실제 앱과 같은 아웃라인 계열) ────────────────────── */
const I = (d, fill) => (p) =>
  (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...p}>
      <path d={d} fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
export const IconHome = I('M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5')
export const IconContent = I('M4 6h11a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM16 10l5-3v10l-5-3')
export const IconHeart = I('M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20Z')
export const IconUser = I('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0')
export const IconBox = I('M12 3 3.5 7.5 12 12l8.5-4.5L12 3ZM3.5 7.5v9L12 21l8.5-4.5v-9M12 12v9')

/* ── 상품 카드 (홈 탭 2열 그리드) ──────────────────────────── */
export function ProductCard({ item, badge }) {
  return (
    <a className="pcard" href={item.url} target="_blank" rel="noreferrer noopener">
      <div className="pcard__thumb">
        {item.image ? <img src={item.image} alt="" loading="lazy" /> : <div className="pcard__ph" />}
      </div>
      <p className="pcard__name">{item.name}</p>
      <p className="pcard__price">{won(item.price)}</p>
      {badge && <span className="badge badge--sale">{badge}</span>}
    </a>
  )
}

/* ── 확률 상승 곡선 ──────────────────────────────────────────
   이 화면의 주인공. 팀원이 들어올 때 점이 오른쪽으로 미끄러지고
   최고 등급 확률이 따라 올라간다.                                 */
export function OddsCurve({ oddsByTeam, teamSize, customerBEP, teamMax = 10 }) {
  const W = 320, H = 132, PL = 34, PR = 12, PT = 14, PB = 26
  const ns = Array.from({ length: teamMax }, (_, i) => i + 1)
  const vals = ns.map((n) => oddsByTeam[n]?.S ?? 0)
  const max = Math.max(...vals) * 1.12 || 1
  const x = (n) => PL + ((n - 1) / (teamMax - 1)) * (W - PL - PR)
  const y = (v) => H - PB - (v / max) * (H - PT - PB)

  // 부드러운 곡선 — 카디널 스플라인
  const pts = ns.map((n, i) => [x(n), y(vals[i])])
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2
    d += ` C ${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6},` +
         ` ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6},` +
         ` ${p2[0]} ${p2[1]}`
  }
  const cur = Math.min(teamMax, Math.max(1, teamSize))

  return (
    <div className="curve">
      <svg viewBox={`0 0 ${W} ${H}`} className="curve__svg" role="img"
        aria-label={`팀 ${cur}명일 때 최고 등급 확률 ${pct(vals[cur - 1], 3)}`}>
        <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} className="curve__axis" />
        <path d={`${d} L ${x(teamMax)} ${H - PB} L ${x(1)} ${H - PB} Z`} className="curve__fill" />
        <path d={d} className="curve__line" />
        {customerBEP && (
          <g>
            <line x1={x(customerBEP)} y1={PT - 6} x2={x(customerBEP)} y2={H - PB} className="curve__bep" />
            <text
              x={x(customerBEP) + (x(customerBEP) > W - 78 ? -4 : 4)}
              y={PT + 2}
              textAnchor={x(customerBEP) > W - 78 ? 'end' : 'start'}
              className="curve__beptext">{`${customerBEP}명부터 2배`}</text>
          </g>
        )}
        <circle cx={x(cur)} cy={y(vals[cur - 1])} r="5.5" className="curve__dot" />
        {[1, 4, 7, 10].filter((n) => n <= teamMax).map((n) => (
          <text key={n} x={x(n)} y={H - 8} className="curve__tick">{n}</text>
        ))}
        <text x={4} y={y(max * 0.92)} className="curve__tick">{pct(max, 1)}</text>
        <text x={4} y={H - PB} className="curve__tick">0</text>
      </svg>
      <p className="curve__cap">가로축 참여 인원 · 세로축 최고 등급 확률</p>
    </div>
  )
}

/* ── 등급별 확률 막대 ──────────────────────────────────────── */
export function OddsBars({ odds }) {
  return (
    <ul className="bars">
      {TIERS.map((t) => (
        <li key={t} className="bars__row">
          <span className={`tier tier--${t}`}>{t}</span>
          <span className="bars__track">
            <span className={`bars__fill bars__fill--${t}`} style={{ width: `${odds[t] * 100}%` }} />
          </span>
          <span className="bars__num">{pct(odds[t], odds[t] < 0.01 ? 3 : 1)}</span>
        </li>
      ))}
    </ul>
  )
}

/* ── 더보기: 1~10명 확률과 증가분 ───────────────────────────── */
export function OddsTable({ oddsByTeam, evByTeam, teamMax = 10, teamSize }) {
  const [open, setOpen] = useState(false)
  const ns = Array.from({ length: teamMax }, (_, i) => i + 1)
  return (
    <div className="more">
      <button className="more__btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        확률이 어떻게 오르나요? <span className={`more__arw ${open ? 'is-open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="more__body">
          <table className="otable">
            <thead>
              <tr><th>인원</th><th>최고 등급</th><th>직전 대비</th><th>기대 수령</th></tr>
            </thead>
            <tbody>
              {ns.map((n) => {
                const s = oddsByTeam[n]?.S ?? 0
                const prev = n > 1 ? oddsByTeam[n - 1].S : null
                return (
                  <tr key={n} className={n === teamSize ? 'is-now' : ''}>
                    <td>{n}명</td>
                    <td className="num">{pct(s, 3)}</td>
                    <td className="num sub">{prev === null ? '—' : `+${((s - prev) * 100).toFixed(3)}%p`}</td>
                    <td className="num">{evByTeam?.[n]?.toFixed(2)}배</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="more__note">
            기대 수령 = 받게 될 상품의 평균 시가 ÷ 참여비. 크롤한 실제 판매가로 계산합니다.
          </p>
        </div>
      )}
    </div>
  )
}

/* ── 등급별 상품 미리보기 ──────────────────────────────────── */
export function TierStrip({ tier, odds }) {
  return (
    <section className="tstrip">
      <header className="tstrip__head">
        <span className={`tier tier--${tier.tier}`}>{tier.tier}</span>
        <span className="tstrip__label">{TIER_LABEL[tier.tier]}</span>
        <span className="tstrip__odds">
          {pct(odds, odds < 0.01 ? 3 : 1)}
          <em>{naturalFreq(odds)}</em>
        </span>
      </header>
      <p className="tstrip__band">
        {won(tier.band[0])} ~ {won(tier.band[1])} · 후보 {tier.count}개 · 평균 {won(tier.meanRetail)}
      </p>
      <ul className="tstrip__list">
        {tier.samples.map((it) => (
          <li key={it.id}>
            <a href={it.url} target="_blank" rel="noreferrer noopener">
              {it.image ? <img src={it.image} alt="" loading="lazy" /> : <span className="tstrip__ph" />}
              <span className="tstrip__nm">{it.name}</span>
              <span className="tstrip__pr">{won(it.price)}</span>
              {it.kc !== 'certified' && it.group === 'trend' && (
                <span className="kc">KC 확인 필요</span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ── 참여자 + n/10 게이트 ──────────────────────────────────── */
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
            {m?.draws > 1 && <span className="av__d">{`×${m.draws}`}</span>}
          </div>
        ))}
      </div>
      <p className="rail__count">
        <strong>{members.length}</strong>
        <span>{`/ ${teamMax}명 참여`}</span>
        {sims > 0 && <span className="rail__sim">{`${sims}명은 체험용`}</span>}
        {phase === 'ready' && (
          <em className={readyCount === members.length ? 'is-full' : ''}>
            뽑기 {readyCount}/{members.length}
          </em>
        )}
      </p>
    </div>
  )
}

/* ── 개봉 결과 카드 ────────────────────────────────────────── */
export function RevealCard({ r, entry, mine, delay }) {
  return (
    <li className={`rv ${mine ? 'is-mine' : ''}`} style={{ animationDelay: `${delay}ms` }}>
      <header className="rv__head">
        <span className="rv__who">{r.name}{mine && ' (나)'}</span>
        {r.sim && <span className="simtag">시뮬</span>}
        <span className={`tier tier--${r.best}`}>{r.best}</span>
      </header>
      <ul className="rv__items">
        {r.picks.map((p, i) => (
          <li key={i}>
            {p.item.image ? <img src={p.item.image} alt="" loading="lazy" /> : <span className="tstrip__ph" />}
            <span className="rv__nm">{p.item.name}</span>
            <span className="rv__pr">{won(p.item.price)}</span>
          </li>
        ))}
      </ul>
      <p className="rv__settle">
        낸 돈 {won(r.settle.paid)} · 받은 시가 <b>{won(r.settle.retailValue)}</b>
        <Delta v={r.settle.delta} />
      </p>
    </li>
  )
}

/* ── 취향 대화 (ChatGPT) ───────────────────────────────────
   확률형 구매의 가장 큰 약점은 안 쓸 물건이 오는 것이다. 무작위를 쓰되
   취향 밖으로는 안 나가게 한다. 대화가 정하는 것은 '무엇이 상자에 들어가는가'
   까지이고, '무엇이 뽑히는가'는 서버가 정한다.                            */
const CHIPS = ['주방 살림 위주로', '손주 줄 것도 넣어서', '내가 쓸 것 위주로', '먹거리 위주로']

export function TasteChat({ boxId, teamSize, onCurated, axis, disabled }) {
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ask, setAsk] = useState(null)

  const send = async (content) => {
    const body = String(content ?? text).trim()
    if (!body || busy) return
    const next = [...msgs, { role: 'user', content: body }]
    setMsgs(next); setText(''); setBusy(true); setErr(null); setAsk(null)
    try {
      const r = await fetch('/api/curate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, boxId, teamSize }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setMsgs([...next, { role: 'assistant', content: j.reply }])
      setAsk(j.question ? { q: j.question, options: j.options } : null)
      onCurated(j)
    } catch (e) {
      setErr(e.message)
    } finally { setBusy(false) }
  }

  return (
    <section className="taste">
      <header className="taste__h">
        <h3>이 상자에 뭘 담을까요?</h3>
        {axis && <span className="taste__axis">{axis}</span>}
      </header>
      <p className="taste__sub">
        무작위는 <b>무엇이 뽑히는지</b>만 정합니다. <b>무엇이 들어갈지</b>는 취향으로 좁힙니다.
      </p>

      {msgs.map((m, i) => (
        <p key={i} className={`bub bub--${m.role}`}>{m.content}</p>
      ))}
      {busy && <p className="bub bub--assistant is-busy">담는 중…</p>}
      {err && <p className="taste__err">{err}</p>}

      {ask ? (
        <>
          <p className="bub bub--assistant">{ask.q}</p>
          <div className="taste__chips">
            {ask.options.map((o) => (
              <button key={o} className="chip" onClick={() => send(o)} disabled={disabled || busy}>{o}</button>
            ))}
          </div>
        </>
      ) : msgs.length === 0 ? (
        <div className="taste__chips">
          {CHIPS.map((c) => (
            <button key={c} className="chip" onClick={() => send(c)} disabled={disabled || busy}>{c}</button>
          ))}
        </div>
      ) : null}

      <div className="taste__in">
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 한글 IME 조합 중 Enter는 확정이지 전송이 아니다.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) send()
          }}
          placeholder="직접 적어도 됩니다" disabled={disabled || busy} maxLength={60}
          aria-label="원하는 상자 구성"
        />
        <button className="btn btn--ghost" onClick={() => send()} disabled={disabled || busy || !text.trim()}>
          보내기
        </button>
      </div>
    </section>
  )
}

/* ── 정직성 시트 ───────────────────────────────────────────── */
export function HonestySheet({ formula, pool, companyBEP, onClose }) {
  const f = formula
  return (
    <div className="sheet" role="dialog" aria-label="확률이 어떻게 정해지나요">
      <div className="sheet__bar" />
      <h3>확률이 어떻게 정해지나요</h3>

      <p className="sheet__lead">
        확률표를 사람이 적지 않습니다. 아래 두 곡선이 계산한 값을 화면과 추첨이 같이 씁니다.
      </p>

      <dl className="sheet__grid">
        <dt>① 매입 원가율</dt>
        <dd>
          팀이 커지면 도매 단가가 열립니다. 계단식 수량할인을 곡선으로 편 값입니다.<br />
          <code>{f.costRatio.CR_MAX} → {f.costRatio.CR_MIN}</code> · {f.costRatio.note}
        </dd>
        <dt>② 고객 획득비 회수</dt>
        <dd>
          두세 명은 대개 가족이라 새 고객이 아닙니다. 지인 밖으로 나가야 회수가 시작됩니다.<br />
          <code>CAC {won(f.cac.CAC)} × 최대 {pct(f.cac.VIRAL_MAX, 0)}</code> · {f.cac.note}
        </dd>
        <dt>③ 상품 예산</dt>
        <dd>
          <code>참여비 × {(1 - f.budget.MARGIN).toFixed(2)} + 회수액</code><br />
          남는 예산을 상위 등급에 {pct(f.budget.SPLIT.S, 0)}·{pct(f.budget.SPLIT.A, 0)}·{pct(f.budget.SPLIT.B, 0)}로 나눕니다.
          기본 등급 비중은 {pct(f.budget.MIN_C_SHARE, 0)} 아래로 내리지 않습니다.
        </dd>
        <dt>④ 회사 손익분기</dt>
        <dd>
          회차 고정비 {pct(f.economics.FIXED_COST_RATIO, 0)} · 마진 {pct(f.budget.MARGIN, 0)} →{' '}
          <b>{companyBEP}명</b>부터 회차가 흑자입니다.
        </dd>
      </dl>

      <h4>포맷마다 정직성의 방식이 다릅니다</h4>
      <p className="sheet__lead">
        올박스는 하나의 상품이 아니라 <b>여러 형식이 매주 교체되며 도는 엔진</b>입니다.
        그래서 &lsquo;꽝 없음&rsquo;은 제품 전체의 원칙이 아니라 <b>일부 형식의 속성</b>입니다.
      </p>
      <dl className="sheet__grid">
        <dt>팀 뽑기 · 공동구매 — 꽝 없음</dt>
        <dd>
          ① 수집 단계에서 참여비보다 싼 상품을 아예 제외하고 ② 기본 등급의 하한이 참여비의
          1.0배이며 ③ 등급이 비면 위로만 올립니다. 세 층이라 코드로 깨뜨릴 수 없습니다.
        </dd>
        <dt>데일리 100원 — 꽝 있음, 대신 완전 공개</dt>
        <dd>
          이 형식에는 꽝이 있습니다. 100원은 스피또 최저가(500원)의 5분의 1이라
          잃어도 생활에 영향이 없는 금액이고, 대신 <b>당첨·꽝 확률과 그 확률이 나온
          계산 과정까지</b> 전부 공개합니다. 정직성의 축이 무손실이 아니라 완전 공개로 옮겨갑니다.
        </dd>
      </dl>

      <h4>확률을 손으로 적지 않습니다</h4>
      <ol className="sheet__ol">
        <li>팀 뽑기는 <b>재고 비율</b>에서 나옵니다. 상품 1개 / 1,000구좌 = 0.1%.</li>
        <li>데일리는 <b>손익분기</b>에서 나옵니다. 경품 원가 ÷ 1회당 순수입.</li>
        <li>공동구매는 <b>할인 여력</b>에서 나옵니다. 대량 매입으로 내려간 원가만큼.</li>
      </ol>

      <h4>천장 — 연속으로 못 뽑으면 확률을 올립니다</h4>
      <p className="sheet__lead">
        10회 연속 최고 등급을 못 뽑으면 다음 회차 확률을 5%로 끌어올립니다.
        게임산업법 시행령(2024.3.22)은 이런 <b>보장형 시스템도 공시 대상</b>으로 명시합니다.
        천장은 숨길 장치가 아니라 밝혀야 하는 보호 장치입니다.
      </p>

      <h4>밝혀둘 것</h4>
      <ul className="sheet__ul">
        {f.assumptions.map((a, i) => <li key={i}>{a}</li>)}
        <li>
          상품과 가격은 {new Date(pool.crawledAt).toLocaleString('ko-KR')} 다나와에서 수집한{' '}
          {pool.size.toLocaleString()}건입니다. 시세는 변합니다.
        </li>
        <li>완구의 KC 안전확인은 상품명에 표기된 것만 인정합니다. 나머지는 &lsquo;확인 필요&rsquo;로 둡니다.</li>
      </ul>

      <button className="btn btn--ghost" onClick={onClose}>닫기</button>
    </div>
  )
}

/* ── 공동구매형 ───────────────────────────────────────────
   상품은 확정이고 확률은 '얼마를 내는가'에만 작동한다. 안 당첨돼도 정가보다
   싸게 산 유니폼이 오므로 잃을 것이 구조적으로 없다.                        */

/** 인원에 따라 할인율과 무료 당첨 인원이 함께 오르는 곡선. */
export function GroupCurve({ steps, teamSize }) {
  const W = 320, H = 128, PL = 34, PR = 34, PT = 14, PB = 26
  const n0 = steps[0].n, n1 = steps.at(-1).n
  const x = (n) => PL + ((n - n0) / (n1 - n0)) * (W - PL - PR)
  const maxD = Math.max(...steps.map((s) => s.discount)) * 1.1
  const maxF = Math.max(...steps.map((s) => s.freeOdds)) * 1.1
  const yD = (v) => H - PB - (v / maxD) * (H - PT - PB)
  const yF = (v) => H - PB - (v / maxF) * (H - PT - PB)
  const path = (fy, key) => steps.map((s, i) => `${i ? 'L' : 'M'} ${x(s.n)} ${fy(s[key])}`).join(' ')
  const cur = steps.find((s) => s.n === teamSize) || steps[0]

  return (
    <div className="curve">
      <svg viewBox={`0 0 ${W} ${H}`} className="curve__svg" role="img"
        aria-label={`${cur.n}명일 때 할인 ${cur.discount}%, 무료 당첨 ${cur.freeOdds}%`}>
        <line x1={PL} y1={H - PB} x2={W - PR} y2={H - PB} className="curve__axis" />
        <path d={path(yD, 'discount')} className="curve__line curve__line--alt" />
        <path d={path(yF, 'freeOdds')} className="curve__line" />
        <circle cx={x(cur.n)} cy={yD(cur.discount)} r="4.5" className="curve__dot curve__dot--alt" />
        <circle cx={x(cur.n)} cy={yF(cur.freeOdds)} r="5" className="curve__dot" />
        {[n0, Math.round((n0 + n1) / 2), n1].map((n) => (
          <text key={n} x={x(n)} y={H - 8} className="curve__tick">{n}</text>
        ))}
      </svg>
      <p className="curve__cap">
        <span className="lg lg--alt">전원 할인</span>
        <span className="lg">무료 당첨 확률</span>
        <span className="curve__capx">가로축 참여 인원</span>
      </p>
    </div>
  )
}

/** 인원별 지불액·무료 인원 표. 더보기로 접어 둔다. */
export function GroupTable({ steps, teamSize, listPrice }) {
  const [open, setOpen] = useState(false)
  const rows = steps.filter((s) => s.n % 5 === 0 || s.n === steps[0].n || s.n === teamSize)
  return (
    <div className="more">
      <button className="more__btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        인원이 늘면 얼마가 되나요? <span className={`more__arw ${open ? 'is-open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="more__body">
          <table className="otable">
            <thead><tr><th>인원</th><th>내는 돈</th><th>할인</th><th>무료 당첨</th><th>무료 인원</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.n} className={s.n === teamSize ? 'is-now' : ''}>
                  <td>{`${s.n}명`}</td>
                  <td className="num">{won(s.pay)}</td>
                  <td className="num sub">{`${s.discount}%`}</td>
                  <td className="num">{`${s.freeOdds}%`}</td>
                  <td className="num">{`${s.freeCount}명`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="more__note">
            {`정가 ${won(listPrice)} 기준입니다. 할인과 무료 당첨은 발주 수량이 늘어 매입 단가가 내려간 만큼을 나눈 것입니다.`}
          </p>
        </div>
      )}
    </div>
  )
}

/** 발주 결과 — 누가 무료인지. */
export function GroupResult({ r, mine }) {
  return (
    <li className={`rv ${mine ? 'is-mine' : ''} ${r.free ? 'is-free' : ''}`}>
      <header className="rv__head">
        <span className="rv__who">{r.name}{mine ? ' (나)' : ''}</span>
        {r.sim && <span className="simtag">시뮬</span>}
        <span className={r.free ? 'freetag' : 'paytag'}>{r.free ? '무료 당첨' : won(r.settle.paid)}</span>
      </header>
      <p className="rv__settle">
        {`정가 ${won(r.settle.retailValue)} · 낸 돈 ${won(r.settle.paid)}`}
        <Delta v={r.settle.delta} />
      </p>
    </li>
  )
}

/* ── 뽑기 통 ───────────────────────────────────────────────
   확률이 어디서 왔는지 보여주는 가장 직접적인 방법 — 재고를 그대로 그린다.  */
export function StockBin({ stock, stockTotal, baseOdds, odds, boost }) {
  return (
    <section className="bin">
      <header className="bin__h">
        <h3>이번 회차 뽑기 통</h3>
        <span className="bin__tot">{`총 ${stockTotal.toLocaleString()}구좌`}</span>
      </header>
      <ul className="bin__rows">
        {TIERS.map((t) => (
          <li key={t} className="bin__row">
            <span className={`tier tier--${t}`}>{t}</span>
            <span className="bin__qty">{`${stock[t]}개`}</span>
            <span className="bin__bar">
              <span className={`bin__fill bin__fill--${t}`}
                style={{ width: `${Math.max(0.6, (stock[t] / stockTotal) * 100)}%` }} />
            </span>
            <span className="bin__odds">
              {pct(baseOdds[t], baseOdds[t] < 0.01 ? 3 : 1)}
              {odds && boost > 1.001 && t !== 'C' && (
                <em>{` → ${pct(odds[t], odds[t] < 0.01 ? 3 : 1)}`}</em>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="bin__note">
        {boost > 1.001
          ? `기본 확률은 재고 비율 그대로입니다. 지금 ${boost.toFixed(2)}배가 곱해져 있습니다.`
          : '기본 확률은 재고 비율 그대로입니다. 사람이 모이면 상위 등급에 배수가 곱해집니다.'}
      </p>
    </section>
  )
}

/* ── 천장 진행도 ────────────────────────────────────────── */
export function PityBar({ pity, miss, onChange }) {
  if (!pity) return null
  const hit = miss >= pity.window
  return (
    <div className={`pity ${hit ? 'is-hit' : ''}`}>
      <div className="pity__top">
        <span className="pity__lab">{hit ? '천장 도달' : '최고 등급 연속 미당첨'}</span>
        <b>{`${Math.min(miss, pity.window)} / ${pity.window}`}</b>
      </div>
      <span className="pity__track">
        <span className="pity__fill" style={{ width: `${Math.min(100, (miss / pity.window) * 100)}%` }} />
      </span>
      <p className="pity__note">
        {hit
          ? `이번 회차 최고 등급 확률이 ${pct(pity.boostTo, 0)}로 올라갑니다.`
          : `${pity.window}회 연속 못 뽑으면 다음 회차 최고 등급이 ${pct(pity.boostTo, 0)}가 됩니다.`}
      </p>
      {onChange && (
        <div className="pity__sim">
          <span>천장 체험</span>
          <input type="range" min="0" max={pity.window} value={Math.min(miss, pity.window)}
            onChange={(e) => onChange(Number(e.target.value))} aria-label="연속 미당첨 횟수" />
        </div>
      )}
    </div>
  )
}

/* ── 데일리 100원 ───────────────────────────────────────── */
export function DailyCard({ d, onPick }) {
  const sold = d.totalStock - (d.remaining ?? d.totalStock)
  return (
    <button className="dcard" onClick={() => onPick(d.id)}>
      <span className="dcard__row">
        {d.item.image && <img className="gbcard__thumb" src={d.item.image} alt="" loading="lazy" />}
        <span className="gbcard__b">
          <span className="dcard__tag">하루 한 번 · 꽝 있음</span>
          <span className="gbcard__name">{d.name}</span>
          <span className="gbcard__it">{d.item.name}</span>
          <span className="dcard__odds">
            {`${won(d.entry)}으로 ${won(d.itemPrice)} 도전 · 당첨 ${d.winOdds}%`}
          </span>
        </span>
      </span>
      <span className="dcard__stock">
        <span className="dcard__bar">
          <span className="dcard__fill" style={{ width: `${(sold / d.totalStock) * 100}%` }} />
        </span>
        <em>{`남은 경품 ${(d.remaining ?? d.totalStock)}/${d.totalStock}개`}</em>
      </span>
    </button>
  )
}

/** 확률이 어디서 나왔는지 계산 과정을 그대로 편다. */
export function DailyEconomics({ d }) {
  const e = d.economics
  return (
    <div className="deco">
      <h4>이 확률은 어떻게 나왔나요?</h4>
      <ol className="deco__ol">
        <li>{`경품 시가 ${won(d.itemPrice)} × 대량 매입 원가율 = 원가 ${won(e.itemCost)}`}</li>
        <li>{`참여비 ${won(d.entry)} × (1 − 마진) = 1회당 순수입 ${won(e.netPerPlay)}`}</li>
        <li>{`${won(e.itemCost)} ÷ ${won(e.netPerPlay)} = ${e.breakEvenPlays.toLocaleString()}회 참여당 경품 1개`}</li>
        <li><b>{`당첨 확률 = 1 ÷ ${e.breakEvenPlays.toLocaleString()} = ${d.winOdds}%`}</b></li>
      </ol>
      <p className="deco__note">
        {`이 확률보다 후하면 회차가 적자입니다. 재고 ${d.totalStock}개는 약 ${e.playsToExhaust.toLocaleString()}회 참여로 소진됩니다.`}
        <br />
        <b>{`꽝 ${d.blankOdds}%도 숨기지 않고 그대로 적습니다.`}</b>
      </p>
    </div>
  )
}

/* ── 다음 회차 투표 ────────────────────────────────────── */
export function VoteCard({ labels, votes, onVote, voted }) {
  const keys = Object.keys(labels)
  const total = keys.reduce((a, k) => a + (votes?.[k] || 0), 0)
  return (
    <section className="vote">
      <h3>다음 올박스, 뭐가 좋을까요?</h3>
      <p className="vote__s">올박스는 매주 형식이 바뀝니다. 다음 회차를 고객이 정합니다.</p>
      <div className="vote__chips">
        {keys.map((k) => (
          <button key={k} className={`chip ${voted === k ? 'is-on' : ''}`}
            onClick={() => onVote(k)} disabled={Boolean(voted)}>
            {labels[k]}
            {total > 0 && <em>{` ${votes[k] || 0}`}</em>}
          </button>
        ))}
      </div>
      {voted && <p className="vote__done">투표해주셔서 감사합니다. 집계는 목록 화면에서 계속 볼 수 있어요.</p>}
    </section>
  )
}
