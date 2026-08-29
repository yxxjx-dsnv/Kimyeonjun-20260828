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
  won, pct, naturalFreq, Delta, TIERS, ProductCard, OddsBars, OddsCurve, OddsTable,
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
            <p className="hnone">검색 결과가 없어요</p>
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
function BoxList({ boxes, groupbuys, dailies, raffles, saveups, onPick, onPickGroup, onPickDaily, onPickRaffle, onPickSaveup, votes, voteLabel }) {
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
      {/* 무료배송 띠 — 실제 올웨이즈 홈 배너 문법. '무료'는 가격 0이 아니라
          별도의 감정 반응을 만든다(zero-price effect, Shampanier·Mazar·Ariely 2007). */}
      <p className="freebar">올박스도 <b>전 상품 무료배송</b></p>

      <div className="hero">
        <h1>올박스</h1>
        <p>매주 바뀌는 상자, 이번 주는 <b>포켓몬 카드</b>예요.</p>
      </div>

      {/* '꽝 없음'을 선언문으로 설명하지 않는다 — 커머스 카피는 혜택을 말한다.
          함께 열면 오르는 확률은 사회적 증거이자 초대 동기(Cialdini 2009). */}
      <h2 className="lead2">친구랑 열수록 확률 UP</h2>
      <p className="lead2__s">
        뭐가 나와도 참여비보다 비싼 상품이에요. 최대 10명, 다 모이면 바로 열려요.
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
                  <em>{`10명이 모이면 확률 ×${(b.boostByTeam?.[10] ?? 1).toFixed(1)}`}</em>
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
      {/* 100원: 지불 고통이 거의 없는 소액(pain of paying, Prelec·Loewenstein 1998).
          꽝 존재는 카드에서 배지로 밝힌다 — 문단으로 설교하지 않는다. */}
      <h2 className="lead2">하루 한 번, 100원의 행운</h2>
      <p className="lead2__s">오늘의 상품이 매일 바뀌어요. 재고 소진 시 마감!</p>
      <ul className="blist">
        {dailies.map((d) => (
          <li key={d.id}><DailyCard d={d} onPick={onPickDaily} /></li>
        ))}
      </ul>

      {/* ④ 래플 — 선착순 대신 추첨. 응모가 무료라 낙첨 손실이 0이다.
          (배분 공정성: 봇·오픈런이 이기는 선착순의 대안 — SNKRS·무신사 선례) */}
      <h2 className="lead2">0원 응모 래플</h2>
      <p className="lead2__s">선착순 대신 추첨으로 드려요. 응모는 무료, 낙첨해도 잃는 게 없어요.</p>
      <ul className="blist">
        {(raffles || []).map((r) => (
          <li key={r.id}>
            <button className="card gbcard" onClick={() => onPickRaffle(r.id)}>
              <span className="gbcard__row">
                {r.item.image && <img className="gbcard__thumb" src={r.item.image} alt="" loading="lazy" />}
                <span className="gbcard__b">
                  <span className="gbcard__tag gbcard__tag--rf">무료 응모</span>
                  <span className="gbcard__name">{r.name}</span>
                  <span className="gbcard__it">{r.item.name}</span>
                  <span className="gbcard__odds">
                    <s>{won(r.listPrice)}</s> → <b>{won(r.rafflePrice)}</b>{` (${r.discountPct}%↓) · ${r.stock}개 한정`}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* ⑤ 무손실 적금 — 이자 풀만 추첨, 원금 보존 (Premium Bonds 방식) */}
      <h2 className="lead2">잃지 않는 적금</h2>
      <p className="lead2__s">이자만 모아 매주 추첨해요. 꽝이어도 <b>원금은 100% 그대로</b>.</p>
      <ul className="blist">
        {(saveups || []).map((s) => (
          <li key={s.id}>
            <button className="card gbcard" onClick={() => onPickSaveup(s.id)}>
              <span className="gbcard__row">
                <span className="svcoin" aria-hidden="true">₩</span>
                <span className="gbcard__b">
                  <span className="gbcard__tag gbcard__tag--sv">원금 보장</span>
                  <span className="gbcard__name">{s.name}</span>
                  <span className="gbcard__it">{`지금 ${s.members.toLocaleString()}명이 ${won(s.total)} 모았어요`}</span>
                  <span className="gbcard__odds">{`이번 주 상금 ${won(s.prize)}`}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <h2 className="lead2">모일수록 싸지는 팀구매</h2>
      <p className="lead2__s">받을 상품은 그대로, 가격만 내려가요. 몇 명은 <b>0원</b>에 받아요.</p>
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
    setRaffleId(null); setRfEnter(null); setRfResult(null)
    setSaveupId(null); setSvState(null); setSvResult(null)
  }

  const daily = data?.dailies?.find((d) => d.id === dailyId) || null
  const openDaily = (id) => {
    setDailyId(id); setDailyResult(null); setBoxId(null); setGbId(null); setPhase('daily')
  }

  /* ── ④ 래플 ── */
  const [raffleId, setRaffleId] = useState(null)
  const [rfEnter, setRfEnter] = useState(null)   // 응모 결과(내 번호·현황)
  const [rfResult, setRfResult] = useState(null) // 추첨 결과
  const raffle = data?.raffles?.find((r) => r.id === raffleId) || null
  const openRaffle = (id) => {
    setRaffleId(id); setRfEnter(null); setRfResult(null)
    setBoxId(null); setGbId(null); setDailyId(null); setPhase('raffle')
  }
  const callRaffle = async (action) => {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/open', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'raffle', raffleId, action, memberId: myId.current, myIndex: rfEnter?.myIndex }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      if (action === 'enter') setRfEnter(j)
      else setRfResult(j)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  /* ── ⑤ 무손실 적금 ── */
  const [saveupId, setSaveupId] = useState(null)
  const [svState, setSvState] = useState(null)   // 내 적립·풀·상금·확률
  const [svResult, setSvResult] = useState(null)
  const saveup = data?.saveups?.find((s) => s.id === saveupId) || null
  const openSaveup = (id) => {
    setSaveupId(id); setSvState(null); setSvResult(null)
    setBoxId(null); setGbId(null); setDailyId(null); setPhase('saveup')
  }
  const callSaveup = async (action, amount) => {
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/open', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'saveup', saveupId, action, amount, memberId: myId.current }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      if (action === 'deposit') { setSvState(j); setSvResult(null) }
      else setSvResult(j)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
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
            <p className="seed">결과는 저장되며 변경되지 않아요</p>
          </div>
        ))}

        {!r && (
          <button className="btn btn--go" onClick={playDaily} disabled={busy}>
            {busy ? '뽑는 중…' : `${won(daily.entry)}으로 뽑기`}
          </button>
        )}
        {r && !r.blocked && (
          <p className="gatenote">내일 다시 참여할 수 있어요</p>
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
        <p className="seed">당첨자는 마감 시점에 확정돼요</p>
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
  else if (phase === 'raffle' && raffle) {
    const live = rfResult || rfEnter || raffle
    body = (
      <>
        <button className="back" onClick={backToList}>← 목록</button>
        <header className="bhead">
          <h2>{raffle.name}</h2>
          <p>응모 무료 · {raffle.stock}개 한정 특가</p>
        </header>
        <div className="gbhero">
          {raffle.item.image && <img src={raffle.item.image} alt="" />}
          <div>
            <p className="gbhero__nm">{raffle.item.name}</p>
            <p className="gbhero__pr">
              <s>{won(raffle.listPrice)}</s> <b>{won(raffle.rafflePrice)}</b>
              <em>{` ${raffle.discountPct}%↓`}</em>
            </p>
          </div>
        </div>
        <div className="gbnow">
          <div><b>{live.entrants ?? raffle.entrants}명</b><span>지금까지 응모</span></div>
          <div><b>{raffle.stock}개</b><span>당첨 수량</span></div>
          <div className="hi"><b>{(live.odds ?? raffle.odds)}%</b><span>지금 당첨 확률</span></div>
        </div>

        {rfResult ? (
          <div className={`dres ${rfResult.win ? 'is-win' : 'is-blank'}`}>
            <b>{rfResult.win ? '당첨!' : '아쉽지만 다음 기회에'}</b>
            <p>
              {rfResult.win
                ? `${won(rfResult.rafflePrice)}에 구매할 수 있어요 — ${won(rfResult.listPrice - rfResult.rafflePrice)} 아꼈어요`
                : '응모는 무료였으니 잃은 건 0원이에요. 내일 또 응모할 수 있어요.'}
            </p>
            <p className="seed">추첨 결과는 저장되며 변경되지 않아요</p>
          </div>
        ) : rfEnter ? (
          <>
            <p className="gatenote">{`응모 완료! 내 응모 번호는 ${rfEnter.myIndex}번이에요`}</p>
            <button className="btn btn--go" onClick={() => callRaffle('draw')} disabled={busy}>
              추첨 결과 보기
            </button>
          </>
        ) : (
          <button className="btn btn--go" onClick={() => callRaffle('enter')} disabled={busy}>
            무료로 응모하기
          </button>
        )}

        <details className="deco">
          <summary>확률 안내 및 유의사항</summary>
          <ul className="deco__ul">
            <li>{`당첨 확률 = 수량 ${raffle.stock}개 ÷ 응모자 수 (응모가 늘면 내려가요)`}</li>
            <li>1인 1일 1회 응모할 수 있어요</li>
            <li>응모는 무료 — 낙첨해도 잃는 것이 없어요</li>
            <li>선착순이 아니라 추첨이라 새로고침 경쟁이 필요 없어요</li>
          </ul>
        </details>
      </>
    )
  }
  else if (phase === 'saveup' && saveup) {
    const my = svState?.my ?? 0
    const total = svState?.total ?? saveup.total
    const prize = svState?.prize ?? saveup.prize
    body = (
      <>
        <button className="back" onClick={backToList}>← 목록</button>
        <header className="bhead">
          <h2>{saveup.name}</h2>
          <p>이자만 모아 추첨 · 원금은 언제나 100%</p>
        </header>
        <div className="gbnow">
          <div><b>{won(my)}</b><span>내 적립</span></div>
          <div><b>{won(total)}</b><span>{`${saveup.members.toLocaleString()}명이 모은 돈`}</span></div>
          <div className="hi"><b>{won(prize)}</b><span>이번 주 상금</span></div>
        </div>
        <p className="gatenote">
          {my > 0
            ? `지금 내 당첨 확률 ${svState.odds}% — 적립할수록 올라가요`
            : '1,000원 = 응모권 1장이에요'}
        </p>
        <div className="draws">
          <span>적립하기</span>
          {[1000, 5000, 10000].map((a) => (
            <button key={a} className="chip" disabled={busy || my + a > saveup.myMax}
              onClick={() => callSaveup('deposit', a)}>{`+${a.toLocaleString()}`}</button>
          ))}
          <em>데모라 실제 결제는 없어요</em>
        </div>

        {svResult ? (
          <div className={`dres ${svResult.win ? 'is-win' : 'is-blank'}`}>
            <b>{svResult.win ? `축하해요! ${won(svResult.prize)} 당첨` : '이번 주는 아쉽네요'}</b>
            <p>
              {svResult.win
                ? `원금 ${won(svResult.settle.refund)}에 상금까지 함께 받아요`
                : `원금 ${won(svResult.settle.refund)}은 그대로예요 — 다음 주 추첨에 자동 응모돼요`}
            </p>
            <p className="seed">추첨 결과는 저장되며 변경되지 않아요</p>
          </div>
        ) : (
          <button className="btn btn--go" onClick={() => callSaveup('draw')} disabled={busy || my <= 0}>
            이번 주 추첨 보기
          </button>
        )}

        <details className="deco">
          <summary>확률 안내 및 유의사항</summary>
          <ul className="deco__ul">
            <li>{`상금 = 전체 적립액 × 연 ${(saveup.apr * 100).toFixed(0)}% ÷ 52주 (이자만 모아요)`}</li>
            <li>당첨 확률 = 내 적립 ÷ 전체 적립 (1,000원 = 1장)</li>
            <li><b>낙첨해도 원금은 100% 돌려받아요</b></li>
            <li>영국 Premium Bonds(1956~)와 같은 방식이에요</li>
          </ul>
        </details>
      </>
    )
  }
  else if (phase === 'list' || !box) body = (
    <BoxList boxes={data.boxes} groupbuys={data.groupbuys || []} dailies={data.dailies || []}
      raffles={data.raffles || []} saveups={data.saveups || []}
      onPick={openBox} onPickGroup={openGroup} onPickDaily={openDaily}
      onPickRaffle={openRaffle} onPickSaveup={openSaveup}
      votes={votes} voteLabel={data.voteLabel} />
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
        {/* 결과 불변 안내 — 유저에게 필요한 건 '바뀌지 않는다'는 사실 하나다.
            시드 패턴 같은 구현 세부는 화면에 싣지 않는다. */}
        <p className="seed">추첨 결과는 저장되며 변경되지 않아요</p>
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
            <span className="now__lab">지금 나의 S등급 확률</span>
            <strong className="now__num">{pct(odds.S, 3)}</strong>
            {/* 백분율만 쓰면 낮은 확률이 과대평가된다 — 자연빈도 병기
                (Gigerenzer·Hoffrage 1995). 확률 공시는 게임산업법 시행령이
                요구하는 것이기도 하다. 전면에 크게가 아니라 여기 한 줄. */}
            <em className="now__nf">{naturalFreq(odds.S)}</em>
          </div>
          <OddsBars odds={odds} />
          {/* 남은 수량 노출 — 희소성 신호(Worchel·Lee·Adewole 1975) */}
          <p className="odds__stock">
            남은 상품 {TIERS.map((t) => `${t} ${box.stock[t]}`).join(' · ')} · 총 {box.stockTotal.toLocaleString()}개
          </p>
          <button className="odds__why" onClick={() => setSheet(true)}>
            확률 안내 및 유의사항 ›
          </button>
        </section>

        {/* 레일과 모으기 버튼은 하나의 일('팀 만들기')이다 — 한 섹션으로 묶는다. */}
        <section className="team">
        <MemberRail members={members} teamMax={teamMax} readyCount={readyCount}
          phase={phase === 'ready' || phase === 'count' ? 'ready' : 'gather'} />

        {phase !== 'count' && (
          <div className="acts">
            <button className="btn btn--ghost" onClick={() => navigator.clipboard?.writeText(inviteUrl)}>
              친구 초대
            </button>
            {/* 데모에서 혼자 체험할 수 있도록 다른 참여자 합류를 시뮬레이션한다.
                실서비스 언어로는 '매칭'이다. */}
            <button className="btn btn--ghost" onClick={addOne} disabled={teamSize >= teamMax}>
              +1명 매칭
            </button>
            <button className="btn btn--ghost" onClick={fillTeam} disabled={teamSize >= teamMax}>
              바로 {teamMax}명 매칭
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
            <em>여러 장 뽑으면 <b>모두의</b> 확률이 함께 올라요</em>
          </div>
        )}

        {phase === 'count' ? (
          <div className="count"><span>{count}</span><p>전원 준비 완료</p></div>
        ) : (
          <button className="btn btn--go" onClick={pressDraw}
            disabled={busy || phase === 'ready' || teamSize < 1}>
            {phase === 'ready'
              ? `${readyCount}/${teamSize}명 준비 완료 · 곧 열려요`
              : `${won(box.entry)}으로 뽑기`}
          </button>
        )}
        {phase === 'ready' && (
          <p className="gatenote">모두 준비되면 자동으로 열려요</p>
        )}
        </div>
      </>
    )
  }

  return (
    <Shell tab={tab} setTab={setTab} pool={data.pool}
      ops={tab === 'olbox' ? (
        <OpsRail box={box} teamSize={teamSize} odds={odds} oddsByTeam={oddsByTeam}
          evByTeam={evByTeam} teamMax={teamMax} gb={gb} gbTeam={gbTeam} daily={daily}
          rf={raffle ? { ...raffle, ...(rfResult || rfEnter || {}) } : null}
          sv={saveup ? { ...saveup, ...(svResult || svState || {}) } : null} />
      ) : null}>
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

/* ── 좌측 배경 레일 (데스크톱) ────────────────────────────────
   폰 셸이 448px이라 넓은 화면에서 양옆이 빈다. 그 자리를 설명에 쓴다.
   왼쪽은 '무엇을 왜 만들었나', 오른쪽은 '지금 화면의 실시간 수치와 근거'.
   채용 담당자가 한 번 훑고 이해할 분량으로만 적는다. */
function BriefRail({ pool }) {
  return (
    <aside className="brief" aria-label="과제 설명">
      <p className="brief__tag">레브잇 올웨이즈 직무 과제</p>
      <h2 className="brief__h">올박스 — 팀으로 여는 확률형 구매</h2>
      <p className="brief__lead">
        올웨이즈의 <b>팀구매</b> 위에 <b>확률</b>을 얹었습니다.
        혼자 사면 정가, 여럿이 모이면 좋은 게 나올 확률이 오릅니다.
      </p>

      <section className="brief__sec">
        <h3>컬처 시그널</h3>
        <p className="brief__p">
          <b>포켓몬 카드 · 오리파</b>. 카드숍이 내용물을 직접 구성해 파는 뽑기가
          수십만 원대에 유통되는데, <b>실물 판매라 확률 공시 의무가 없습니다.</b>
        </p>
      </section>

      <section className="brief__sec">
        <h3>풀려는 문제</h3>
        <ul>
          <li>확률형은 <b>꽝이면 돈을 버린다</b> — 혜택에 민감한 올웨이즈 고객이 못 산다</li>
          <li>팀구매 초대가 <b>&ldquo;너도 싸게 사&rdquo;라는 부탁</b>이라 미안하다</li>
          <li>올팜은 매일 시간을 쓰는데 보상이 <b>확정적이고 30일 지연</b>된다</li>
        </ul>
      </section>

      <section className="brief__sec">
        <h3>쓰는 데이터</h3>
        <p className="brief__p">
          다나와에서 직접 수집한 <b>{(pool?.size ?? 0).toLocaleString()}건</b>
          (검색어 {pool?.queries ?? 0}개). 상품·가격·별점·리뷰·스펙을 화면과
          AI 큐레이션에 그대로 씁니다.
        </p>
        <p className="brief__dim">
          상품 가격이 바뀌면 확률표도 함께 바뀝니다 — 크롤 데이터가 장식이 아니라
          연산의 입력입니다.
        </p>
      </section>

      <section className="brief__sec">
        <h3>다섯 가지 형식</h3>
        <ul>
          <li><b>팀 뽑기</b> — 무엇을 받을지가 확률. 꽝 없음</li>
          <li><b>데일리 100원</b> — 당첨/꽝이 확률. 하루 한 번</li>
          <li><b>래플</b> — 누가 특가에 살지가 확률. 응모 0원</li>
          <li><b>무손실 적금</b> — 누가 이자 상금을 받을지가 확률. 원금 보존</li>
          <li><b>팀구매</b> — 얼마를 낼지가 확률. 몇 명은 0원</li>
        </ul>
        <p className="brief__dim">
          하나의 상품이 아니라 매주 형식이 바뀌는 <b>캠페인 엔진</b>입니다.
        </p>
      </section>

      <p className="brief__note">
        가운데 화면은 <b>실제 유저가 보는 그대로</b>입니다.
        오른쪽은 심사자용 패널로, 유저 화면에는 나오지 않습니다.
      </p>
    </aside>
  )
}

function Shell({ tab, setTab, children, ops, pool }) {
  return (
    <div className="stage">
      <BriefRail pool={pool} />
      <div className="phone">
        <header className="top">
          <span className="top__logo">Alwayz</span>
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
      {ops}
    </div>
  )
}

/* ── 실무자 모니터 (데스크톱 우측) ────────────────────────────
   유저 화면(폰)에서는 확률 세부를 계층 뒤로 내렸다. 대신 심사자·운영자가
   보는 이 패널이 실시간 수치를 전부 노출한다 — 참여자가 늘 때 확률이
   곡선 위에서 어떻게 움직이는지 그대로 보인다. 폰과 같은 서버 값을 쓰므로
   두 화면이 어긋날 수 없다. */
function OpsRail({ box, teamSize, odds, oddsByTeam, evByTeam, teamMax, gb, gbTeam, daily, rf, sv }) {
  const n = Math.max(1, teamSize || 1)
  const idle = !box && !gb && !daily && !rf && !sv
  return (
    <aside className="ops" aria-label="실무자 실시간 지표">
      <p className="ops__tag">OPS · 실무자 화면</p>

      {idle && (
        <>
          <h4 className="ops__h">확률은 형식마다 다른 곳에서 나옵니다</h4>
          <div className="opsw">
            <div className="opsw__name">세 형식, 세 개의 출처</div>
            <p className="opsw__eq">
              팀 뽑기 → 재고 비율 × 부스트<br />
              데일리 → 1 / 손익분기 회수<br />
              팀구매 → 대량 매입 할인 여력<br />
              래플 → 수량 ÷ 응모자<br />
              적금 → 내 적립 ÷ 전체 적립
            </p>
            <p className="opsw__body">
              <b>사람이 손으로 적은 확률이 하나도 없습니다.</b> 전부 서버
              (<code>api/_draw.js</code>)가 크롤 데이터에서 계산하고, 화면은 그 값을
              렌더만 합니다. 상품 가격이 바뀌면 확률표도 함께 바뀝니다.
            </p>
          </div>
          <div className="opsw">
            <div className="opsw__name">이 패널을 만든 이유</div>
            <p className="opsw__body">
              가운데 화면은 <b>실제 유저가 보는 그대로</b>라, 확률 세부를 계층 뒤로
              내렸습니다. 대신 이 패널이 같은 서버 값을 실시간으로 전부 노출합니다 —
              박스를 열면 참여자 수에 따라 확률이 어떻게 움직이는지 곡선 위에서 보입니다.
            </p>
            <p className="opsw__ref">유저 화면에는 나오지 않습니다 · 데스크톱 1180px↑에서만</p>
          </div>
          <p className="ops__row">박스를 선택하면 실시간 지표가 켜집니다</p>
        </>
      )}
      {box && (
        <>
          <h4 className="ops__h">{box.name}</h4>
          <div className="ops__kpis">
            <div><em>참여</em><b>{n}명</b></div>
            <div><em>S 확률</em><b>{pct(odds.S, 3)}</b></div>
            <div><em>부스트</em><b>×{(box.boostByTeam?.[n] ?? 1).toFixed(2)}</b></div>
            <div><em>기대수령</em><b>{evByTeam?.[n] ?? '—'}배</b></div>
          </div>
          <OddsCurve oddsByTeam={oddsByTeam} teamSize={n} customerBEP={box.customerBEP} teamMax={teamMax} />
          <OddsBars odds={odds} />

          {/* 지금 화면의 숫자가 어떤 식에서 나왔는지 그 자리에서 보인다.
              값은 전부 서버(api/_draw.js)가 계산한 것을 렌더만 한 것이다. */}
          <div className="opsw">
            <div className="opsw__name">확률이 나오는 식</div>
            <p className="opsw__eq">
              P(S) = 재고비율 × 부스트<br />
              = {box.stock.S}/{box.stockTotal.toLocaleString()} × {(box.boostByTeam?.[n] ?? 1).toFixed(2)}
              {' = '}<b>{pct(odds.S, 3)}</b>
            </p>
            <p className="opsw__body">
              기본 확률은 <b>뽑기 통 재고 비율 그대로</b>입니다. 재고가 상한이라
              예산이 남아도 확률을 임의로 올릴 수 없습니다.
            </p>
          </div>

          <div className="opsw">
            <div className="opsw__name">부스트는 어디서 나오나</div>
            <p className="opsw__eq">
              부스트(n) = 구매력(n) / 구매력(1)<br />
              구매력(n) = 예산(n) / 원가율(n)
            </p>
            <p className="opsw__body">
              사람이 모이면 실제로 두 가지가 생깁니다 — <b>대량 매입으로 내려가는
              원가</b>(수량할인 임계를 로지스틱으로 평활화)와 <b>팀원 중 신규 유입만큼
              회수되는 고객 획득비</b>. 그만큼만 확률로 돌려줍니다.
              정의상 혼자면 <b>정확히 ×1.00</b>입니다.
            </p>
            <p className="opsw__ref">Bass (1969) 확산모형의 모방 항 · 수량할인 MOQ 임계</p>
          </div>

          <div className="opsw">
            <div className="opsw__name">이 설계의 이점</div>
            <p className="opsw__body">
              초대의 문법이 바뀝니다. 기존 팀구매 초대는 <b>&ldquo;너도 싸게 사&rdquo;라는
              부탁</b>이지만, 여기서는 부르면 <b>내 확률이 실제로 오릅니다</b> —
              바이럴이 인간관계 비용을 쓰지 않습니다. 지금 화면에서
              1명 → {teamMax}명이면 S가 {pct(oddsByTeam[1].S, 3)} → {pct(oddsByTeam[teamMax].S, 3)},
              기대 수령이 {evByTeam?.[1]}배 → {evByTeam?.[teamMax]}배입니다.
            </p>
          </div>

          <p className="ops__row">
            재고 {TIERS.map((t) => `${t} ${box.stock[t]}`).join(' · ')} / {box.stockTotal.toLocaleString()}구좌
          </p>

          <div className="opsw">
            <div className="opsw__name">천장 {box.pity.window}회 → S {pct(box.pity.boostTo, 0)}</div>
            <p className="opsw__body">
              연속 미당첨자를 보호합니다. 재미 장치가 아니라 <b>규제가 공시하라고
              명시한 소비자 보호 장치</b>라 확률표에 조건을 함께 적습니다.
            </p>
            <p className="opsw__ref">게임산업법 시행령(2024.3.22) — 천장(보장)·변동 확률 공시 대상</p>
          </div>

          <OddsTable oddsByTeam={oddsByTeam} evByTeam={evByTeam} teamMax={teamMax} teamSize={n} />
        </>
      )}
      {gb && (
        <>
          <h4 className="ops__h">{gb.name}</h4>
          <div className="ops__kpis">
            <div><em>인원</em><b>{gbTeam}명</b></div>
            <div><em>할인</em><b>{gb.steps.find((s) => s.n === gbTeam)?.discount ?? 0}%</b></div>
            <div><em>무료</em><b>{gb.steps.find((s) => s.n === gbTeam)?.freeCount ?? 0}명</b></div>
            <div><em>무료확률</em><b>{gb.steps.find((s) => s.n === gbTeam)?.freeOdds ?? 0}%</b></div>
          </div>
          <GroupCurve steps={gb.steps} teamSize={gbTeam} />
          <div className="opsw">
            <div className="opsw__name">확률이 가격에만 작동합니다</div>
            <p className="opsw__body">
              상품은 확정입니다. 대량 매입으로 내려간 <b>할인 여력</b>을 전원 할인과
              무료 당첨 인원으로 나눕니다. 안 당첨돼도 <b>정가보다 싸게 산 상품</b>이
              오므로 재산상 손실이 0 — 사행성 요건이 성립하지 않습니다.
            </p>
          </div>
        </>
      )}
      {rf && (
        <>
          <h4 className="ops__h">{rf.name}</h4>
          <div className="ops__kpis">
            <div><em>응모</em><b>{(rf.entrants ?? 0).toLocaleString()}명</b></div>
            <div><em>수량</em><b>{rf.stock}개</b></div>
            <div><em>당첨확률</em><b>{rf.odds}%</b></div>
            <div><em>할인</em><b>{rf.discountPct}%</b></div>
          </div>
          <div className="opsw">
            <div className="opsw__name">확률이 나오는 식</div>
            <p className="opsw__eq">
              P(당첨) = 수량 ÷ 응모자<br />
              = {rf.stock} ÷ {Math.max(1, rf.entrants ?? 1).toLocaleString()}
              {' = '}<b>{rf.odds}%</b>
            </p>
            <p className="opsw__body">
              숨길 것이 없는 나눗셈입니다. 응모가 늘면 확률이 내려가는 것까지
              화면에 그대로 보입니다.
            </p>
          </div>
          <div className="opsw">
            <div className="opsw__name">왜 선착순이 아니라 추첨인가</div>
            <p className="opsw__body">
              선착순 특가는 <b>봇과 새로고침 경쟁</b>이 이깁니다 — 나이키가 SNKRS를
              추첨으로 바꾼 이유입니다. 추첨은 접속 시점과 무관하게 공정하고,
              응모가 무료라 <b>낙첨 손실이 0원</b>입니다.
            </p>
            <p className="opsw__ref">특가 재원: 만석 선발주 원가율 — 팀구매와 같은 곡선의 끝값 (할인율을 지어내지 않음)</p>
          </div>
        </>
      )}
      {sv && (
        <>
          <h4 className="ops__h">{sv.name}</h4>
          <div className="ops__kpis">
            <div><em>내 적립</em><b>{won(sv.my ?? 0)}</b></div>
            <div><em>전체 풀</em><b>{won(sv.total)}</b></div>
            <div><em>주간 상금</em><b>{won(sv.prize)}</b></div>
            <div><em>내 확률</em><b>{sv.odds ?? 0}%</b></div>
          </div>
          <div className="opsw">
            <div className="opsw__name">확률과 상금이 나오는 식</div>
            <p className="opsw__eq">
              상금 = 풀 × 연 3% ÷ 52주 = {won(sv.prize)}<br />
              P(당첨) = 내 적립 ÷ 풀
              {sv.my > 0 && <> = {won(sv.my)} ÷ {won(sv.total)} = <b>{sv.odds}%</b></>}
            </p>
            <p className="opsw__body">
              <b>이자만 모아 상금으로, 원금은 그대로.</b> 기대값은 일반 적금과 같고
              분산만 재배분됩니다 — 잃는 사람이 구조적으로 없는 복권입니다.
            </p>
            <p className="opsw__ref">Prize-Linked Savings — Kearney·Tufano·Guryan·Hurst (NBER WP16433) · 영국 Premium Bonds 1956~</p>
          </div>
        </>
      )}
      {daily && (
        <>
          <h4 className="ops__h">{daily.name}</h4>
          <div className="ops__kpis">
            <div><em>당첨</em><b>{daily.winOdds}%</b></div>
            <div><em>꽝</em><b>{daily.blankOdds}%</b></div>
            <div><em>잔여</em><b>{daily.remaining ?? daily.totalStock}/{daily.totalStock}</b></div>
            <div><em>손익분기</em><b>{daily.economics.breakEvenPlays.toLocaleString()}회</b></div>
          </div>
          <div className="opsw">
            <div className="opsw__name">확률이 나오는 식</div>
            <p className="opsw__eq">
              P(당첨) = 1 / (경품원가 ÷ 1회 순수입)<br />
              = 1 / ({won(daily.economics.itemCost)} ÷ {won(daily.economics.netPerPlay)})
              {' = '}<b>{daily.winOdds}%</b>
            </p>
            <p className="opsw__body">
              여기선 확률을 <b>손익분기에서</b> 유도합니다. 이보다 후하면 회차가
              적자라, 이 숫자가 곧 상한입니다.
            </p>
          </div>
          <div className="opsw">
            <div className="opsw__name">이 형식만 꽝이 있습니다</div>
            <p className="opsw__body">
              100원은 스피또 최저가(500원)의 5분의 1입니다. 잃어도 생활에 영향이 없는
              금액이라 꽝을 허용하고, 대신 <b>꽝 {daily.blankOdds}%와 산출 근거까지
              전부 공개</b>합니다. 정직성의 축이 무손실이 아니라 완전 공개로 옮겨갑니다.
            </p>
            <p className="opsw__ref">Temu 스핀휠(당첨 직전 정지)의 정확한 반대 방향</p>
          </div>
        </>
      )}
    </aside>
  )
}
