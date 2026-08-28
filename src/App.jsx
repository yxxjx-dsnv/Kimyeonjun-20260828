/**
 * 올박스 — 올웨이즈 앱 하단에 붙는 신규 탭.
 *
 * 화면 구성은 실제 올웨이즈 앱(com.ilevit.alwayz.ios 8.9.59)을 보고 맞췄다.
 * 하단 중앙의 플로팅 자리는 지금 '올세일'이 쓰고 있는데, 거기에 올박스를 놓았다.
 * 새 간판 기능이 어디에 붙을지를 말이 아니라 자리로 보이기 위해서다.
 *
 * 홈·콘텐츠·관심상품·내 정보 탭은 맥락을 보여주는 껍데기다(화면에 명시).
 * 올박스 탭만 실제로 동작한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  won, pct, naturalFreq, Delta, ProductCard, OddsCurve, OddsBars, OddsTable,
  TierStrip, MemberRail, RevealCard, HonestySheet, TasteChat,
  GroupCurve, GroupTable, GroupResult,
  IconHome, IconContent, IconHeart, IconUser, IconBox,
} from './parts.jsx'

const SIM_NAMES = ['정희', '순자', '영미', '경숙', '미숙', '현주', '은영', '보라', '수진']
const rid = () => Math.random().toString(36).slice(2, 8)

/* ─────────────────────────── 홈 (껍데기) ─────────────────────────── */
function HomeTab({ pool }) {
  const items = useMemo(
    () => pool.filter((i) => i.image).slice(0, 24),
    [pool]
  )
  return (
    <>
      <div className="stub">
        홈·콘텐츠·관심상품·내 정보는 <b>올박스가 어디에 붙는지</b> 보여주기 위한 껍데기입니다.
        상품과 가격은 실제 수집 데이터이고, 담기·결제는 구현하지 않았습니다.
      </div>
      <div className="grid">
        {items.map((it, i) => (
          <ProductCard key={it.id} item={it} badge={i % 5 === 0 ? '올세일' : null} />
        ))}
      </div>
    </>
  )
}

function StubTab({ title, body }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{body}</p>
      <p className="empty__sub">이 과제에서 구현한 것은 <b>올박스</b> 탭입니다.</p>
    </div>
  )
}

