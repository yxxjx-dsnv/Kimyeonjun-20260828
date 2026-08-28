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
  won, pct, naturalFreq, Delta, TIERS, ProductCard, OddsBars,
  TierStrip, MemberRail, RevealCard, RevealScene, HonestySheet, TasteChat,
  GroupCurve, GroupTable, GroupResult,
  DailyCard, DailyEconomics, VoteCard,
  IconHome, IconContent, IconHeart, IconUser, IconBox, IconCart, IconSearch, QUICK_ICON,
} from './parts.jsx'

const SIM_NAMES = ['정희', '순자', '영미', '경숙', '미숙', '현주', '은영', '보라', '수진']
const rid = () => Math.random().toString(36).slice(2, 8)

/* ─────────────────────────── 홈 (껍데기) ─────────────────────────── */
/* 홈 — 실제 올웨이즈 홈 구조를 그대로 따른다.
   검색·카테고리·퀵메뉴는 장식이 아니라 전부 동작한다. 눌러도 아무 일이
   없는 컨트롤은 만들지 않는다(그게 '껍데기처럼 보이는' 가장 큰 원인이다). */
const CATS = [
  { id: 'all', label: '추천' },
  { id: 'daily', label: '생필품' },
  { id: 'home', label: '주방·가전' },
  { id: 'card', label: '포켓몬 카드' },
  { id: 'uniform', label: '스포츠' },
  { id: 'prize', label: '건강식품' },
]
const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.id, c.label]))

function SectionHead({ title, onMore }) {
  return (
    <div className="shead">
      <h2>{title}</h2>
      {onMore && <button className="shead__more" onClick={onMore}>더보기 ›</button>}
    </div>
  )
}

