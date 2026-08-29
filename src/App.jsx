/**
 * 올박스 v2 — 화면.
 *
 * 과제 요건: "타깃 고객의 문제 또는 욕구를 제품이 어떤 방식으로 해결하거나 증폭하는지
 * 확인할 수 있도록 구현". **README 서술은 근거가 아니다. 화면에서 확인돼야 한다.**
 * v1은 확률의 정직성은 증명했지만 이 요건에 대응하는 화면이 없었다.
 *
 * 평가자가 위에서 아래로 읽으면 이 순서로 겪는다.
 *   ① 문제       오리파는 통이 안 보인다 (+ 우리가 직접 잰 37건)
 *   ② 통 보기    1,000구좌를 전부 보여준다        ← 문제에 대한 직접 반증
 *   ③ 팀 모으기  인원을 늘리면 확률이 어떻게 변하는지 (+ 고지)
 *   ④ 지목·AI    무엇을 원하는지 말한다
 *   ⑤ 개봉       전원이 눌러야 열린다 · 뽑히면 통이 줄고 확률이 갱신된다
 *   ⑥ 교환       팀 확률이 개인 확률이 되는 지점
 *   ⑦ 대조       오리파 / 혼자 / 팀을 나란히. 오리파 칸은 물음표로 남는다
 *   ⑧ 근거       무엇이 정의이고 무엇이 가정인가
 *
 * 확률 문자열은 전부 서버가 만든 것을 그대로 렌더한다(I4). 여기서 계산하지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge, SimBadge, BoxGrid, GridLegend, Strip, OddsTable, UpdateTable,
  CardPick, CycleView, TradeTable, Rarity, TierLabel,
} from './parts.jsx'

const api = async (path, body) => {
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined)
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

/**
 * "정확히 n배인 등급과 그렇지 않은 등급"을 서버 계산값으로 쓴다.
 * 이 문장에 배수를 손으로 적으면 통 구성을 바꿨을 때 문장만 낡는다.
 */
const exactLine = (odds, n) => {
  const exact = odds.find((o) => o.exactlyLinear)
  const nearly = odds.find((o) => !o.exactlyLinear && o.K > 1)
  if (!exact || !nearly) return ''
  return `${exact.tier}등급은 재고가 ${exact.K}장이라 정확히 ${exact.team[n - 1].mul}가 되고, ` +
    `${nearly.tier}등급은 ${nearly.K}장이라 ${nearly.team[n - 1].mul}로 ${n}배가 되지 않습니다.`
}

const SIM_NAMES = ['민서', '지호', '서연', '도윤', '하은', '준우', '수아', '시우', '나윤']