/* ─────────────────────────── 올박스 ─────────────────────────── */
function BoxList({ boxes, groupbuys, onPick, onPickGroup, companyBEP }) {
  return (
    <>
      <div className="hero">
        <h1>여럿이 모여야 열립니다</h1>
        <p>
          꽝이 없는 확률형 구매입니다. 사람이 모일수록 좋은 등급이 나올 확률이 오르고,
          <b> 참여자 전원이 뽑기를 눌러야만</b> 상자가 열립니다.
        </p>
      </div>
      <ul className="blist">
        {boxes.map((b) => (
          <li key={b.id}>
            <button className="bcard" onClick={() => onPick(b.id)}>
              <span className="bcard__top">
                <span className="bcard__name">{b.name}</span>
                <span className="bcard__entry">{won(b.entry)}</span>
              </span>
              <span className="bcard__blurb">{b.blurb}</span>
              <span className="bcard__odds">
                최고 등급 <b>{b.topLabel}</b>
                <em>
                  혼자 {pct(b.oddsByTeam[1].S, 3)} → 10명 {pct(b.oddsByTeam[10].S, 3)}
                </em>
              </span>
              <span className="bcard__ratio">
                참여비는 최고 상품가({won(b.topRetail)})의 200분의 1입니다
              </span>
            </button>
          </li>
        ))}
      </ul>
      <h2 className="lead2">상품이 정해진 공동구매</h2>
      <p className="lead2__s">
        무엇을 받을지는 확정입니다. <b>얼마를 내는지</b>만 확률입니다 —
        모일수록 싸지고, 그중 몇 명은 공짜입니다.
      </p>
      <ul className="blist">
        {groupbuys.map((g) => (
          <li key={g.id}>
            <button className="gbcard" onClick={() => onPickGroup(g.id)}>
              <span className="gbcard__row">
                {g.item.image && <img className="gbcard__thumb" src={g.item.image} alt="" loading="lazy" />}
                <span className="gbcard__b">
                  <span className="gbcard__tag">상품 확정</span>
                  <span className="gbcard__name">{g.name}</span>
                  <span className="gbcard__it">{g.item.name}</span>
                  <span className="gbcard__odds">
                    {`${g.minTeam}명 ${g.steps[0].discount}%↓ · ${g.teamMax}명 ${g.steps.at(-1).discount}%↓ + ${g.steps.at(-1).freeCount}명 무료`}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="foot">
        회차는 {companyBEP}명부터 회사에 흑자입니다. 그래서 사람을 모으라고 권합니다 —
        숨길 이유가 없는 숫자라 적어 둡니다.
      </p>
    </>
  )
}

export default function App() {
  const [tab, setTab] = useState('olbox')
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [boxId, setBoxId] = useState(null)
  const [room, setRoom] = useState(null) // {roomId, live, memberId, members[]}
  const [phase, setPhase] = useState('list') // list|detail|gather|ready|count|result
  const [count, setCount] = useState(3)
  const [result, setResult] = useState(null)
  const [curated, setCurated] = useState(null) // 취향 대화 결과 (확률표까지 함께 바뀐다)
  const [gbId, setGbId] = useState(null) // 공동구매형
  const [gbTeam, setGbTeam] = useState(20)
  const [gbResult, setGbResult] = useState(null)
  const [sheet, setSheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const timers = useRef([])

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))
  useEffect(() => clearTimers, [])

  useEffect(() => {
    fetch('/api/boxes')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setErr(e.message))
  }, [])

  const box = data?.boxes.find((b) => b.id === boxId) || null
  const teamMax = data?.teamMax ?? 10
  const members = room?.members ?? []
  const teamSize = members.length
  const readyCount = members.filter((m) => m.ready).length
  // 취향을 좁히면 티어 평균 시가가 바뀌므로 확률도 바뀐다. 곡선·막대·표가 모두
  // 같은 출처를 보도록 큐레이션 결과가 있으면 그쪽을 쓴다.
  const oddsByTeam = curated?.oddsByTeam ?? box?.oddsByTeam
  const evByTeam = curated?.evByTeam ?? box?.evByTeam
  const tierList = curated?.tiers ?? box?.tiers
  const odds = box ? oddsByTeam[Math.min(teamMax, Math.max(1, teamSize || 1))] : null

  /* 방 만들기 — 서버 방을 먼저 시도하고, 안 되면 시뮬레이션으로 내려앉는다. */
  const openBox = useCallback(async (id) => {
    setBoxId(id); setResult(null); setCurated(null); setPhase('detail')
    let live = false, roomId = rid(), memberId = 'me'
    try {
      const r = await fetch('/api/room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', boxId: id, name: '나' }),
      })
      if (r.ok) {
        const j = await r.json()
        live = Boolean(j.state.live); roomId = j.state.roomId; memberId = j.memberId
      }
    } catch { /* 시뮬레이션으로 진행 */ }
    setRoom({ roomId, live, memberId, members: [{ id: memberId, name: '나', sim: false, draws: 1, ready: false }] })
  }, [])

  /* 체험용 팀원 — 한 명씩 들어오게 해서 곡선 위의 점이 움직이는 걸 보이게 한다. */
  const fillTeam = useCallback(() => {
    if (!room) return
    setPhase('gather')
    const need = teamMax - room.members.length
    for (let i = 0; i < need; i++) {
      later(() => {
        setRoom((r) => {
          if (!r || r.members.length >= teamMax) return r
          return {
            ...r,
            members: [...r.members, {
              id: `sim${r.members.length}`, name: SIM_NAMES[r.members.length - 1] || `팀원${r.members.length}`,
              sim: true, draws: 1, ready: false,
            }],
          }
        })
      }, 380 * (i + 1))
    }
  }, [room, teamMax])

  const addOne = () => {
    setPhase('gather')
    setRoom((r) => (!r || r.members.length >= teamMax ? r : {
      ...r,
      members: [...r.members, {
        id: `sim${r.members.length}`, name: SIM_NAMES[r.members.length - 1] || `팀원${r.members.length}`,
        sim: true, draws: 1, ready: false,
      }],
    }))
  }

  const setMyDraws = (d) =>
    // 뽑기 수가 바뀌면 팀 물량이 바뀌어 전원의 확률표가 움직인다. 준비를 되돌린다.
    setRoom((r) => ({ ...r, members: r.members.map((m) => ({ ...m, draws: m.id === r.memberId ? d : m.draws, ready: false })) }))

  const doOpen = useCallback(async (snapshot) => {
    setBusy(true)
    try {
      const body = snapshot.live
        ? { roomId: snapshot.roomId }
        : {
            sim: true, roomId: snapshot.roomId, boxId,
            members: snapshot.members.map(({ id, name, draws }) => ({ id, name, draws })),
          }
      if (curated?.pickedIds?.length) body.pickedIds = curated.pickedIds
      const r = await fetch('/api/open', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setResult(j); setPhase('result')
    } catch (e) {
      setErr(e.message); setPhase('ready')
    } finally { setBusy(false) }
  }, [boxId, curated])

  /* 뽑기! — 내가 먼저 누르면 나머지가 하나씩 따라 누른다. 마지막 한 명이 관건이다. */
  const pressDraw = () => {
    setPhase('ready')
    setRoom((r) => ({ ...r, members: r.members.map((m) => (m.id === r.memberId ? { ...m, ready: true } : m)) }))
    const rest = (room?.members || []).filter((m) => m.id !== room.memberId)
    let t = 300
    rest.forEach((m, i) => {
      t += 260 + (i === rest.length - 1 ? 700 : Math.random() * 320)
      later(() => setRoom((r) => ({ ...r, members: r.members.map((x) => (x.id === m.id ? { ...x, ready: true } : x)) })), t)
    })
    later(() => {
      setPhase('count'); setCount(3)
      later(() => setCount(2), 800); later(() => setCount(1), 1600)
      later(() => setRoom((r) => { doOpen(r); return r }), 2400)
    }, t + 500)
  }

  const reset = () => { clearTimers(); setResult(null); setPhase('detail'); openBox(boxId) }
  const backToList = () => {
    clearTimers(); setPhase('list'); setBoxId(null); setRoom(null); setResult(null); setCurated(null)
    setGbId(null); setGbResult(null)
  }

  const gb = data?.groupbuys?.find((g) => g.id === gbId) || null
  const openGroup = (id) => {
    const g = data.groupbuys.find((x) => x.id === id)
    setGbId(id); setGbResult(null); setGbTeam(g.minTeam); setBoxId(null); setPhase('group')
  }
  /** 발주 — 인원이 최소 수량을 넘어야 서버가 200을 준다. */
  const placeOrder = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/open', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'groupbuy', gbId, roomId: `gb${gbTeam}`,
          members: Array.from({ length: gbTeam }, (_, i) => ({ id: `g${i}`, name: i === 0 ? '나' : SIM_NAMES[(i - 1) % SIM_NAMES.length] + (i > 9 ? i : '') })),
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setGbResult(j)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  /* ── 렌더 ───────────────────────────────────────────────── */
  if (err && !data) return <Shell tab={tab} setTab={setTab}><div className="empty"><h2>불러오지 못했습니다</h2><p>{err}</p></div></Shell>
  if (!data) return <Shell tab={tab} setTab={setTab}><div className="empty"><h2>불러오는 중…</h2></div></Shell>

  const inviteUrl = room ? `${location.origin}/?room=${room.roomId}&box=${boxId}` : ''

  let body = null
  if (tab === 'home') body = <HomeTab pool={data.sample || []} />
  else if (tab === 'content') body = <StubTab title="콘텐츠" body="영상·기획전 탭입니다." />
  else if (tab === 'wish') body = <StubTab title="관심상품" body="찜한 상품 탭입니다." />
  else if (tab === 'me') body = <StubTab title="내 정보" body="주문내역·올팜·설정 탭입니다." />
  else if (phase === 'group' && gb) {
    const step = gb.steps.find((x) => x.n === gbTeam) || gb.steps[0]
    body = gbResult ? (
      <>
        <button className="back" onClick={backToList}>← 목록</button>
        <header className="rhead">
          <h2>{`${gbResult.gbName} 발주 완료`}</h2>
          <p>{`${gbResult.teamSize}명 · 정가 ${won(gbResult.listPrice)} → ${won(gbResult.pay)} (${gbResult.discountPct}% 할인) · 무료 당첨 ${gbResult.freeCount}명`}</p>
        </header>
        <ul className="rvlist">
          {gbResult.results.map((r) => (
            <GroupResult key={r.memberId} r={r} mine={r.memberId === 'g0'} />
          ))}
        </ul>
        <p className="seed">{gbResult.seedProof.note}<br /><code>{gbResult.seedProof.pattern}</code></p>
        <div className="row">
          <button className="btn btn--ghost" onClick={backToList}>목록으로</button>
          <button className="btn" onClick={() => setGbResult(null)}>인원 바꿔보기</button>
        </div>
      </>
    ) : (
      <>
        <button className="back" onClick={backToList}>← 목록</button>
        <header className="bhead">
          <h2>{gb.name}</h2>
          <p>{gb.blurb}</p>
        </header>
        <div className="gbhero">
          {gb.item.image && <img src={gb.item.image} alt="" />}
          <div>
            <p className="gbhero__n">{gb.item.name}</p>
            <p className="gbhero__p">{`정가 ${won(gb.listPrice)} · 최소 발주 ${gb.minTeam}명`}</p>
          </div>
        </div>
        <GroupCurve steps={gb.steps} teamSize={gbTeam} />
        <div className="gbnow">
          <div><b>{won(step.pay)}</b><span>내가 내는 돈</span></div>
          <div><b className="hi">{`${step.discount}%`}</b><span>전원 할인</span></div>
          <div><b className="hi">{`${step.freeCount}명`}</b><span>{`무료 당첨 (${step.freeOdds}%)`}</span></div>
        </div>
        <div className="gbslider">
          <span>참여 인원</span>
          <input type="range" min={gb.minTeam} max={gb.teamMax} value={gbTeam}
            onChange={(e) => setGbTeam(Number(e.target.value))} aria-label="참여 인원" />
          <b>{`${gbTeam}명`}</b>
        </div>
        <GroupTable steps={gb.steps} teamSize={gbTeam} listPrice={gb.listPrice} />
        <button className="btn btn--go" onClick={placeOrder} disabled={busy}>
          {busy ? '발주 중…' : `${gbTeam}명으로 발주하기`}
        </button>
        <p className="gatenote">
          {`상품은 확정입니다. 안 당첨돼도 정가보다 ${won(gb.listPrice - step.pay)} 싸게 삽니다.`}
        </p>
      </>
    )
  }
  else if (phase === 'list' || !box) body = <BoxList boxes={data.boxes} groupbuys={data.groupbuys || []} onPick={openBox} onPickGroup={openGroup} companyBEP={data.companyBEP} />
  else if (phase === 'result' && result) {
    const mine = result.results.find((r) => r.memberId === room.memberId) || result.results[0]
    body = (
      <>
        <header className="rhead">
          <h2>{result.boxName} 개봉</h2>
          <p>{result.teamSize}명이 함께 열었습니다 · 총 {result.teamDraws}회</p>
        </header>
        <div className="myrv">
          <span className="myrv__lab">내가 받은 것</span>
          <span className={`tier tier--${mine.best}`}>{mine.best}</span>
          <p className="myrv__nm">{mine.picks[0].item.name}</p>
          <p className="myrv__pr">
            낸 돈 {won(mine.settle.paid)} → 받은 시가 <b>{won(mine.settle.retailValue)}</b>
            <Delta v={mine.settle.delta} />
          </p>
        </div>
        <ul className="rvlist">
          {result.results.map((r, i) => (
            <RevealCard key={r.memberId} r={r} entry={result.entry} mine={r.memberId === mine.memberId} delay={i * 90} />
          ))}
        </ul>
        <p className="seed">{result.seedProof.note}<br /><code>{result.seedProof.pattern}</code></p>
        <div className="row">
          <button className="btn btn--ghost" onClick={backToList}>다른 박스 보기</button>
          <button className="btn" onClick={reset}>다시 해보기</button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        <button className="back" onClick={backToList}>← 박스 목록</button>
        <header className="bhead">
          <h2>{box.name}</h2>
          <p>{won(box.entry)} · 최고 등급 {box.topLabel}</p>
        </header>

        <TasteChat boxId={box.id} teamSize={teamSize || 1} axis={curated?.axis}
          onCurated={setCurated} disabled={phase === 'ready' || phase === 'count'} />

        <OddsCurve oddsByTeam={oddsByTeam} teamSize={teamSize || 1}
          customerBEP={box.customerBEP} teamMax={teamMax} />

        <div className="now">
          <span className="now__lab">지금 {teamSize || 1}명 기준 최고 등급</span>
          <strong className="now__num">{pct(odds.S, 3)}</strong>
          <em className="now__nf">{naturalFreq(odds.S)}</em>
        </div>
        <OddsBars odds={odds} />
        <OddsTable oddsByTeam={oddsByTeam} evByTeam={evByTeam} teamMax={teamMax} teamSize={teamSize} />

        <MemberRail members={members} teamMax={teamMax} readyCount={readyCount}
          phase={phase === 'ready' || phase === 'count' ? 'ready' : 'gather'} />

        {phase !== 'count' && (
          <div className="acts">
            <button className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>
              초대 링크 복사
            </button>
            <button className="btn btn--ghost" onClick={addOne} disabled={teamSize >= teamMax}>
              한 명 부르기
            </button>
            <button className="btn btn--ghost" onClick={fillTeam} disabled={teamSize >= teamMax}>
              {teamMax}명 채우기
            </button>
          </div>
        )}

        {phase !== 'count' && phase !== 'ready' && (
          <div className="draws">
            <span>내 뽑기 수</span>
            {Array.from({ length: data.maxDrawsPerPerson }, (_, i) => i + 1).map((d) => (
              <button key={d} className={`chip ${members.find((m) => m.id === room.memberId)?.draws === d ? 'is-on' : ''}`}
                onClick={() => setMyDraws(d)}>{d}회</button>
            ))}
            <em>많이 뽑으면 팀 물량이 늘어 <b>전원의</b> 확률이 오릅니다</em>
          </div>
        )}

        {phase === 'count' ? (
          <div className="count"><span>{count}</span><p>전원 준비 완료</p></div>
        ) : (
          <button className="btn btn--go" onClick={pressDraw}
            disabled={busy || phase === 'ready' || teamSize < 1}>
            {phase === 'ready'
              ? `뽑기 ${readyCount}/${teamSize} — 아직 ${teamSize - readyCount}명이 안 눌렀습니다`
              : '뽑기!'}
          </button>
        )}
        {phase === 'ready' && (
          <p className="gatenote">한 명이라도 누르지 않으면 열리지 않습니다. 서버가 카운트를 셉니다.</p>
        )}

        <div className="tiers">
          {curated && (
            <p className="tiers__note">
              취향에 맞춰 후보를 {curated.pickedCount}개로 좁혔습니다.
              {curated.usedFallback && ' (후보가 모자라 기본 구성으로 담았습니다)'}
              {!curated.aiEnabled && ' (AI 키 없이 규칙 기반으로 구성했습니다)'}
            </p>
          )}
          {tierList.map((t) => <TierStrip key={t.tier} tier={t} odds={odds[t.tier]} />)}
        </div>
      </>
    )
  }

  return (
    <Shell tab={tab} setTab={setTab} onSheet={() => setSheet(true)}
      live={room ? room.live : null} guide={{ phase, box, data, teamSize }}>
      {body}
      {sheet && (
        <>
          <div className="scrim" onClick={() => setSheet(false)} />
          <HonestySheet formula={data.formula} pool={data.pool} companyBEP={data.companyBEP}
            onClose={() => setSheet(false)} />
        </>
      )}
    </Shell>
  )
}