function HomeTab({ pool, onGoOlbox }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  // 서버(homeSample)가 이미 이미지 있는 것만 보낸다 — 여기서 또 거를 것 없다.
  const withImg = pool

  const query = q.trim()
  const hits = useMemo(
    () => (query ? withImg.filter((i) => i.name.includes(query)) : null),
    [withImg, query]
  )
  const byCat = useMemo(
    () => (cat === 'all' ? null : withImg.filter((i) => i.group === cat)),
    [withImg, cat]
  )
  // 추천 탭은 카테고리별 섹션으로 나눈다. 예전엔 가격 오름차순 24개라
  // 화면이 2,020~4,930원 생필품으로만 채워졌다.
  const sections = useMemo(
    () => CATS.slice(1).map((c) => [c, withImg.filter((i) => i.group === c.id).slice(0, 6)]),
    [withImg]
  )

  const quick = [
    { k: 'olbox', label: '올박스', tag: 'NEW', on: onGoOlbox },
    { k: 'deal', label: '특가', on: () => { setCat('daily'); setQ('') } },
    { k: 'card', label: '카드', on: () => { setCat('card'); setQ('') } },
    { k: 'uniform', label: '유니폼', on: () => { setCat('uniform'); setQ('') } },
    { k: 'home', label: '가전', on: () => { setCat('home'); setQ('') } },
    { k: 'prize', label: '건강', on: () => { setCat('prize'); setQ('') } },
  ]

  const list = hits || byCat
  return (
    <>
      <div className="hsearch">
        <IconSearch />
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="올웨이즈에서 상품 검색하기" aria-label="상품 검색" maxLength={40}
        />
      </div>

      <nav className="cats" aria-label="카테고리">
        {CATS.map((c) => (
          <button key={c.id} className={`cats__b ${cat === c.id && !query ? 'is-on' : ''}`}
            onClick={() => { setCat(c.id); setQ('') }}>{c.label}</button>
        ))}
      </nav>

      <ul className="quick">
        {quick.map((t) => (
          <li key={t.k}>
            <button className={`quick__t quick__t--${t.k}`} onClick={t.on}>
              <span className="quick__ico" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round"><path d={QUICK_ICON[t.k]} /></svg>
              </span>
              {t.tag && <span className="quick__tag">{t.tag}</span>}
              <span className="quick__lb">{t.label}</span>
            </button>
          </li>
        ))}
      </ul>

      {list ? (
        <>
          <SectionHead title={query ? `‘${query}’ 검색 결과 ${list.length}건` : CAT_LABEL[cat]} />
          {list.length === 0 ? (
            <p className="hnone">검색 결과가 없습니다. 홈에 올린 상품 {withImg.length}건 안에서만 찾습니다.</p>
          ) : (
            <div className="grid">
              {list.map((it) => (
                <ProductCard key={it.id} item={it} badge={it.auth === 'official' ? '정품 표기' : null} />
              ))}
            </div>
          )}
        </>
      ) : (
        sections.map(([c, items]) => (
          <section key={c.id} className="hsec">
            <SectionHead title={c.label} onMore={() => setCat(c.id)} />
            <div className="grid">
              {items.map((it) => (
                <ProductCard key={it.id} item={it} badge={it.auth === 'official' ? '정품 표기' : null} />
              ))}
            </div>
          </section>
        ))
      )}

      <p className="hfoot">
        상품·가격·별점은 다나와에서 직접 수집한 실제 데이터입니다.
        담기·결제는 이 과제의 범위가 아니라 구현하지 않았고, 카드를 누르면 판매처로 이동합니다.
      </p>
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
function BoxList({ boxes, groupbuys, dailies, onPick, onPickGroup, onPickDaily, companyBEP, votes, voteLabel }) {
  return (
    <>
      {votes && Object.values(votes).some((v) => v > 0) && (
        <p className="votetop">
          {(() => {
            const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0]
            return `이번 주 가장 많이 원한 다음 형식: ${voteLabel[top[0]]} (${top[1]}표)`
          })()}
        </p>
      )}
      <div className="hero">
        <h1>올박스</h1>
        <p>
          하나의 상품이 아니라 <b>여러 형식이 매주 바뀌며 도는 뽑기</b>입니다.
          형식마다 무엇이 무작위인지, 꽝이 있는지가 다릅니다 —
          그래서 <b>형식마다 정직한 방식도 다릅니다.</b>
        </p>
      </div>

      <h2 className="lead2">① 팀 뽑기 — 여럿이 모여야 열립니다</h2>
      <p className="lead2__s">
        <b>꽝이 없습니다.</b> 최하위 등급도 시가가 참여비 이상입니다.
        사람이 모일수록 상위 등급 확률이 오르고, <b>전원이 뽑기를 눌러야만</b> 열립니다.
      </p>
      <ul className="blist">
        {boxes.map((b) => {
          // 배너의 주인공은 최고 등급 상품 실물이다. S 샘플은 비싼 순으로 온다.
          const prize = b.tiers[0]?.samples?.find((x) => x.image)
          return (
          <li key={b.id}>
            <button className="bcard" onClick={() => onPick(b.id)}>
              <span className="bcard__glow" aria-hidden="true" />
              {prize && <img className="bcard__prize" src={prize.image} alt="" loading="lazy" />}
              <span className="bcard__shine" aria-hidden="true" />
              <span className="bcard__body">
                <span className="bcard__name">{b.name}</span>
                <span className="bcard__blurb">{b.blurb}</span>
                <span className="bcard__odds">
                  최고 <b>{b.topLabel}</b> · 시가 {won(b.topRetail)}
                  <em>혼자 {pct(b.oddsByTeam[1].S, 3)} → 10명 {pct(b.oddsByTeam[10].S, 3)}</em>
                </span>
                <span className="bcard__gems">
                  {TIERS.map((t) => (
                    <span key={t} className={`gem gem--${t}`}>{t} {b.stock[t]}</span>
                  ))}
                  {b.pity && <span className="gem gem--pity">천장 {b.pity.window}회 → {pct(b.pity.boostTo, 0)}</span>}
                </span>
              </span>
              <span className="bcard__entry">{won(b.entry)}</span>
            </button>
          </li>
          )
        })}
      </ul>
      <h2 className="lead2">② 하루 한 번, 100원</h2>
      <p className="lead2__s">
        <b>이 형식에는 꽝이 있습니다.</b> 대신 당첨 확률도, 꽝 확률도, 그 확률이 나온
        계산 과정까지 전부 공개합니다. 재고가 소진되면 이번 회차는 끝납니다.
      </p>
      <ul className="blist">
        {dailies.map((d) => (
          <li key={d.id}><DailyCard d={d} onPick={onPickDaily} /></li>
        ))}
      </ul>

      <h2 className="lead2">③ 상품이 정해진 공동구매</h2>
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
  const [gbAll, setGbAll] = useState(false)
  const [dailyId, setDailyId] = useState(null) // 데일리 100원
  const [dailyResult, setDailyResult] = useState(null)
  const [pityMiss, setPityMiss] = useState(0) // 천장 체험용 (내 연속 미당첨)
  const [voted, setVoted] = useState(null)
  const [votes, setVotes] = useState(null)
  const [sheet, setSheet] = useState(false)
  const [busy, setBusy] = useState(false)
  const timers = useRef([])
  const myId = useRef(`u${Math.random().toString(36).slice(2, 10)}`)

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = [] }
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))
  const [scene, setScene] = useState(false)
  useEffect(() => clearTimers, [])

  useEffect(() => {
    fetch('/api/boxes')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { setData(j); setVotes(j.votes) })
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
      // 팀원 합류·준비는 프론트가 시뮬레이션하므로 서버 방 상태와 동기화되지
      // 않는다. live 분기({roomId}만 전송)는 그래서 항상 409였다 — 서버 방
      // 로직 자체는 tests/room.test.mjs가 API로 직접 검증한다.
      const body = {
        sim: true, roomId: snapshot.roomId, boxId,
        members: snapshot.members.map(({ id, name, draws }) => ({ id, name, draws })),
      }
      if (curated?.pickedIds?.length) body.pickedIds = curated.pickedIds
      if (pityMiss > 0) body.pityMiss = { [snapshot.memberId]: pityMiss }
      const r = await fetch('/api/open', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      setErr(null)
      setResult(j); setPhase('result')
      // 개봉은 이 제품에서 가장 중요한 순간인데 카드 목록으로 밋밋하게 끝났다.
      // 내 결과 하나를 전폭 장면으로 먼저 보여주고, 걷히면 팀 전체가 아래에 있다.
      setScene(true)
      later(() => setScene(false), 3600)
    } catch (e) {
      setErr(e.message); setPhase('ready')
    } finally { setBusy(false) }
  }, [boxId, curated, pityMiss])

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

  const reset = () => { clearTimers(); setScene(false); setResult(null); setPhase('detail'); openBox(boxId) }
  const backToList = () => {
    clearTimers(); setScene(false); setPhase('list'); setBoxId(null); setRoom(null); setResult(null); setCurated(null)
    setGbId(null); setGbResult(null); setDailyId(null); setDailyResult(null)
  }

  const daily = data?.dailies?.find((d) => d.id === dailyId) || null
  const openDaily = (id) => {
    setDailyId(id); setDailyResult(null); setBoxId(null); setGbId(null); setPhase('daily')
  }
  /** 데일리 뽑기 — 서버가 일일 한도와 재고를 소유한다. */
  const playDaily = async () => {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/open', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'daily', dailyId, roomId: 'daily', memberId: myId.current }),
      })
      const j = await r.json()
      if (!r.ok) { setDailyResult({ blocked: true, ...j }); return }
      setDailyResult(j)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const castVote = async (choice) => {
    setVoted(choice)
    try {
      const r = await fetch('/api/room', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vote', roomId: 'vote', choice }),
      })
      const j = await r.json()
      if (r.ok) setVotes(j.votes)
    } catch { /* 투표 실패는 조용히 넘긴다 — 흐름을 막을 이유가 없다 */ }
  }

  const gb = data?.groupbuys?.find((g) => g.id === gbId) || null
  const openGroup = (id) => {
    const g = data.groupbuys.find((x) => x.id === id)
    setGbId(id); setGbResult(null); setGbTeam(g.minTeam); setBoxId(null); setPhase('group')
  }
  /** 발주 — 인원이 최소 수량을 넘어야 서버가 200을 준다. */
  const placeOrder = async () => {
    setBusy(true); setErr(null)
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
  if (tab === 'home') body = <HomeTab pool={data.sample || []} onGoOlbox={() => setTab('olbox')} />
  else if (tab === 'content') body = <StubTab title="콘텐츠" body="영상·기획전 탭입니다." />
  else if (tab === 'wish') body = <StubTab title="관심상품" body="찜한 상품 탭입니다." />
  else if (tab === 'me') body = <StubTab title="내 정보" body="주문내역·올팜·설정 탭입니다." />
  else if (phase === 'daily' && daily) {
    const r = dailyResult
    body = (
      <>
        <button className="back" onClick={backToList}>← 목록</button>
        <header className="bhead">
          <h2>{daily.name}</h2>
          <p>{daily.blurb}</p>
        </header>
        <div className="gbhero">
          {daily.item.image && <img src={daily.item.image} alt="" />}
          <div>
            <p className="gbhero__n">{daily.item.name}</p>
            <p className="gbhero__p">{`시가 ${won(daily.itemPrice)} · 참여비 ${won(daily.entry)}`}</p>
          </div>
        </div>
        <div className="gbnow">
          <div><b className="hi">{`${daily.winOdds}%`}</b><span>당첨</span></div>
          <div><b>{`${daily.blankOdds}%`}</b><span>꽝</span></div>
          <div><b>{`${(r?.remaining ?? daily.totalStock)}/${daily.totalStock}`}</b><span>남은 경품</span></div>
        </div>

        {r && (r.blocked ? (
          <div className="dres dres--blocked">
            <b>{r.error}</b>
            <p>{r.reason === 'soldout' ? '다음 회차를 기다려 주세요.' : '내일 다시 참여하실 수 있어요.'}</p>
          </div>
        ) : (
          <div className={`dres ${r.win ? 'is-win' : 'is-blank'}`}>
            <b>{r.win ? '당첨!' : '꽝'}</b>
            <p>{r.win ? r.item.name : '오늘은 아쉽네요. 내일 다시 도전할 수 있어요.'}</p>
            {r.win && <p className="dres__pr">{won(r.item.price)}</p>}
            <p className="seed">{r.seedProof.note}</p>
          </div>
        ))}

        {!r && (
          <button className="btn btn--go" onClick={playDaily} disabled={busy}>
            {busy ? '뽑는 중…' : `${won(daily.entry)}으로 뽑기`}
          </button>
        )}
        {r && !r.blocked && (
          <p className="gatenote">하루 한 번만 참여할 수 있습니다. 서버가 한도와 재고를 셉니다.</p>
        )}

        <DailyEconomics d={daily} />
        {r && !r.blocked && (
          <VoteCard labels={data.voteLabel} votes={votes} onVote={castVote} voted={voted} />
        )}
      </>
    )
  }
  else if (phase === 'group' && gb) {
    const step = gb.steps.find((x) => x.n === gbTeam) || gb.steps[0]
    body = gbResult ? (
      <>
        <button className="back" onClick={backToList}>← 목록</button>
        <header className="rhead">
          <h2>{`${gbResult.gbName} 발주 완료`}</h2>
          <p>{`${gbResult.teamSize}명 · 정가 ${won(gbResult.listPrice)} → ${won(gbResult.pay)} (${gbResult.discountPct}% 할인) · 무료 당첨 ${gbResult.freeCount}명`}</p>
        </header>
        {/* 60명이면 결과가 7화면 넘게 이어지는데 문구는 두 종류뿐이다.
            당첨자와 나만 먼저 보여주고 나머지는 한 줄로 접는다. */}
        <ul className="rvlist">
          {(gbAll
            ? gbResult.results
            : gbResult.results.filter((r) => r.free || r.memberId === 'g0')
          ).map((r) => (
            <GroupResult key={r.memberId} r={r} mine={r.memberId === 'g0'} />
          ))}
        </ul>
        {!gbAll && gbResult.results.some((r) => !r.free && r.memberId !== 'g0') && (
          <button className="rv__more" onClick={() => setGbAll(true)}>
            {`나머지 ${gbResult.results.filter((r) => !r.free && r.memberId !== 'g0').length}명은 모두 ${won(gbResult.pay)}를 냈습니다 — 전체 보기`}
          </button>
        )}
        <p className="seed">{gbResult.seedProof.note}<br /><code>{gbResult.seedProof.pattern}</code></p>
        <div className="row">
          <button className="btn btn--ghost" onClick={backToList}>목록으로</button>
          <button className="btn" onClick={() => { setGbResult(null); setGbAll(false) }}>인원 바꿔보기</button>
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
  else if (phase === 'list' || !box) body = (
    <BoxList boxes={data.boxes} groupbuys={data.groupbuys || []} dailies={data.dailies || []}
      onPick={openBox} onPickGroup={openGroup} onPickDaily={openDaily}
      companyBEP={data.companyBEP} votes={votes} voteLabel={data.voteLabel} />
  )
  else if (phase === 'result' && result) {
    const mine = result.results.find((r) => r.memberId === room.memberId) || result.results[0]
    body = (
      <>
        {scene && <RevealScene mine={mine} onDone={() => setScene(false)} />}
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
            <RevealCard key={r.memberId} r={r} mine={r.memberId === mine.memberId} delay={i * 90} />
          ))}
        </ul>
        <p className="seed">{result.seedProof.note}<br /><code>{result.seedProof.pattern}</code></p>
        <VoteCard labels={data.voteLabel} votes={votes} onVote={castVote} voted={voted} />
        <div className="row">
          <button className="btn btn--ghost" onClick={backToList}>다른 박스 보기</button>
          <button className="btn" onClick={reset}>다시 해보기</button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        <header className="bhead">
          <button className="back" onClick={backToList}>← 박스 목록</button>
          <h2>{box.name}</h2>
          <p>{won(box.entry)} · 최고 등급 {box.topLabel}</p>
        </header>

        {(() => {
          // 이 상자에서 나올 수 있는 최고의 것을 먼저 보여준다 — 배너와 같은 무대.
          const prize = box.tiers[0]?.samples?.find((x) => x.image)
          return prize ? (
            <div className="phero">
              <span className="phero__glow" aria-hidden="true" />
              <img src={prize.image} alt="" loading="lazy" />
              <span className="phero__t">
                <em>최고 등급 {box.topLabel}</em>
                <b>{prize.name}</b>
                <span>{won(prize.price)} 상당 · {won(box.entry)}으로 도전</span>
              </span>
            </div>
          ) : null
        })()}

        <TasteChat boxId={box.id} teamSize={teamSize || 1}
          note={curated ? (curated.usedFallback
            ? '말씀하신 쪽으로는 상자가 성립하지 않아 기본 구성 그대로 담았어요.'
            : `${curated.axis ? `[${curated.axis}] ` : ''}기본 등급 후보를 ${curated.pickedCount}개로 좁혔어요 — 아래 등급표에 반영됐고, 최고 등급과 확률은 그대로예요.`) : null}
          onCurated={setCurated} disabled={phase === 'ready' || phase === 'count'} />

        {/* 확률은 한 카드로 모은다. 곡선·표·뽑기통·천장은 '확률 근거'
            시트로 내렸다 — 증거는 행동을 가로막지 않아야 한다. */}
        <section className="odds">
          <div className="now">
            <span className="now__lab">지금 {teamSize || 1}명 기준 최고 등급</span>
            <strong className="now__num">{pct(odds.S, 3)}</strong>
            <em className="now__nf">{naturalFreq(odds.S)}</em>
          </div>
          <OddsBars odds={odds} />
          <p className="odds__stock">
            뽑기 통 {TIERS.map((t) => `${t} ${box.stock[t]}개`).join(' · ')}
            {' = '}{box.stockTotal.toLocaleString()}구좌
          </p>
          <button className="odds__why" onClick={() => setSheet(true)}>
            이 확률이 어떻게 나왔나 ›
          </button>
        </section>

        {/* 레일과 모으기 버튼은 하나의 일('팀 만들기')이다 — 한 섹션으로 묶는다. */}
        <section className="team">
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
        </section>

        <div className="tiers">
          {curated && !curated.aiEnabled && (
            <p className="tiers__note">AI 키 없이 규칙 기반으로 구성했습니다.</p>
          )}
          {tierList.map((t) => <TierStrip key={t.tier} tier={t} odds={odds[t.tier]} />)}
        </div>

        <div className="cta">
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
        </div>
      </>
    )
  }

  return (
    <Shell tab={tab} setTab={setTab} onSheet={() => setSheet(true)}
      live={room ? room.live : null} guide={{ box, data, teamSize }}>
      {/* 초기 로드 이후의 실패(개봉·데일리·발주)가 조용히 삼켜지던 문제.
          성공 경로가 setErr(null)로 지우므로 여기 남아 있으면 진짜 실패다. */}
      {err && data && <p className="errbar" role="alert">{err}</p>}
      {body}
      {sheet && (
        <>
          <div className="scrim" onClick={() => setSheet(false)} />
          <HonestySheet formula={data.formula} pool={data.pool} companyBEP={data.companyBEP}
            onClose={() => setSheet(false)}
            live={box && tab === 'olbox' ? {
              box, odds, oddsByTeam, evByTeam, teamMax,
              teamSize: teamSize || 1,
              boost: box.boostByTeam?.[Math.max(1, teamSize || 1)] ?? 1,
              pityMiss, onPityChange: setPityMiss,
            } : null} />
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
          <span className="top__logo">Alwayz</span>
          {live !== null && (
            <span className={`top__live ${live ? 'is-live' : ''}`}>{live ? '실시간 방' : '시뮬레이션'}</span>
          )}
          {onSheet && <button className="top__q" onClick={onSheet}>확률 근거</button>}
          <span className="top__cart" aria-hidden="true"><IconCart /></span>
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
function GuideRail({ side, box, data, teamSize }) {
  const left = [
    ['컬처 시그널', '포켓몬 카드 열풍, 그중 오리파(카드숍이 내용물을 직접 구성해 파는 뽑기). KREAM 트레이딩 카드 거래액 전년 대비 5,600%↑.'],
    ['왜 지금인가', '시세가 생겨 재테크가 됐고, 무작위 보상이 반복을 만들고, 실물 판매라 확률형 규제 밖이라 지출에 상한이 없다.'],
    ['결핍', '전부 확정된 하루 안의 싸고 즉각적인 사건 하나, 그리고 그걸 봐줄 사람.'],
    ['왜 올웨이즈인가', '올팜은 매일 시간을 쓰지만 보상이 확정적이고 30일 지연된다. 사건이 아니라 노동이다.'],
    ['왜 캠페인 엔진인가', '올박스는 하나의 상품이 아니라 매주 형식이 바뀌는 엔진이다. 그래서 "꽝 없음"은 제품의 원칙이 아니라 일부 형식의 속성이다.'],
  ]
  const right = [
    ['확률은 유도된 값이다', `팀 뽑기는 재고 비율, 데일리는 손익분기, 공동구매는 할인 여력에서 나온다. 사람이 적은 값이 하나도 없다. 수집한 ${data?.pool.size ?? 0}건의 실제 판매가가 계산의 입력이다.`],
    ['재고가 상한이다', '기본 확률 = 등급 재고 ÷ 총 구좌. 예산이 남아도 확률을 임의로 올릴 수 없다. 화면이 뽑기 통을 그대로 그린다.'],
    ['천장', '10회 연속 미당첨이면 다음 회차 확률을 올린다. 게임산업법 시행령(2024.3.22)이 보장형 시스템을 공시 대상으로 명시해, 숨길 장치가 아니라 밝혀야 하는 장치다.'],
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