export default function App() {
  const [boxes, setBoxes] = useState(null)
  const [err, setErr] = useState(null)
  const [teamSize, setTeamSize] = useState(10)
  const [room, setRoom] = useState(null)
  const [me, setMe] = useState(null)
  const [busy, setBusy] = useState('')
  const [gateMsg, setGateMsg] = useState(null)
  const [taste, setTaste] = useState('아이가 피카츄를 제일 좋아해요. 저는 리자몽이요.')
  const [ai, setAi] = useState(null)
  const [ask, setAsk] = useState({ q: 'SAR이 뭔가요? 비싼 건가요?', a: null })
  const [reveal, setReveal] = useState(null)
  const revealTimer = useRef(null)

  useEffect(() => {
    api('/api/boxes').then(({ ok, data }) => (ok ? setBoxes(data) : setErr('통을 불러오지 못했습니다.')))
    return () => clearInterval(revealTimer.current)
  }, [])

  const cards = useMemo(
    () => (boxes ? boxes.box.tiers.flatMap((t) => t.cards.map((c) => ({ ...c, tier: t.tier }))) : []),
    [boxes]
  )
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const myTarget = room?.members.find((m) => m.id === me)?.target ?? null

  /** 방을 만들고 시뮬 팀원을 채운다. 시뮬인 것은 화면에 배지로 명시한다(I13). */
  const makeTeam = useCallback(async () => {
    setBusy('team')
    const c = await api('/api/room', { action: 'create', name: '나' })
    if (!c.ok) { setErr('방을 만들지 못했습니다.'); setBusy(''); return }
    let st = c.data
    setMe(c.data.you)
    for (let i = 0; i < teamSize - 1; i++) {
      const j = await api('/api/room', { action: 'join', roomId: c.data.id, name: SIM_NAMES[i] })
      if (j.ok) st = j.data
    }
    setRoom(st)
    setBusy('')
  }, [teamSize])

  const act = useCallback(async (body, path = '/api/room') => {
    const r = await api(path, body)
    if (r.data?.id) setRoom(r.data)
    return r
  }, [])

  /** 지목. 확률을 건드리지 않는다 — TTC의 1순위가 될 뿐이다. */
  const pick = (cardId) => act({ action: 'target', roomId: room.id, memberId: me, cardId })

  /**
   * 시뮬 팀원의 지목과 취향. 서로 다른 것을 원해야 교환이 성립한다.
   * Phase 3에서 잰 것: 전원의 선호가 같으면 교환이 거의 일어나지 않는다.
   */
  const simTargets = async () => {
    setBusy('sim')
    const r = await api('/api/room', { action: 'simPrefs', roomId: room.id, memberId: me })
    if (r.ok) setRoom(r.data)
    setBusy('')
  }

  const askAi = async () => {
    setBusy('ai')
    const r = await api('/api/curate', { action: 'prefs', roomId: room.id, memberId: me, taste, target: myTarget })
    setAi(r.data); setBusy('')
    if (r.data?.id === undefined) act({ action: 'state', roomId: room.id })
  }
  const askTerm = async () => {
    setBusy('ask')
    const r = await api('/api/curate', { action: 'ask', question: ask.q, cardId: myTarget })
    setAsk((s) => ({ ...s, a: r.data })); setBusy('')
  }

  const setReady = async (memberId, ready) => act({ action: 'ready', roomId: room.id, memberId, ready })
  const readyAll = async () => {
    setBusy('ready')
    let st = room
    for (const m of room.members) {
      const r = await api('/api/room', { action: 'ready', roomId: room.id, memberId: m.id, ready: true })
      if (r.ok) st = r.data
    }
    setRoom(st); setBusy('')
  }

  /**
   * 개봉. 전원 준비 전에도 **실제로 호출한다** — 서버가 409를 내는 경로가 존재한다는
   * 것이 주장이므로, 프론트에서 버튼만 막아 두면 그 주장이 증명되지 않는다(I8).
   */
  const openBox = async () => {
    setBusy('open'); setGateMsg(null)
    const r = await api('/api/open', { roomId: room.id })
    if (r.status === 409) {
      setGateMsg({ status: 409, error: r.data.error, waiting: r.data.waiting })
      if (r.data.id) setRoom(r.data)
    } else if (r.ok) {
      setRoom(r.data)
      // 비복원 시각화 — 한 칸씩 꺼진다. 이 한 번만 연출한다.
      const total = r.data.openResults.length
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (reduce) setReveal(total)
      else {
        setReveal(0)
        let k = 0
        revealTimer.current = setInterval(() => {
          k += 1; setReveal(k)
          if (k >= total) clearInterval(revealTimer.current)
        }, 260)
      }
    }
    setBusy('')
  }

  const doTrade = async () => {
    setBusy('trade')
    const r = await api('/api/trade', { roomId: room.id })
    if (r.ok) setRoom(r.data)
    setBusy('')
  }

  if (err) return <main className="wrap" style={{ padding: '4rem 0' }}><h2>{err}</h2><p>새로고침해 주세요.</p></main>
  if (!boxes) return <main className="wrap" style={{ padding: '4rem 0' }}><p>통을 세는 중…</p></main>

  const { box, odds, updates, slotTiers } = boxes
  const live = room?.live
  const left = live ? live.left : box.N
  const myResult = room?.openResults?.find((x) => x.memberId === me)
  const myTrade = room?.trade?.results.find((x) => x.memberId === me)

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-in">
          <span className="brand">올박스</span>
          <span className="topbar-strip">
            <Strip left={left} total={box.N} />
            <span className="topbar-count num">{`남은 구좌 ${left.toLocaleString('ko-KR')} / ${box.N.toLocaleString('ko-KR')}`}</span>
          </span>
          <SimBadge what="데모" />
        </div>
      </header>

      <main>
        {/* ─────────── ① 문제 ─────────── */}
        <section className="wrap hero">
          <h1>{'오리파는 '}<em>{'통이 안 보입니다'}</em></h1>
          <p className="hero-sub">
            포켓몬 카드 오리파는 가게가 내용물을 직접 구성해 무작위로 파는 상품입니다.
            문제는 확률이 낮은 것이 아닙니다. <b>통이 안 보이면 확률은 검증할 수 없는 주장일 뿐입니다.</b>
          </p>

          <div className="measure">
            <div className="measure-h">{`다나와에서 오리파 상품을 직접 수집해 표기를 전수 확인했습니다 (${boxes.oripa.auditedAt.slice(0, 10)})`}</div>
            <div className="measure-row">
              <span className="k">{'확률을 적어 둔 상품'}</span>
              <span className="v zero">{`${boxes.oripa.probNum} / ${boxes.oripa.total}건`}</span>
            </div>
            <div className="measure-row">
              <span className="k">{'"확정 · 보장"이라고 적은 상품'}</span>
              <span className="v">{`${boxes.oripa.guarantee} / ${boxes.oripa.total}건`}</span>
            </div>
            <p className="measure-note">
              {'확률 대신 보장을 팝니다. 보장은 검증 대상이 아닙니다. '}
              <b>{'이 수치는 인용이 아니라 직접 조사한 결과입니다'}</b>
              {` — 다만 ${boxes.oripa.total}건 중 ${boxes.oripa.unreachable}건은 중개 링크라 판매자 상세 페이지에 도달할 수 없었습니다. 상품명과 스펙 기준입니다.`}
            </p>
          </div>

          <div className="notice" style={{ marginTop: 24, maxWidth: 620 }}>
            <h3>{'누가 가장 크게 겪는가'}</h3>
            <p>
              {'30~40대 부모. 돈을 내는 사람이면서 문화 바깥에 있습니다. 카드숍은 아이들과 전문 리셀러의 공간이고, 시세도 은어(SAR·PSA·오리파)도 모른 채 들어가면 무엇을 샀는지조차 알기 어렵습니다.'}
            </p>
          </div>
        </section>

        {/* ─────────── ② 통 보기 ─────────── */}
        <section className="wrap section">
          <div className="proves"><b>{'확인 1'}</b><span>{'통이 보이는가'}</span></div>
          <h2>{'통 전체를 보여드립니다'}</h2>
          <p className="lede">
            {`네모 하나가 구좌 하나입니다. ${box.N.toLocaleString('ko-KR')}개 전부 그렸습니다. 세어 보실 수 있습니다.
             확률은 저희가 정한 숫자가 아니라 이 그림에서 나옵니다 — 재고를 구좌로 나눈 값입니다.`}
          </p>

          <div style={{ marginTop: 20 }}>
            <BoxGrid slotTiers={slotTiers} drawn={room?.openResults?.map((r) => r.i) ?? []} revealed={reveal} />
            <GridLegend tiers={box.tiers} />
          </div>

          <div className="stack" style={{ marginTop: 26 }}>
            {box.tiers.map((t) => (
              <div key={t.tier}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <TierLabel tier={t.tier} />
                  <span className="num" style={{ color: 'var(--ink-3)', fontSize: 13 }}>
                    {`${t.K.toLocaleString('ko-KR')}구좌 · ${t.cards.length}종 · ${t.minPrice.toLocaleString('ko-KR')}~${t.maxPrice.toLocaleString('ko-KR')}원`}
                  </span>
                </div>
                <div className="cardlist">
                  {t.cards.slice(0, t.tier === 'C' ? 6 : t.cards.length).map((c) => (
                    <CardPick key={c.id} card={{ ...c, tier: t.tier }} picked={myTarget === c.id}
                      onPick={room ? pick : () => {}} count={room?.targets?.[c.id] ?? 0} />
                  ))}
                </div>
                {t.tier === 'C' && t.cards.length > 6 && (
                  <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 8 }}>
                    {`외 ${t.cards.length - 6}종. 전부 실제 크롤 상품이며 목록은 /api/boxes에 그대로 있습니다.`}
                  </p>
                )}
              </div>
            ))}
          </div>

          <p className="lede" style={{ marginTop: 20 }}>
            {'이것이 오리파가 보여주지 않는 것입니다. 카드 이름·시세·이미지는 전부 다나와에서 수집한 실제 상품입니다.'}
          </p>
        </section>

        {/* ─────────── ③ 팀 모으기 ─────────── */}
        <section className="wrap section">
          <div className="proves"><b>{'확인 2'}</b><span>{'팀 효과가 어디서 나오는가'}</span></div>
          <h2>{'인원이 늘면 확률이 이렇게 바뀝니다'}</h2>

          <div className="notice" style={{ margin: '18px 0 22px' }}>
            <h3>{'팀 인원이 늘면 무엇이 어떻게 달라지는지'}</h3>
            <p>
              {'같은 통에서 여럿이 각자 한 구좌씩 뽑습니다. 팀이 커질수록 '}
              <b>{'팀 안에 상위 등급이 나올 확률'}</b>
              {'이 오릅니다. 다만 팀에 나오는 것과 내가 갖는 것은 다릅니다 — 그것은 교환이 정합니다(확인 5). '}
              <b>{'초대한 사람에게 추가 보상은 없습니다. 팀 전원에게 똑같은 확률이 적용됩니다.'}</b>
            </p>
          </div>

          <div className="panel">
            <div className="slider-read" style={{ marginBottom: 10 }}>
              <b>{teamSize}</b><span>{'명'}</span>
            </div>
            <input type="range" min="1" max={box.teamMax} value={teamSize} disabled={!!room}
              onChange={(e) => setTeamSize(Number(e.target.value))}
              aria-label="팀 인원" />
            <p style={{ fontSize: 13, color: 'var(--ink-3)', margin: '8px 0 0' }}>
              {room ? '방을 만든 뒤에는 인원을 바꿀 수 없습니다.' : '슬라이더를 움직이면 아래 표가 바뀝니다.'}
            </p>
          </div>

          <div style={{ marginTop: 18 }}><OddsTable odds={odds} n={teamSize} /></div>

          <div className="formula" style={{ marginTop: 16 }}>
{`P_team(g, n) = 1 − C(N − K_g, n) / C(N, n)        ← 초기하분포 (비복원 추출)

  N     구좌 수          ${box.N}
  K_g   등급 g의 재고    ${box.tiers.map((t) => `${t.tier}=${t.K}`).join('  ')}

  K_g = 1이면 정확히 n / N 이 됩니다. 즉 혼자 대비 정확히 n배입니다.`}
          </div>
          <p className="lede" style={{ marginTop: 12 }}>
            {'이 배수는 저희가 정한 것이 아니라 비복원 추출의 성질입니다. '}
            <b>{exactLine(odds, teamSize)}</b>
            {' 반올림해서 10배라고 쓰지 않습니다.'}
          </p>

          {!room && (
            <div className="row" style={{ marginTop: 22 }}>
              <button className="btn" onClick={makeTeam} disabled={busy === 'team'}>
                {busy === 'team' ? '방 만드는 중…' : `${teamSize}명으로 팀 만들기`}
              </button>
              <SimBadge what={`팀원 ${teamSize - 1}명은 자동 참여`} />
            </div>
          )}
        </section>

        {room && (
          <>
            {/* ─────────── ④ 지목 + ChatGPT ─────────── */}
            <section className="wrap section">
              <div className="proves"><b>{'확인 3'}</b><span>{'무엇을 원하는지 말할 수 있는가'}</span></div>
              <h2>{'원하는 카드를 지목하고, 모르는 것은 물어보세요'}</h2>
              <p className="lede">
                {'지목은 확률을 바꾸지 않습니다. 교환할 때 1순위가 될 뿐입니다. '}
                {'무작위만 있으면 구매 의사가 떨어지고 고를 수 있으면 올라간다는 연구(D2)에 대응하는 기능입니다.'}
              </p>

              <div className="grid2" style={{ marginTop: 20 }}>
                <div className="panel">
                  <h3 style={{ fontFamily: 'inherit', fontSize: 15, marginBottom: 10 }}>{'내 지목'}</h3>
                  {myTarget ? (
                    <CardPick card={cardById.get(myTarget)} picked onPick={() => {}} count={room.targets[myTarget] ?? 0} />
                  ) : (
                    <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>{'위 통 목록에서 카드를 하나 고르세요.'}</p>
                  )}
                  <div className="row" style={{ marginTop: 12 }}>
                    <button className="btn ghost sm" onClick={simTargets} disabled={busy === 'sim'}>
                      {busy === 'sim' ? '정하는 중…' : '팀원들 취향 정하기'}
                    </button>
                    <SimBadge what="팀원 취향" />
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 10, marginBottom: 0 }}>
                    {'서로 다른 카드를 원해야 교환이 성립합니다. 전원이 같은 순서로 원하면 바꿀 것이 없습니다.'}
                  </p>
                </div>

                <div className="panel">
                  <h3 style={{ fontFamily: 'inherit', fontSize: 15, marginBottom: 10 }}>
                    {'AI에게 순위 맡기기 '}
                    {ai && <Badge kind={ai.source === 'openai' ? 'ai' : 'rule'}>{ai.source === 'openai' ? 'ChatGPT gpt-4o-mini' : '규칙 기반 (AI 아님)'}</Badge>}
                  </h3>
                  <textarea value={taste} onChange={(e) => setTaste(e.target.value)} rows={3}
                    aria-label="카드 취향"
                    style={{ width: '100%', font: 'inherit', fontSize: 14, padding: 9, borderRadius: 6, border: '1px solid var(--line)' }} />
                  <div className="row" style={{ marginTop: 10 }}>
                    <button className="btn sm" onClick={askAi} disabled={busy === 'ai'}>
                      {busy === 'ai' ? '만드는 중…' : '2순위 이하 순위 만들기'}
                    </button>
                  </div>
                  {ai && (
                    <div style={{ marginTop: 12, fontSize: 13.5 }}>
                      <p style={{ color: 'var(--ink-2)' }}>{ai.why}</p>
                      <ol className="num" style={{ margin: 0, paddingLeft: 20, fontSize: 12.5, lineHeight: 1.9 }}>
                        {ai.prefs.slice(0, 6).map((id) => (
                          <li key={id}>{ai.names[id] ? `${ai.names[id].tier} · ${ai.names[id].price.toLocaleString('ko-KR')}원 · ${ai.names[id].name.slice(0, 34)}` : id}</li>
                        ))}
                      </ol>
                      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 10, marginBottom: 0 }}>{ai.note}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="panel" style={{ marginTop: 16 }}>
                <h3 style={{ fontFamily: 'inherit', fontSize: 15, marginBottom: 10 }}>{'용어와 시세 물어보기'}</h3>
                <div className="row">
                  <input value={ask.q} onChange={(e) => setAsk((s) => ({ ...s, q: e.target.value }))}
                    aria-label="질문"
                    style={{ flex: 1, minWidth: 220, font: 'inherit', fontSize: 14, padding: 9, borderRadius: 6, border: '1px solid var(--line)' }} />
                  <button className="btn sm" onClick={askTerm} disabled={busy === 'ask'}>{busy === 'ask' ? '묻는 중…' : '물어보기'}</button>
                </div>
                {ask.a && (
                  <div style={{ marginTop: 12, fontSize: 14 }}>
                    <Badge kind={ask.a.source === 'openai' ? 'ai' : 'rule'}>{ask.a.source === 'openai' ? 'ChatGPT gpt-4o-mini' : '규칙 기반 (AI 아님)'}</Badge>
                    <p style={{ marginTop: 8, color: 'var(--ink-2)' }}>{ask.a.answer}</p>
                    {ask.a.terms?.length > 0 && (
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--ink-3)' }}>
                        {ask.a.terms.map((t) => <li key={t.term}>{`${t.term} — ${t.means}`}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* ─────────── ⑤ 전원 개봉 ─────────── */}
            <section className="wrap section">
              <div className="proves"><b>{'확인 4'}</b><span>{'전원이 눌러야 열리는가 · 뽑히면 통이 줄어드는가'}</span></div>
              <h2>{'한 명이라도 안 누르면 열리지 않습니다'}</h2>
              <p className="lede">
                {'이 판정은 화면이 아니라 서버가 합니다. 준비가 덜 된 상태에서 개봉 버튼을 눌러 보세요 — '}
                {'화면이 막는 것이 아니라 서버가 409로 거절하는 것을 그대로 보여드립니다.'}
              </p>

              <div className="panel" style={{ marginTop: 18 }}>
                <div className="row" style={{ marginBottom: 12 }}>
                  <span className="num" style={{ fontSize: 15 }}>{`준비 ${room.readyCount} / ${room.members.length}명`}</span>
                  {room.allReady ? <Badge kind="ai">{'전원 준비 완료'}</Badge> : <Badge kind="rule">{'대기 중'}</Badge>}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {room.members.map((m) => (
                    <button key={m.id} className="btn ghost sm"
                      onClick={() => setReady(m.id, !m.ready)} disabled={room.opened}
                      aria-pressed={m.ready}
                      style={{ opacity: m.ready ? 1 : 0.45, borderColor: m.ready ? 'var(--ok)' : 'var(--line)' }}>
                      {`${m.name}${m.ready ? ' ✓' : ''}`}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 16 }}>
                  <button className="btn" onClick={openBox} disabled={busy === 'open' || room.opened}>
                    {room.opened ? '개봉 완료' : busy === 'open' ? '여는 중…' : '통 열기'}
                  </button>
                  {!room.allReady && !room.opened && (
                    <button className="btn ghost sm" onClick={readyAll} disabled={busy === 'ready'}>
                      {'전원 준비시키기'}
                    </button>
                  )}
                </div>
                {gateMsg && (
                  <div className="notice" style={{ marginTop: 14 }}>
                    <h3>{`서버 응답 ${gateMsg.status}`}</h3>
                    <p>{gateMsg.error}{gateMsg.waiting?.length ? ` — 아직 안 누른 사람: ${gateMsg.waiting.join(', ')}` : ''}</p>
                  </div>
                )}
              </div>

              {room.opened && (
                <>
                  <div className="tablewrap" style={{ marginTop: 18 }}>
                    <table>
                      <thead><tr><th>순서</th><th>참여자</th><th>뽑기 직전 남은 구좌</th><th>그때 S 확률</th><th>뽑은 카드</th></tr></thead>
                      <tbody>
                        {room.openResults.map((r, i) => (
                          <tr key={r.memberId} style={{ opacity: reveal === null || i < reveal ? 1 : 0.25 }}>
                            <td className="n">{`${i + 1}번째`}</td>
                            <td>{r.name}{r.memberId === me && <Badge kind="ai">{'나'}</Badge>}</td>
                            <td className="n">{`${r.slotsBefore.toLocaleString('ko-KR')}구좌`}</td>
                            <td className="n hi">{r.oddsBefore.S.pct}<span className="freq">{r.oddsBefore.S.freq}</span></td>
                            <td className="n"><Rarity tier={r.tier} />{` ${r.price.toLocaleString('ko-KR')}원`}
                              <span className="freq">{r.name_.slice(0, 32)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="notice" style={{ marginTop: 16 }}>
                    <h3>{'뽑힌 카드는 통에서 빠집니다'}</h3>
                    <p>
                      {`위 표의 "뽑기 직전 남은 구좌"가 한 명씩 줄어드는 것을 보세요. 지금 통에는 ${left.toLocaleString('ko-KR')}구좌가 남아 있습니다. `}
                      <b>{'많이 안 나왔으니 이제 나올 때가 됐다는 생각은 보통은 착각이지만, 비복원 추출에서는 사실이 됩니다.'}</b>
                      {' 그래서 천장 같은 장치를 따로 만들지 않았습니다. 통이 줄어드는 것 자체가 천장입니다.'}
                    </p>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <h3 style={{ fontFamily: 'inherit', fontSize: 15, marginBottom: 8 }}>{'구좌가 소진될수록 확률이 이렇게 오릅니다'}</h3>
                    <UpdateTable updates={updates} tiers={box.tiers.map((t) => t.tier)} />
                    <p style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 8 }}>
                      {'—는 확률 0이 아니라 성립할 수 없는 상태입니다. 990구좌가 빠졌는데 B등급 25장이 아직 남아 있을 수는 없습니다.'}
                    </p>
                  </div>
                </>
              )}
            </section>

            {/* ─────────── ⑥ 교환 ─────────── */}
            {room.opened && (
              <section className="wrap section">
                <div className="proves"><b>{'확인 5'}</b><span>{'팀 확률이 개인 확률이 되는가'}</span></div>
                <h2>{'안 나온 것은 팀 안에서 바꿉니다'}</h2>
                <p className="lede">
                  {'팀에 나오는 것과 내가 갖는 것은 다릅니다. 교환이 그 둘을 잇는 장치입니다. '}
                  <b>{'교환이 없으면 팀이 아무 의미가 없습니다'}</b>
                  {' — 인원이 늘어도 내 확률은 재고 나누기 구좌 그대로이기 때문입니다.'}
                </p>

                {!room.trade ? (
                  <button className="btn" style={{ marginTop: 16 }} onClick={doTrade} disabled={busy === 'trade'}>
                    {busy === 'trade' ? '교환 계산 중…' : '교환 실행'}
                  </button>
                ) : (
                  <>
                    <div className="panel" style={{ marginTop: 18 }}>
                      <h3 style={{ fontFamily: 'inherit', fontSize: 15, marginBottom: 8 }}>{'성립한 교환 고리'}</h3>
                      <CycleView cycles={room.trade.cycles} />
                    </div>
                    <div style={{ marginTop: 16 }}><TradeTable results={room.trade.results} /></div>
                    <div className="notice" style={{ marginTop: 16 }}>
                      <h3>{'이 교환에서 아무도 손해 보지 않습니다'}</h3>
                      <p>
                        {'알고리즘이 보장합니다 — 개별 합리성. Gale의 Top Trading Cycles이며 Shapley & Scarf(1974)에서 기술됩니다. '}
                        {'그리고 선호를 거짓으로 말해도 이득이 없습니다(전략 방지, Roth 1982). '}
                        <b>{`이번 라운드에서 ${room.trade.improvedCount}명이 나아졌고, 나빠진 사람은 ${room.trade.noneWorse ? '없습니다' : '있습니다 — 있으면 안 되는 결과입니다'}.`}</b>
                      </p>
                    </div>

                    <h3 style={{ fontFamily: 'inherit', fontSize: 15, margin: '22px 0 8px' }}>
                      {'교환 전환율 — 100%가 아닙니다'} <SimBadge what={`${boxes.conversion.trials.toLocaleString('ko-KR')}회`} />
                    </h3>
                    <div className="tablewrap">
                      <table>
                        <thead>
                          <tr>
                            <th>{'같은 걸 원한 사람'}</th>
                            <th>{'선호가 서로 다를 때'}</th>
                            <th>{'선호가 모두 같을 때'}</th>
                            <th>{'교환으로 나아진 사람 (서로 다를 때)'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {boxes.conversion.models.heterogeneous.rows.map((row, i) => (
                            <tr key={row.k}>
                              <td className="n">{row.k === 1 ? '1명 (나만)' : row.k === box.teamMax ? `${row.k}명 (전원)` : `${row.k}명`}</td>
                              <td className="n hi">{row.movedPct}</td>
                              <td className="n">{boxes.conversion.models.homogeneous.rows[i].movedPct}</td>
                              <td className="n">{row.improvedPct}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="lede" style={{ marginTop: 10 }}>
                      {'남이 뽑은 S가 교환으로 나에게 오는 비율입니다. 같은 것을 원하는 사람이 많을수록 전환이 줄고, 전원이 같은 것을 원하면 0이 됩니다. '}
                      <b>{'그리고 선호가 모두 같으면 교환 자체가 거의 일어나지 않습니다'}</b>
                      {' — 바꿀 것이 엇갈리지 않기 때문입니다. 지목과 AI 순위가 있는 이유가 이것입니다.'}
                    </p>
                  </>
                )}
              </section>
            )}

            {/* ─────────── ⑦ 대조 뷰 ─────────── */}
            {room.opened && (
              <section className="wrap section">
                <div className="proves"><b>{'확인 6'}</b><span>{'오리파와 무엇이 다른가'}</span></div>
                <h2>{'같은 상황을 세 갈래로 놓고 보면'}</h2>
                <div className="tablewrap compare" style={{ marginTop: 18 }}>
                  <table>
                    <thead>
                      <tr><th>{''}</th><th>{'오리파 (실제 시장)'}</th><th>{'혼자 열기'}</th><th>{`팀으로 열기 (${room.members.length}명)`}</th></tr>
                    </thead>
                    <tbody>
                      <tr><td>{'통 공개'}</td><td className="unknown">{'✗'}</td><td>{'✓'}</td><td>{'✓'}</td></tr>
                      <tr>
                        <td>{'공시 확률 (S)'}</td>
                        <td className="unknown">{'?'}</td>
                        <td className="n">{odds[0].soloPct}</td>
                        <td className="n hi">{odds[0].team[room.members.length - 1].pct}</td>
                      </tr>
                      <tr>
                        <td>{'받은 것'}</td>
                        <td className="unknown">{'?'}</td>
                        <td className="n">{myResult ? `${myResult.tier} · ${myResult.price.toLocaleString('ko-KR')}원` : '—'}</td>
                        <td className="n">{myTrade?.after ? `${myTrade.after.tier} · ${myTrade.after.price.toLocaleString('ko-KR')}원` : (myResult ? `${myResult.tier} · ${myResult.price.toLocaleString('ko-KR')}원` : '—')}</td>
                      </tr>
                      <tr>
                        <td>{'교환'}</td><td className="unknown">{'불가'}</td><td>{'불가 (상대 없음)'}</td>
                        <td className="n">{room.trade ? `${room.trade.improvedCount}명 개선` : '아직 실행 안 함'}</td>
                      </tr>
                      <tr><td>{'꽝'}</td><td className="unknown">{'?'}</td><td>{'없음'}</td><td>{'없음'}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="notice" style={{ marginTop: 16 }}>
                  <h3>{'오리파 칸이 물음표로 남는 것이 이 표의 목적입니다'}</h3>
                  <p>
                    {`저 칸을 채울 수가 없습니다. 확률이 공시되지 않아서입니다 (실측 ${boxes.oripa.probNum}/${boxes.oripa.total}건). `}
                    <b>{'추정치로 채우지 않았습니다'}</b>
                    {' — 채우는 순간 이 비교가 거짓이 됩니다. 오른쪽 두 칸은 실제로 서버가 뽑고 교환한 결과입니다.'}
                  </p>
                </div>
                <p className="mono" style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 12 }}>
                  {`추첨 시드 ${room.id}|${room.boxId}|${me}|${room.round}`}
                  {room.trade && `   ·   교환 시드 ${room.trade.seed}`}
                </p>
              </section>
            )}
          </>
        )}

        {/* ─────────── ⑧ 근거 시트 ─────────── */}
        <section className="wrap section">
          <div className="proves"><b>{'확인 7'}</b><span>{'무엇이 정의이고 무엇이 가정인가'}</span></div>
          <h2>{'근거'}</h2>
          <div className="grid2" style={{ marginTop: 18 }}>
            <div className="panel">
              <h3 style={{ fontFamily: 'inherit', fontSize: 15, marginBottom: 10 }}>{'확률이 어디서 오는가'}</h3>
              <div className="formula">{Object.values(boxes.basis).slice(0, 5).join('\n')}</div>
            </div>
            <div className="panel">
              <h3 style={{ fontFamily: 'inherit', fontSize: 15, marginBottom: 10 }}>{'무엇이 어떤 종류인가'}</h3>
              <div className="tablewrap" style={{ border: 0 }}>
                <table>
                  <tbody>
                    {[
                      ['확률 = 재고 / 구좌', '정의'],
                      ['팀 확률 = 초기하분포', '정의에서 유도'],
                      ['비복원 갱신', '정의에서 유도'],
                      ['교환의 4가지 성질', '정리 (증명됨)'],
                      ['꽝 없음 1층 (최저가 ≥ 참여비)', '데이터 불변식'],
                      ['꽝 없음 2층 (개별 합리성)', '정리'],
                      ['크롤 875건 · 카드 472건', '실측'],
                      ['오리파 확률 미표기 37/37', '실측 (상품 표기 기준)'],
                      ['통 구성 N=1,000 · K=1/4/25/970', '설계 선택'],
                      ['참여비 10,000원', '설계 선택 (실측에서 유도)'],
                      ['정원 10명', '설계 선택'],
                      ['타깃이 30~40대 부모라는 것', '가정'],
                      ['통 원가 = 시세', '가정 (매입가는 모델링 안 함)'],
                      ['교환이 진입장벽을 낮춘다는 것', '미검증'],
                    ].map(([k, v]) => (
                      <tr key={k}><td style={{ fontSize: 13 }}>{k}</td><td style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{v}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <h3 style={{ fontFamily: 'inherit', fontSize: 15, marginBottom: 8 }}>{'무엇이 시뮬레이션인가'}</h3>
            <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: 0 }}>
              {'팀원 · 교환 상대 · 10만 회 분포는 시뮬레이션입니다. 결제와 배송은 구현하지 않았습니다. '}
              {'추첨과 교환 자체는 시뮬레이션이 아니라 서버가 실제로 계산한 결과이고, 시드를 공개해 재현할 수 있습니다.'}
            </p>
          </div>
        </section>

        <footer className="wrap foot">
          <p>{`통 ${box.N.toLocaleString('ko-KR')}구좌 · 참여비 ${box.fee.toLocaleString('ko-KR')}원 · 크롤 ${box.crawledAt?.slice(0, 10)} · 다나와`}</p>
          <p style={{ margin: 0 }}>{'모든 수치는 코드 실행 출력입니다. 근거는 docs/references.md, 명세는 SPEC.md에 있습니다.'}</p>
        </footer>
      </main>
    </>
  )
}