/* ─────────────────────────── 앱 셸 ─────────────────────────── */
const TABS = [
  { id: 'home', label: '홈', Icon: IconHome },
  { id: 'content', label: '콘텐츠', Icon: IconContent },
  { id: 'olbox', label: '올박스', Icon: IconBox, center: true },
  { id: 'wish', label: '관심상품', Icon: IconHeart },
  { id: 'me', label: '내 정보', Icon: IconUser },
]

function Shell({ tab, setTab, children, onSheet, live, guide }) {
  return (
    <div className="stage">
      {guide && <GuideRail side="left" {...guide} />}
      <div className="phone">
        <header className="top">
          <span className="top__logo">올웨이즈</span>
          {live !== null && (
            <span className={`top__live ${live ? 'is-live' : ''}`}>{live ? '실시간 방' : '시뮬레이션'}</span>
          )}
          {onSheet && <button className="top__q" onClick={onSheet}>확률 근거</button>}
        </header>
        <main className="body">{children}</main>
        <nav className="tabbar">
          {TABS.map(({ id, label, Icon, center }) => (
            <button key={id} className={`tabbar__b ${center ? 'is-center' : ''} ${tab === id ? 'is-on' : ''}`}
              onClick={() => setTab(id)} aria-current={tab === id}>
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
      {guide && <GuideRail side="right" {...guide} />}
    </div>
  )
}

/* 데스크톱 여백에 설계 근거를 붙인다 — 심사자가 화면과 이유를 같이 보게. */
function GuideRail({ side, phase, box, data, teamSize }) {
  const left = [
    ['컬처 시그널', '말랑이·슬랑이·왁뿌볼. 감각(손에 오는 확정 피드백) × 확률(불확실성의 해소) × 사회(리빌이 콘텐츠)의 3층 구조.'],
    ['결핍', '전부 확정된 하루 안의 싸고 즉각적인 사건 하나, 그리고 그걸 봐줄 사람.'],
    ['왜 올웨이즈인가', '올팜은 매일 시간을 쓰지만 보상이 확정적이고 30일 지연된다. 사건이 아니라 노동이다.'],
    ['왜 꽝이 없나', '혜택 소비자는 낭비를 못 견딘다. "꽝 나오면 돈 버린 것"이 확률형의 유일한 진입장벽이었다.'],
  ]
  const right = [
    ['확률표는 계산 결과다', `수량할인 곡선과 바이럴 회수 곡선의 합성. 수집한 ${data?.pool.size ?? 0}건의 실제 판매가가 계산의 입력이다.`],
    ['전원 게이트', '준비 카운트를 서버가 센다. 한 명이라도 안 누르면 409를 돌려준다. 프론트가 앞당길 수 없다.'],
    ['재추첨 불가', '시드가 방·박스·사람·회차로 고정된다. 같은 방을 다시 열면 같은 결과가 나온다.'],
    ['표기', '확률 옆에 언제나 자연빈도를 쓴다(Gigerenzer·Hoffrage 1995). 백분율만 쓰면 낮은 확률이 과대평가된다.'],
  ]
  const list = side === 'left' ? left : right
  return (
    <aside className={`rail2 rail2--${side}`} aria-hidden="true">
      {list.map(([h, b], i) => (
        <section key={i} className="rail2__it"><h4>{h}</h4><p>{b}</p></section>
      ))}
      {side === 'right' && box && (
        <section className="rail2__it rail2__it--now">
          <h4>지금 화면</h4>
          <p>{box.name} · 팀 {teamSize || 1}명 · 최고 등급 {pct(box.oddsByTeam[Math.max(1, teamSize || 1)].S, 3)}</p>
        </section>
      )}
    </aside>
  )
}
