/**
 * 올박스 — 팀 구매 + 확률형 뽑기.
 *
 * ## 화면 구조 (v1의 앱 셸)
 *   왼쪽  BriefRail  무엇을 왜 만들었나 (데스크톱 1180px↑)
 *   가운데 phone      **실제 유저가 보는 그대로**. 올웨이즈 앱 문법 + 하단 탭바
 *   오른쪽 OpsRail    확률이 어디서 나오는지, 지금 값이 얼마인지 (심사자·운영자용)
 *
 * ## 올박스 탭의 커머스 흐름
 *   목록(딜 5개) → 상세 → 결제 → 주문완료 → 모집 → 개봉 → 교환 → 주문내역(내 정보 탭)
 *   커머스의 규격 화면을 그대로 밟되, **모든 숫자는 서버 실행값**이고
 *   없는 것(실결제·배송)은 그 자리에 없다고 적는다. 지어낸 수가 0개인 것이 목표다.
 *
 * ## 마감 표시 원칙 (I10′)
 *   금지는 감정 유도이지 마감 표시가 아니다. 마감이 실재하는 ②공동구매·③0원 응모에는
 *   시각을 그대로 보여주고(숨기면 조건 은닉 — 테무 제재 사유 C2), 마감이 실재하지 않는
 *   ①팀 뽑기에는 서버가 deadlineAt=null을 내려 시계 자체가 그려지지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  won, Delta, TIERS, TIER_LABEL, Rarity, Badge, SimBadge,
  ProductCard, BoxGrid, GridLegend, TierShowcase, MemberRail,
  RevealScene, RevealCard, OddsTable, UpdateTable,
  CardPick, CycleView, TradeTable, InviteBox,
  DealCard, DeadlineTicker, Gauge, Marquee, SearchScreen,
  IconHome, IconContent, IconHeart, IconUser, IconBox, IconCart, IconSearch,
} from './parts.jsx'

const TABS = [
  { id: 'home', label: '홈', Icon: IconHome },
  { id: 'content', label: '콘텐츠', Icon: IconContent },
  { id: 'olbox', label: '올박스', Icon: IconBox, center: true },
  { id: 'wish', label: '관심상품', Icon: IconHeart },
  { id: 'me', label: '내 정보', Icon: IconUser },
]

/**
 * 문자열 → 32bit 해시. 시뮬 팀원의 준비 순서와 닉네임을 정하는 데 쓴다.
 * 순서가 2·3·4…10이면 사람이 준비하는 모습이 아니라 루프가 도는 모습이다.
 * 방 id를 섞어 넣어 **방마다 다르되 같은 방에서는 같은 순서**가 나오게 한다.
 */
const hash = (str) => {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0)
}

/**
 * 시뮬 팀원 닉네임 — 실명처럼 보이면 "누구 이름인가" 하는 오해가 생긴다.
 * 커머스 앱에서 팀원은 보통 닉네임으로 보이므로 그 감각을 맞춘다.
 * 방 id로 시드를 만들어 같은 방에서는 같은 닉네임이 나온다.
 */
const NICK_A = ['활발한', '느긋한', '용감한', '신나는', '든든한', '수줍은', '부지런한', '엉뚱한', '다정한', '씩씩한']
const NICK_B = ['연어', '너구리', '수달', '고래', '다람쥐', '펭귄', '치타', '올빼미', '두더지', '햄스터']
const NICK_FIXED = ['리자몽최고', '올웨이즈화이팅', '피카츄사랑', '카드모으는사람', '홀로그램덕후', '오늘은SAR', '박스깡장인']

const nickOf = (seed, i) => {
  const h = hash(`${seed}|nick|${i}`)
  if (h % 5 === 0) return NICK_FIXED[h % NICK_FIXED.length]
  // >>는 부호 있는 시프트라 h가 2^31을 넘으면 음수가 되고 인덱스가 undefined가 된다
  return NICK_A[h % NICK_A.length] + NICK_B[(h >>> 8) % NICK_B.length]
}


const api = async (path, body) => {
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined)
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

/** 새로고침 복구용 — 저장하는 것은 식별자뿐이다. 상태는 서버가 소유한다(I1). */
const saveOrder = (o) => { try { localStorage.setItem('olbox.order', JSON.stringify(o)) } catch { /* 프라이빗 모드 등 */ } }
const loadOrder = () => { try { return JSON.parse(localStorage.getItem('olbox.order') || 'null') } catch { return null } }
const clearOrder = () => { try { localStorage.removeItem('olbox.order') } catch { /* noop */ } }
const loadRecent = () => { try { return JSON.parse(localStorage.getItem('olbox.recent') || '[]') } catch { return [] } }
const saveRecent = (a) => { try { localStorage.setItem('olbox.recent', JSON.stringify(a.slice(0, 8))) } catch { /* noop */ } }

/* ── 좌측 배경 레일 (데스크톱) ──────────────────────────────── */
function BriefRail({ box, oripa, crawl }) {
  return (
    <aside className="brief" aria-label="과제 설명">
      <p className="brief__tag">레브잇 올웨이즈 직무 과제</p>
      <h2 className="brief__h">올박스 — 팀 구매 + 확률형 뽑기</h2>
      <p className="brief__lead">
        확률형 상품의 문제는 낮은 확률이 아니라 <b>검증 불가능성</b>입니다.
        구성품과 재고가 비공개면 확률은 판매자의 주장일 뿐입니다.
        올박스는 전체 구성을 공개해 그 주장을 <b>검증 가능한 사실</b>로 바꿉니다.
      </p>

      <section className="brief__sec">
        <h3>컬처 시그널</h3>
        <p className="brief__p">
          <b>포켓몬 카드 열풍</b>. 2026년은 출시 30주년입니다.
          크림 TCG 거래액이 1~4월 전년 대비 <b>+5,625%</b>,
          용산 아이파크몰 카드숍에 발매일 개점 전 <b>600여 명</b>이 줄을 섰습니다.
          다나와 시세를 직접 12개월 수집해 같은 상승을 재확인했습니다.
        </p>
      </section>

      <section className="brief__sec">
        <h3>풀려는 문제</h3>
        <ul>
          <li>확률을 공개해도 <b>검증할 수 없다</b> — 분모와 분자를 아무도 못 센다</li>
          <li>뽑혀도 <b>갱신되지 않는다</b> — 몰래 꽝카드를 채워넣어도 모른다</li>
          <li>안 나오면 남는 중복은 <b>개인에겐 쓰레기</b>지만 집단에겐 자원이다</li>
        </ul>
        {oripa && (
          <p className="brief__p">
            직접 조사했습니다 — 수집한 오리파 <b>{`${oripa.total}건 중 확률을 적어 둔 것은 ${oripa.probNum}건`}</b>,
            대신 <b>{`'확정·보장'은 ${oripa.guarantee}건`}</b>입니다.
          </p>
        )}
        <p className="brief__dim">
          상품 표기 기준입니다. {oripa ? `${oripa.total}건 중 ${oripa.unreachable}건은 중개 링크라 판매자 상세에 도달할 수 없었고, 도달 못 한 것을 미공시로 세지 않았습니다.` : ''}
        </p>
      </section>

      <section className="brief__sec">
        <h3>누가 가장 크게 겪는가</h3>
        <p className="brief__p">
          <b>30~40대 부모.</b> 돈을 내는 사람이면서 문화 바깥에 있습니다.
          카드숍은 아이들과 전문 리셀러의 공간이고, 시세도 은어(SAR·PSA)도 모른 채
          들어가면 무엇을 샀는지조차 알기 어렵습니다.
        </p>
      </section>

      <section className="brief__sec">
        <h3>쓰는 데이터</h3>
        <p className="brief__p">
          다나와에서 직접 수집한 <b>{`${crawl.toLocaleString('ko-KR')}건`}</b>.
          박스 3종의 구성 · 교환 선호 · 홈 화면의 상품 <b>세 곳</b>에 씁니다.
        </p>
        <p className="brief__dim">
          상품 가격이 바뀌면 구성도 확률도 함께 바뀝니다 — 크롤 데이터가 장식이 아니라 연산의 입력입니다.
        </p>
      </section>

      {/* 과제1의 현상 분석이 어디에 기대고 있는지 — 수치는 적지 않는다.
          화면에 수치를 적으면 문서와 두 벌이 되고, 그 순간 어긋나기 시작한다.
          전체 근거와 수치는 docs/references.md 의 A·B·D·F 대장에 있다. */}
      <section className="brief__sec">
        <h3>근거 문헌</h3>
        <ul>
          <li>
            <b>Heck et al. (2026)</b>, <i>PLoS One</i> — 포켓몬 카드 300장을 1년간 실제 출품한
            현장연구. <b>가치가 상위 등급에 쏠린다</b>는 것이 여기서 실측됐습니다.
            우리 박스의 가치 쏠림을 이 논문과 같은 절단점에서 비교합니다.
          </li>
          <li>
            <b>Culbong et al. (2026)</b>, <i>Journal of Youth Studies</i> — 루트박스·가챠 참여
            동기 인터뷰. <b>확률은 표시되지 않지만 이용자는 낮다는 걸 안다</b>,
            그리고 <b>확률 대신 확정 보상을 판다</b>는 관찰이 우리 오리파 실측과 일치합니다.
          </li>
          <li>
            <b>Baltussen et al. (2012)</b>, <i>Experimental Economics</i> — 인원 중 일부만
            무작위로 지급하면 위험회피가 낮아진다는 <b>실험방법론</b> 결과.
            공동구매·응모 형식에 대한 경고로만 인용합니다.
          </li>
          <li>
            <b>Wadsley et al. (2022)</b>, <i>Psychological Reports</i> — 사회적 보상이
            과다사용의 가장 강한 예측 요인. <b>우리 설계에 대한 경고</b>입니다.
            정원을 고정하고 초대 보상·연속 보너스·천장을 넣지 않은 이유입니다.
          </li>
        </ul>
        <p className="brief__dim">
          전체 근거와 수치는 저장소 <code>docs/references.md</code> 의 근거 대장에 있습니다.
          화면에는 출처만 적습니다 — 수치를 화면에 적으면 문서와 두 벌이 되기 때문입니다.
        </p>
      </section>

      {/* ②번 축 — 왜 다른 커머스가 아니라 올웨이즈인가. */}
      <section className="brief__sec brief__sec--key">
        <h3>왜 올웨이즈인가</h3>
        <p className="brief__p">
          올웨이즈는 이미 <b>&ldquo;여럿이 모이면 싸진다&rdquo;</b>를 핵심 문법으로 갖고 있습니다
          (팀구매·다인딜·0원딜). 올박스는 거기에 <b>확률</b>을 얹은 것이라,
          새 개념을 배울 필요 없이 <b>기존 문법의 확장</b>으로 읽힙니다.
        </p>
        <p className="brief__p">
          다른 커머스가 이걸 하려면 <b>팀구매부터 만들어야 합니다.</b>
          모객 구조가 이미 있는 곳에서만 성립하는 기능입니다.
        </p>
        <p className="brief__dim">
          자리도 이미 있습니다 — 하단 중앙 플로팅 탭(지금은 올세일)이 그 자리입니다.
        </p>
      </section>

      <section className="brief__sec">
        <h3>오리파와 무엇이 다른가</h3>
        <ul>
          <li><b>전 구성 공개</b> — {box ? `${box.N.toLocaleString('ko-KR')}장을 전부 그린다` : '구성 전체를 그린다'}</li>
          <li><b>확률 검증</b> — 재고 ÷ 전체 장수. 세면 확인된다</li>
          <li><b>뽑힌 뒤 갱신</b> — 비복원. 빠진 만큼 확률이 오른다</li>
          <li><b>안 나왔을 때</b> — 팀 안에서 교환. 아무도 나빠지지 않는다</li>
        </ul>
      </section>

      <p className="brief__note">
        가운데 화면은 <b>실제 유저가 보는 그대로</b>입니다.
        오른쪽은 심사자용 패널로, 유저 화면에는 나오지 않습니다.
      </p>
    </aside>
  )
}

/* ── 실무자 모니터 (데스크톱 우측) ──────────────────────────── */
function OpsRail({ sel, conversion, room, teamSize, gateMsg }) {
  const { box, odds, updates } = sel
  const live = room?.live
  return (
    <aside className="ops" aria-label="실무자 실시간 지표">
      <p className="ops__tag">OPS · 실무자 화면</p>

      <section className="ops__sec">
        <h4 className="ops__h">확률이 어디서 나오나</h4>
        <div className="opsw">
          <div className="opsw__name">사람이 적는 자리가 없습니다</div>
          <p className="opsw__eq">
            {`P(등급) = 재고 ÷ 전체 장수\nP_team(g,n) = 1 − C(N−K,n) / C(N,n)`}
          </p>
          <p className="opsw__body">
            개인 확률은 <b>정의</b>이고 팀 확률은 <b>초기하분포</b>입니다.
            둘 다 가정이 아니라 정의에서 나옵니다. 예산·곡선·배수·천장 파라미터가
            코드에 <b>하나도 없고</b>, 그것을 self-check가 검사합니다.
          </p>
        </div>
        <div className="opsw">
          <div className="opsw__name">{`K = 1이면 정확히 n배`}</div>
          <p className="opsw__body">
            {odds[0].exactlyLinear
              ? `S등급은 재고가 ${odds[0].K}장이라 팀 ${teamSize}명에서 정확히 ${odds[0].team[teamSize - 1].mul}입니다. `
              : ''}
            {`A등급은 ${odds[1].K}장이라 ${odds[1].team[teamSize - 1].mul}로 ${teamSize}배가 되지 않습니다. 반올림하지 않고 그대로 씁니다.`}
          </p>
        </div>
      </section>

      <section className="ops__sec">
        <h4 className="ops__h">{`박스 현황 — ${box.name}`}</h4>
        <p className="ops__row">
          {live
            ? `남은 카드 ${live.left.toLocaleString('ko-KR')} / ${box.N.toLocaleString('ko-KR')} · 뽑힌 ${live.drawn}개`
            : `${box.N.toLocaleString('ko-KR')}장 · 아직 아무도 뽑지 않음`}
        </p>
        <div className="ops__kpis">
          {(live ? live.tiers : odds.map((o) => ({ tier: o.tier, K: o.K, pct: o.soloPct }))).map((t) => (
            <div key={t.tier} className="ops__kpi">
              <span className={`tier tier--${t.tier}`}>{t.tier}</span>
              <b>{t.pct}</b>
              <em>{`재고 ${t.K}`}</em>
            </div>
          ))}
        </div>
        {/* 전원 게이트의 증거 — 소비자 화면에는 사람 말로, 여기엔 원문 그대로 */}
        {gateMsg && (
          <p className="ops__row ops__row--gate">
            {`POST /api/room open → ${gateMsg.status} · ${gateMsg.error}`}
          </p>
        )}
      </section>

      <section className="ops__sec">
        <h4 className="ops__h">장이 빠지면 확률이 오릅니다</h4>
        <UpdateTable updates={updates} tiers={TIERS} />
        <p className="opsw__ref">
          —는 확률 0이 아니라 성립 불가능한 상태입니다. 990장이 빠졌는데 B등급 25장이 남을 수는 없습니다.
        </p>
      </section>

      <section className="ops__sec">
        <h4 className="ops__h">교환 전환율 <SimBadge what={`${conversion.trials.toLocaleString('ko-KR')}회`} /></h4>
        <div className="tablewrap">
          <table>
            <thead><tr><th>같은 걸 원한 사람</th><th>선호 다를 때</th><th>모두 같을 때</th></tr></thead>
            <tbody>
              {conversion.models.heterogeneous.rows.map((r, i) => (
                <tr key={r.k}>
                  <td className="n">{r.k === 1 ? '1명 (나만)' : `${r.k}명`}</td>
                  <td className="n hi">{r.movedPct}</td>
                  <td className="n">{conversion.models.homogeneous.rows[i].movedPct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="opsw__body">
          선호가 모두 같으면 교환이 <b>거의 일어나지 않습니다</b> — 바꿀 것이 엇갈리지 않기 때문입니다.
          지목은 편의 기능이 아니라 이 메커니즘의 하중을 받는 부품입니다.
        </p>
      </section>

      <p className="opsw__ref">유저 화면에는 나오지 않습니다 · 데스크톱 1180px↑에서만</p>
    </aside>
  )
}

/* ── 폰 셸 (v1 원문) ──────────────────────────────────────── */
function Shell({ tab, setTab, children, brief, ops, overlay }) {
  return (
    <div className="stage">
      {brief}
      <div className="phone">
        <header className="top">
          <span className="top__logo">Alwayz</span>
          <span className="top__cart" aria-hidden="true"><IconCart /></span>
        </header>
        <main className="body">{children}</main>
        {/* 개봉 극장은 폰 안에서 뜬다 — 제품이 앱 안의 기능이라는 점이 깨지지 않게. */}
        {overlay}
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

/* 홈 필터 — pool의 실제 group 값과 1:1. 이전 버전은 CATS id가 크롤 그룹과
   달라(card/sealed vs deck/bulk) '전체' 밖 모든 필터가 빈 화면이 됐다. */
const CATS = [
  { id: 'all', label: '전체' }, { id: 'deck', label: '덱·단품' },
  { id: 'bulk', label: '벌크·입문' }, { id: 'grade', label: '그레이딩' }, { id: 'sealed', label: '봉인 박스' },
]

/* ── 홈 탭 — 실제 올웨이즈 홈 구조 ────────────────────────── */
function HomeTab({ cards, deals, onGoOlbox, onOpenSearch }) {
  const [cat, setCat] = useState('all')
  const shown = useMemo(() => {
    const c = cat === 'all' ? cards : cards.filter((x) => x.group === cat)
    return c.slice(0, 8)
  }, [cards, cat])
  return (
    <>
      {/* 눌리는데 아무 일도 안 일어나는 검색창이 가장 나쁜 상태다 — 실제로 연다. */}
      <button type="button" className="hsearch" onClick={onOpenSearch}>
        <IconSearch />
        <span className="top__q">올웨이즈에서 상품 검색하기</span>
      </button>

      {/* 골드박스 문법의 노란 히어로 — 올박스 목록으로 가는 문 */}
      <button type="button" className="goldhero" onClick={onGoOlbox}>
        <span className="goldhero__sub">팀 구매 + 확률형 뽑기</span>
        <span className="goldhero__logo">
          올 <span className="goldhero__gift" aria-hidden="true"><IconBox /></span> 박스
        </span>
        <span className="goldhero__note">
          {deals ? `지금 열려 있는 딜 ${deals.length}개 · 구성 전체 공개` : '구성 전체 공개'}
        </span>
      </button>

      <div className="cats">
        {CATS.map((c) => (
          <button key={c.id} type="button"
            className={`cats__b ${cat === c.id ? 'is-on' : ''}`}
            onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>

      {/* 올웨이즈 홈처럼 기획 상품이 오른쪽에서 왼쪽으로 흐른다 */}
      <section className="hsec">
        <header className="shead"><h2>실시간으로 많이 찾는 카드</h2></header>
        <Marquee items={cards.slice(0, 10)} />
      </section>

      <section className="hsec">
        <header className="shead">
          <h2>지금 많이 찾는 카드</h2>
          <span className="shead__more">더보기 ›</span>
        </header>
        {shown.length > 0 ? (
          <div className="grid">
            {shown.map((it) => <ProductCard key={it.id} item={it} />)}
          </div>
        ) : (
          <p className="hfoot">이 분류의 카드가 이번 박스에는 없습니다.</p>
        )}
      </section>

      <p className="hfoot">
        다나와에서 직접 수집한 상품입니다. 올박스의 구성도 같은 데이터로 채웁니다.
      </p>
    </>
  )
}

function StubTab({ title, body }) {
  return (
    <div className="empty">
      <p>{title}</p>
      <p className="empty__sub">{body}</p>
    </div>
  )
}

/* ── 내 정보 탭 = 주문내역 ─────────────────────────────────
   서버의 방 상태가 곧 주문이다. 새 데이터도 새 API도 없다 — room state를 렌더한다.
   localStorage에는 식별자만 있고(새로고침 복구), 값은 전부 서버가 소유한다(I1). */
function MeTab({ room, sel, me, onGoOlbox }) {
  if (!room) {
    return (
      <div className="empty">
        <p>주문 내역이 없습니다</p>
        <p className="empty__sub">올박스에 참여하면 여기에서 다시 볼 수 있어요.</p>
        <button type="button" className="btn btn--go btn--sm" onClick={onGoOlbox}>올박스 보러 가기</button>
      </div>
    )
  }
  const { box } = sel
  const myResult = room.openResults?.find((x) => x.memberId === me)
  const myTrade = room.trade?.results.find((x) => x.memberId === me)
  const got = myTrade?.after ?? (myResult ? { name: myResult.name_, price: myResult.price, tier: myResult.tier, image: myResult.image } : null)
  const state = room.trade ? '교환 완료' : room.opened ? '개봉 완료' : '팀 모으는 중'
  return (
    <>
      <section className="hsec">
        <header className="shead"><h2>주문 내역</h2></header>
        <div className="order">
          <div className="order__row"><span>주문번호</span><b>{room.id}</b></div>
          <div className="order__row"><span>상품</span><b>{`${box.name} 올박스 1장`}</b></div>
          <div className="order__row"><span>결제금액</span><b>{won(box.fee)}</b></div>
          <div className="order__row"><span>상태</span><b>{state}</b></div>
          {room.live && (
            <div className="order__row">
              <span>박스 현황</span>
              <b>{`남은 카드 ${room.live.left.toLocaleString('ko-KR')} / ${box.N.toLocaleString('ko-KR')}`}</b>
            </div>
          )}
        </div>
        {got && (
          <div className="order__got">
            <h3 className="sub">받은 카드</h3>
            <div className="order__card">
              {got.image ? <img src={got.image} alt="" loading="lazy" /> : <span className="tstrip__ph" />}
              <div>
                <span className={`tier tier--${got.tier}`}>{got.tier}</span>
                <p>{got.name}</p>
                <b>{won(got.price)}</b>
              </div>
            </div>
          </div>
        )}
        <button type="button" className="btn btn--ghost" onClick={onGoOlbox}>이어서 보기</button>
        <p className="dim">데모 방은 일정 시간 후 사라집니다 · 결제·배송은 이 MVP에서 구현하지 않았습니다</p>
      </section>
    </>
  )
}

/* ── 근거 시트 (v1의 바텀시트 문법, v2 내용) ───────────────── */
function HonestySheet({ sel, conversion, oripa, room, teamSize, onClose }) {
  const { box, odds, slotTiers } = sel
  return (
    <div className="sheet" role="dialog" aria-label="확률이 어떻게 정해지나요">
      <div className="sheet__bar" />
      <button type="button" className="sheet__x" onClick={onClose} aria-label="닫기">✕</button>
      <h3>확률이 어떻게 정해지나요</h3>

      <p className="sheet__lead">
        확률표를 <b>사람이 적지 않습니다.</b> 재고를 전체 장수로 나눈 값이고,
        팀 효과는 비복원 추출의 성질에서 나옵니다. 화면과 추첨이 같은 값을 씁니다.
      </p>

      <section className="sheet__verify">
        <h4>{`${box.N.toLocaleString('ko-KR')}장을 전부 그렸습니다`}</h4>
        <BoxGrid slotTiers={slotTiers} drawn={room?.openResults?.map((r) => r.i) ?? []} />
        <GridLegend tiers={box.tiers} />
        <p className="sheet__lead">
          네모 하나가 장 하나입니다. 세어보시면 재고와 정확히 맞습니다.
          {room?.live && ` 지금 ${room.live.drawn}개가 빠져 ${room.live.left.toLocaleString('ko-KR')}장 남았습니다.`}
        </p>
      </section>

      <dl className="sheet__grid">
        <dt>⓪ 기본 확률 = 재고 ÷ 전체 장수</dt>
        <dd>
          {`박스는 ${box.N.toLocaleString('ko-KR')}장입니다. 어떤 등급의 재고가 1장이면 확률은 ${odds[0].soloPct}입니다.`}
          <br />이것은 수식이 아니라 <b>정의</b>라서 근거가 필요 없습니다.
          그리고 이것이 오리파와의 차이 전부입니다 — 오리파는 재고를 공개하지 않으므로
          확률을 계산할 수도 검증할 수도 없습니다.
        </dd>

        <dt>① 팀 확률 = 초기하분포</dt>
        <dd>
          <code>{`P_team(g, n) = 1 − C(N−K, n) / C(N, n)`}</code>
          <br />재고가 1장이면 이 값이 <b>정확히 n / N</b>, 즉 혼자 대비 <b>정확히 n배</b>입니다.
          {` 팀 ${teamSize}명이면 ${odds[0].team[teamSize - 1].mul}. 저희가 아무것도 보태지 않습니다.`}
          <br />{`재고가 ${odds[1].K}장인 등급은 ${odds[1].team[teamSize - 1].mul}로 ${teamSize}배가 되지 않습니다. 반올림해서 쓰지 않습니다.`}
        </dd>

        <dt>② 뽑히면 박스에서 빠집니다</dt>
        <dd>
          비복원입니다. 남은 카드가 줄면 확률이 오릅니다.
          &ldquo;많이 안 나왔으니 이제 나올 때가 됐다&rdquo;는 생각은 매번 다시 채워넣는 방식에서는
          착각이지만 <b>빼고 나면 참</b>이 됩니다.
          <br />그래서 <b>천장 같은 장치를 만들지 않았습니다.</b> 재고가 줄어드는 것 자체가 천장입니다.
        </dd>

        <dt>③ 안 나오면 팀 안에서 바꿉니다</dt>
        <dd>
          Gale의 Top Trading Cycles입니다. <b>아무도 교환 전보다 나빠지지 않고</b>,
          <b> 선호를 거짓으로 말해도 이득이 없습니다</b> — 둘 다 정리로 보장됩니다.
          <br />다만 전환은 100%가 아닙니다.
          {` 같은 것을 원한 사람이 1명이면 ${conversion.models.heterogeneous.rows[0].movedPct}, 전원이면 ${conversion.models.heterogeneous.rows[3].movedPct}입니다.`}
        </dd>

        <dt>④ 꽝이 없는 이유는 두 층입니다</dt>
        <dd>
          1층 — 가장 낮은 등급의 최저가도 참여비 이상입니다({won(box.fee)}).
          <br />2층 — 교환 후에도 아무도 나빠지지 않는 것이 <b>정리로</b> 보장됩니다.
          <br />2층이 있어서 1층을 <b>카드 안에서만</b> 잡을 수 있습니다. 생필품을 섞을 필요가 없습니다.
        </dd>
      </dl>

      <h4>무엇이 사실이고 무엇이 가정인가</h4>
      <ul className="sheet__ul">
        <li><b>정의</b> — 확률 = 재고 ÷ 전체 장수</li>
        <li><b>정의에서 유도</b> — 팀 확률(초기하분포), 비복원 갱신</li>
        <li><b>정리</b> — 교환의 네 가지 성질, 꽝 없음 2층</li>
        <li><b>실측</b> — 크롤 875건, 오리파 확률 미표기 {oripa ? `${oripa.probNum}/${oripa.total}건` : ''}</li>
        <li><b>설계 선택</b> — 박스 구성, 참여비 {won(box.fee)}, 정원 {box.teamMax}명</li>
        <li><b>가정</b> — 타깃이 30~40대 부모라는 것, 박스 원가를 시세로 둔 것</li>
        <li><b>미검증</b> — 교환이 진입장벽을 실제로 낮추는가</li>
      </ul>

      <h4>무엇이 시뮬레이션인가</h4>
      <p className="sheet__lead">
        팀원 · 팀원의 취향 · 10만 회 분포 · 결제 확인은 시뮬레이션입니다. 실결제와 배송은 구현하지 않았습니다.
        <b> 추첨과 교환은 시뮬레이션이 아니라</b> 서버가 실제로 계산한 결과이고, 시드를 공개해 재현할 수 있습니다.
        {room?.trade && <><br /><code>{`교환 시드 ${room.trade.seed}`}</code></>}
      </p>
    </div>
  )
}

/* ── 올박스 목록 — 커머스의 첫 화면은 "고를 것"이다 ─────────────
   딜 카드의 모든 문자열은 서버(deals[])가 만든다. 여기는 필터와 배치만 한다. */
const KIND_PILLS = [
  { id: 'all', label: '전체' }, { id: 'team', label: '팀 뽑기' },
  { id: 'group', label: '공동구매' }, { id: 'daily', label: '0원 응모' },
]

function DealListScreen({ deals, onOpenDeal, sel }) {
  const [kind, setKind] = useState('all')
  const shown = kind === 'all' ? deals : deals.filter((d) => d.kind === kind)
  const daily = deals.find((d) => d.kind === 'daily')
  const top = sel?.box?.tiers?.[0]
  // 무대에 띄울 카드 — 등급을 섞어 6장. 전부 크롤 실측 상품이다.
  const floaters = (sel?.box?.tiers ?? [])
    .flatMap((t) => t.cards.slice(0, 2))
    .filter((c) => c.image)
    .slice(0, 6)
  return (
    <>
      {/* 포켓몬 카드 게임 Pocket의 첫 화면 문법 —
          어두운 무대에 빛이 퍼지고 실제 카드가 흩어져 떠 있다.
          카드 이미지는 **크롤 실측 상품**이라 장식이 아니라 이 박스의 내용물이다. */}
      <section className="hero3">
        <span className="hero3__rays" aria-hidden="true" />
        <span className="hero3__glow" aria-hidden="true" />
        <div className="hero3__cards" aria-hidden="true">
          {floaters.map((c, i) => (
            <img key={c.id} src={c.image} alt="" loading="lazy"
              className={`hero3__c hero3__c--${i + 1}`} />
          ))}
        </div>
        <div className="hero3__brand">
          <span className="hero3__k">구성을 전부 공개하는 뽑기</span>
          <h2 className="hero3__logo">올박스</h2>
          <span className="hero3__tag">팀 구매 + 확률형 뽑기</span>
        </div>
        <p className="hero3__max">
          {top ? <>최고 <b>{won(top.maxPrice)}</b></> : ''}
          <em>{`${(sel?.box?.N ?? 1000).toLocaleString('ko-KR')}장 전부 공개`}</em>
        </p>
        <p className="hero3__scroll">아래로 내려서 시작 ↓</p>
      </section>

      <section className="intro">
        <ul className="intro__pts">
          {[
            ['전체 확률 100% 공개', '박스에 뭐가 몇 장 들었는지 전부 보여드려요'],
            ['참여할수록 올라가는 확률', '같이 열면 팀 전원의 확률이 올라갑니다'],
            ['꽝 없음 · 모두가 당첨', '어떤 카드가 나와도 참여비 이상'],
          ].map(([t, d], i) => (
            <li key={t} style={{ animationDelay: `${0.35 + i * 0.12}s` }}>
              <b>{t}</b><span>{d}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* 풀블리드 배너 — ③ 0원 응모. 문구가 전부 참이라 과장 카피가 필요 없는
          유일한 배너다: 응모가 실제로 0원이고, 마감(자정)이 실재한다. */}
      {daily && (
        <button type="button" className="dbanner" onClick={() => onOpenDeal(daily)}>
          <span className="dbanner__k">오늘의 0원 응모</span>
          <span className="dbanner__line">
            <s>{daily.price.strike}</s>
            <b>{daily.price.big}</b>
            <em>{daily.price.discount}</em>
          </span>
          <span className="dbanner__sub">{daily.price.sub}</span>
          <DeadlineTicker deadlineAt={daily.deadlineAt} label="자정 마감" />
        </button>
      )}

      <div className="cats">
        {KIND_PILLS.map((c) => (
          <button key={c.id} type="button" className={`cats__b ${kind === c.id ? 'is-on' : ''}`}
            onClick={() => setKind(c.id)}>{c.label}</button>
        ))}
      </div>

      <section className="hsec">
        <header className="shead"><h2>지금 열려 있는 올박스</h2></header>
        <div className="deallist">
          {shown.map((d) => <DealCard key={d.id} deal={d} onOpen={onOpenDeal} />)}
        </div>
        <p className="dim">
          세 형식이 전부 <b>확률 = 재고 ÷ 참여</b> 한 규칙입니다.
          팀 뽑기·공동구매는 사람이 모일수록 오르고, 0원 응모는 내려갑니다 —
          방향이 다른 것이 팀 효과가 마케팅이 아니라 구조라는 증거입니다.
        </p>
      </section>
    </>
  )
}

/* ── ① 팀 뽑기 상세 ───────────────────────────────────────── */
function TeamDetail({ sel, deal, teamSize, setTeamSize, busy, onBack, onBuy, onSheet }) {
  const { box, odds } = sel
  return (
    <>
      <button type="button" className="backrow" onClick={onBack}>‹ 올박스 목록</button>
      <section className="hero">
        <div className="bcard">
          <span className="bcard__glow" aria-hidden="true" />
          {box.tiers[0].cards[0]?.image && (
            <img className="bcard__prize" src={box.tiers[0].cards[0].image} alt="" loading="lazy" />
          )}
          <span className="bcard__shine" aria-hidden="true" />
          <span className="bcard__body">
            <span className="bcard__name">{`${box.name} 올박스`}</span>
            <span className="bcard__blurb">{`${box.N.toLocaleString('ko-KR')}장 구성을 전부 공개합니다`}</span>
            <span className="bcard__odds">
              {'최고 '}<b>{(box.tiers[0].cards[0]?.name ?? '').replace(/^\[[^\]]*\]\s*/, '').slice(0, 20)}</b>
              {` · 시가 ${won(box.tiers[0].maxPrice)}`}
              <em>{`${teamSize}명이면 ${odds[0].team[teamSize - 1].pct} · ${odds[0].team[teamSize - 1].mul}`}</em>
            </span>
            <span className="bcard__gems">
              {box.tiers.map((t) => (
                <span key={t.tier} className={`gem ${t.tier === 'S' ? 'gem--S' : ''}`}>
                  {`${t.tier} ${t.K.toLocaleString('ko-KR')}`}
                </span>
              ))}
            </span>
          </span>
        </div>
      </section>

      {/* 가격 블록 — 커머스 위계: 가장 큰 활자는 내가 내는 돈.
          ①에는 정가가 없으므로 취소선·할인율을 그리지 않는다. 대신 코드가 검사한
          손익 밴드(꽝 없음 1층)를 그 자리에 놓는다 — deal.price.* 전부 서버 문자열. */}
      <section className="pricebox">
        <b className="pricebox__big">{deal.price.big}</b>
        <span className="pricebox__sub">{deal.price.sub}</span>
        {deal.price.bands && <span className="pricebox__bands">{deal.price.bands}</span>}
        <span className="pricebox__floor">{deal.floorLine}</span>
      </section>

      {/* 미공시만 문제가 아니다 — 서치팩과 정품도 소비자가 못 막는 위험이다.
          구조적으로 어떻게 막는지를 상세에서 말한다. */}
      <section className="hsec">
        <header className="shead"><h2>왜 여기서 사면 안심인가요</h2></header>
        <ul className="trust">
          <li>
            <b>서치팩이 없습니다</b>
            <span>박스를 미리 뜯어 좋은 팩만 골라가는 사람이 중간에 없어요.
              구성이 화면에 전부 있고 뽑기는 서버가 합니다</span>
          </li>
          <li>
            <b>정품·등급이 확인된 카드</b>
            <span>상위 등급은 PSA·BGS 등급이 매겨진 실물로 채웁니다.
              재포장이나 정품 여부를 걱정하지 않아도 돼요</span>
          </li>
        </ul>
      </section>

      <section className="hsec">
        <header className="shead"><h2>박스에 뭐가 들었나요</h2></header>
        <p className="lead"><b>전부 공개합니다.</b> 어떤 카드가 몇 장 들었는지, 시세가 얼마인지 다 보여드려요.</p>
        {box.tiers.map((t, i) => (
          <TierShowcase key={t.tier} tier={t} hero={t.tier === 'S'}
            pct={odds[i].soloPct} freq={odds[i].soloFreq} />
        ))}
      </section>

      <section className="hsec">
        <header className="shead"><h2>친구랑 열수록 확률 UP</h2></header>
        <div className="notice">
          <h3>친구를 부르면 뭐가 달라지나요</h3>
          <p>
            같은 박스에서 각자 한 장씩 뽑아요. 사람이 많을수록 <b>팀 안에 좋은 카드가 나올 확률</b>이 올라갑니다.
            팀에 나온 걸 내가 갖는 건 <b>교환</b>으로 정해요.
            <b> 초대한 사람이 더 받는 건 없어요. 팀 전원이 똑같은 확률입니다.</b>
          </p>
        </div>
        <div className="slider">
          <div className="slider__read"><b>{teamSize}</b><span>명</span></div>
          <input type="range" min="1" max={box.teamMax} value={teamSize}
            onChange={(e) => setTeamSize(Number(e.target.value))} aria-label="팀 인원" />
        </div>
        <OddsTable odds={odds} n={teamSize} />
        <p className="dim">
          <b>{`${teamSize}명이면 ${odds[0].tier}등급이 ${odds[0].team[teamSize - 1].mul}, ${odds[1].tier}등급이 ${odds[1].team[teamSize - 1].mul}예요.`}</b>
          {' 저희가 정한 숫자가 아니라 구성에서 그대로 나오는 값이라, 반올림하지 않고 그대로 적었어요.'}
        </p>
      </section>

      {/* 올웨이즈 팀구매 문법 — 혼자 살지 팀으로 열지를 먼저 고른다.
          팀을 고르면 주문서 앞에 **팀 모으기** 화면이 온다. */}
      <div className="cta cta--two">
        <button className="btn btn--alt" onClick={() => onBuy('solo')} disabled={busy === 'pay'}>
          <b>{won(box.fee)}</b><span>혼자 열기</span>
        </button>
        <button className="btn btn--go" onClick={() => onBuy('team')} disabled={busy === 'pay'}>
          <b>{won(box.fee)}</b><span>팀으로 열기</span>
        </button>
      </div>

    </>
  )
}

/* ── ① 팀 모으기 — 주문서 **앞** 단계 ─────────────────────────
   올웨이즈 팀구매가 그렇듯, 결제 전에 "누구랑 열지"를 먼저 정한다.
   결제부터 시키면 팀이 왜 필요한지가 흐려진다. */
function TeamSetupScreen({ sel, deal, teamSize, setTeamSize, busy, onBack, onNext }) {
  const { box, odds } = sel
  const [mode, setMode] = useState('open')
  const t = odds[0].team[teamSize - 1]
  const solo = odds[0]
  const QUICK = [2, 4, 6, 10].filter((n) => n <= box.teamMax)
  return (
    <>
      <button type="button" className="backrow" onClick={onBack}>‹ 상세로</button>
      <section className="hsec">
        <header className="shead"><h2>몇 명이서 열까요?</h2></header>

        {/* 인원은 여기서 정한다. 상세의 슬라이더는 확률을 설명하는 자리였고,
            실제 결정은 결제 직전에 하는 것이 자연스럽다. */}
        <div className="pick">
          <div className="pick__now">
            <b>{teamSize}</b><span>명</span>
          </div>
          <input type="range" min="2" max={box.teamMax} value={teamSize}
            onChange={(e) => setTeamSize(Number(e.target.value))} aria-label="팀 인원" />
          <div className="pick__quick">
            {QUICK.map((n) => (
              <button key={n} type="button"
                className={`pick__chip ${teamSize === n ? 'is-on' : ''}`}
                onClick={() => setTeamSize(n)}>{`${n}명`}</button>
            ))}
          </div>
        </div>

        <p className="lead">
          같은 박스를 함께 열면 <b>팀 전원의 확률이 올라갑니다.</b>
          {` 혼자면 S등급 ${solo.soloPct}, ${teamSize}명이면 `}<b>{t.pct}</b>
          {` — 혼자 대비 ${t.mul}예요.`}
        </p>
        <OddsTable odds={odds} n={teamSize} />

        <div className="setup">
          <button type="button" className={`setup__opt ${mode === 'open' ? 'is-on' : ''}`}
            onClick={() => setMode('open')}>
            <b>공개 팀으로 모으기</b>
            <span>누구나 참여할 수 있어요. 인원이 차면 바로 열립니다</span>
          </button>
          <button type="button" className={`setup__opt ${mode === 'invite' ? 'is-on' : ''}`}
            onClick={() => setMode('invite')}>
            <b>친구만 초대하기</b>
            <span>링크를 받은 사람만 들어올 수 있어요</span>
          </button>
        </div>

        <div className="notice">
          <h3>친구를 부르면 뭐가 달라지나요</h3>
          <p>
            같은 박스에서 각자 한 장씩 뽑아요. 사람이 많을수록 <b>팀 안에 좋은 카드가 나올 확률</b>이 올라갑니다.
            팀에 나온 걸 내가 갖는 건 <b>교환</b>으로 정해요.
            <b> 초대한 사람이 더 받는 건 없어요. 팀 전원이 똑같은 확률입니다.</b>
          </p>
        </div>
      </section>

      <div className="cta">
        <button className="btn btn--go" onClick={() => onNext(mode)} disabled={busy === 'pay'}>
          {`${won(box.fee)} · ${teamSize}명으로 결제하기`}
        </button>
        <p className="cta__note">결제 후 초대 링크를 받을 수 있어요 · 인원이 차면 자동으로 열립니다</p>
      </div>
    </>
  )
}

/* ── ① 결제 — 화면 규격은 커머스 그대로, 금액 줄은 전부 서버 값 ──
   만들면 안 되는 것: 카드번호 입력칸, 가짜 승인번호, 가짜 배송비 금액.
   배송비 자리는 금액 대신 한계를 그 자리에 적는다 — 빈칸보다 낫고 거짓보다 훨씬 낫다. */
function CheckoutScreen({ sel, teamSize, busy, onBack, onPay }) {
  const { box, odds } = sel
  const [agree, setAgree] = useState(false)
  return (
    <>
      <button type="button" className="backrow" onClick={onBack}>‹ 상세로</button>
      <section className="hsec">
        <header className="shead"><h2>주문서</h2></header>
        <div className="order">
          <div className="order__row"><span>주문 상품</span><b>{`${box.name} 올박스 · 1장`}</b></div>
          <div className="order__row"><span>수량</span><b>1장 (1인 1장 고정)</b></div>
          <div className="order__row"><span>상품 금액</span><b>{won(box.fee)}</b></div>
          <div className="order__row order__row--dim">
            <span>배송비</span><b>이 MVP는 배송을 모델링하지 않았습니다</b>
          </div>
          <div className="order__row order__row--total"><span>총 결제금액</span><b>{won(box.fee)}</b></div>
          <div className="order__row">
            <span>결제수단</span>
            <b>간편결제 <SimBadge what="결제" /></b>
          </div>
        </div>

        <label className="agree">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            확률과 재고 조건을 확인했습니다
            <em>{`재고 S ${odds[0].K} · A ${odds[1].K} · B ${odds[2].K} · C ${odds[3].K} — 팀이 ${teamSize}명이 되면 S ${odds[0].team[teamSize - 1].pct}`}</em>
          </span>
        </label>

        <div className="cta">
          <button className="btn btn--go" onClick={onPay} disabled={!agree || busy === 'pay'}>
            {busy === 'pay' ? '결제하는 중…' : `${won(box.fee)} 결제하기`}
          </button>
          <p className="cta__note">실결제가 아닌 시뮬레이션입니다 · 주문번호는 서버가 실제로 발급합니다</p>
        </div>
      </section>
    </>
  )
}

/* ── ① 주문 완료 — 커머스의 종결 신호 ─────────────────────────
   주문번호는 지어내지 않는다 — 서버가 발급한 room.id 그대로다. 이후 조회에도 진짜로 쓰인다.
   "내가 산 시점의 남은 카드"를 박아두면 개봉 결과의 slotsBefore와 이어져
   비복원 서사가 주문서에서부터 시작된다. */
function OrderDoneScreen({ sel, room, deal, onRecruit, onOrders }) {
  const { box } = sel
  return (
    <section className="hsec done">
      <p className="done__check" aria-hidden="true">✓</p>
      <h2 className="done__h">주문이 완료되었습니다 <SimBadge what="결제" /></h2>
      <div className="order">
        <div className="order__row"><span>주문번호</span><b>{room.id}</b></div>
        <div className="order__row"><span>결제금액</span><b>{won(box.fee)}</b></div>
        <div className="order__row"><span>받는 카드</span><b>{deal.price.sub.replace('받는 카드 ', '')}</b></div>
        {room.live && (
          <div className="order__row">
            <span>내가 산 시점</span>
            <b>{`남은 카드 ${room.live.left.toLocaleString('ko-KR')} / ${box.N.toLocaleString('ko-KR')}`}</b>
          </div>
        )}
        {room.live && (
          <div className="order__row order__row--dim">
            <span>그때 내 확률</span>
            <b>{room.live.tiers.slice(0, 3).map((t) => `${t.tier} ${t.pct}`).join(' · ')}</b>
          </div>
        )}
      </div>
      <div className="cta">
        <button className="btn btn--go" onClick={onRecruit}>팀 모으러 가기</button>
        <button className="btn btn--ghost btn--sm" style={{ width: '100%', marginTop: 8 }} onClick={onOrders}>주문내역 보기</button>
      </div>
    </section>
  )
}

/* ── ② 공동구매 상세 ──────────────────────────────────────────
   마감이 실재한다(회차제 — 서버가 크롤 시각을 원점으로 계산). 시각은 사실 표시로 보여준다.
   "확률이 오릅니다" 대신 "환불 인원이 늘어납니다"로 쓴다 — 단조 증가하는 것은 p가 아니라 R이다. */
function GroupScreen({ deal, onBack }) {
  const [joined, setJoined] = useState(false)
  return (
    <>
      <button type="button" className="backrow" onClick={onBack}>‹ 올박스 목록</button>
      <section className="hero hero--flat">
        {deal.image && <img className="hero__img" src={deal.image} alt="" loading="lazy" />}
        <h2 className="hero__t">{deal.title}</h2>
        <p className="hero__s">{deal.subtitle}</p>
        <DeadlineTicker deadlineAt={deal.deadlineAt} label={`${deal.round}회차 마감까지`} size="lg" />
      </section>

      <section className="pricebox">
        <b className="pricebox__big">{deal.price.big}</b>
        <span className="pricebox__sub">{deal.price.sub}</span>
        <span className="pricebox__floor">{deal.ceilLine}</span>
      </section>

      <section className="hsec">
        <header className="shead"><h2>인원이 모이면 무슨 일이 생기나요</h2></header>
        <p className="lead">
          참여자 전원이 같은 값에 삽니다. 모인 인원의 마진이 쌓여
          <b> 일부 인원의 전액 환불 재원</b>이 됩니다. {deal.dirLine}.
        </p>
        <div className="tablewrap">
          <table>
            <thead><tr><th>모인 인원</th><th>전액 환불</th><th>비율</th></tr></thead>
            <tbody>
              {deal.milestones.map((m) => (
                <tr key={m.M}>
                  <td className="n">{`${m.M.toLocaleString('ko-KR')}명`}</td>
                  <td className="n">{`${m.R.toLocaleString('ko-KR')}명`}</td>
                  <td className="n hi">{m.pct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dim">표의 값은 서버가 계산합니다 — 재원(마진×인원−고정비)을 값으로 나눈 몫이라 세면 맞습니다.</p>
      </section>

      <div className="cta">
        {!joined ? (
          <button className="btn btn--go" onClick={() => setJoined(true)}>{deal.cta}</button>
        ) : (
          <div className="notice">
            <h3>참여가 접수되었습니다 <SimBadge what="참여 — 집계는 저장되지 않습니다" /></h3>
            <p>마감 시점의 인원으로 환불 인원이 확정됩니다. 이 데모는 참여 집계를 저장하지 않습니다.</p>
          </div>
        )}
        <p className="cta__note">공동구매가는 정가를 넘지 않습니다 — 이 조건은 코드 self-check가 검사합니다</p>
      </div>
    </>
  )
}

/* ── ③ 0원 응모 상세 ─────────────────────────────────────────
   마감이 실재한다(그날 자정 KST — 서버 계산). 사람이 늘수록 확률이 내려가는 대비군이다.
   초대 문구를 쓰지 않는다 — 이 형식에서 초대는 서로의 확률을 낮춘다. 하락 고지만 남긴다. */
function DailyScreen({ deal, onBack }) {
  const [entered, setEntered] = useState(false)
  return (
    <>
      <button type="button" className="backrow" onClick={onBack}>‹ 올박스 목록</button>
      <section className="hero hero--flat">
        {deal.image && <img className="hero__img" src={deal.image} alt="" loading="lazy" />}
        <h2 className="hero__t">{deal.title}</h2>
        <p className="hero__s">{deal.subtitle}</p>
        <DeadlineTicker deadlineAt={deal.deadlineAt} label="오늘 자정 마감까지" size="lg" />
      </section>

      <section className="pricebox pricebox--sale">
        <span className="pricebox__strike">
          <em>{deal.price.discount}</em>
          <s>{deal.price.strike}</s>
        </span>
        <b className="pricebox__big">{deal.price.big}</b>
        <span className="pricebox__sub">{deal.price.sub}</span>
      </section>

      <section className="hsec">
        <header className="shead"><h2>응모자가 늘면 어떻게 되나요</h2></header>
        <p className="lead">
          특가 수는 <b>{deal.oddsLine.split(' · ')[0]}</b>로 정해져 있습니다.
          {' '}{deal.dirLine} — 팀 뽑기와 <b>반대 방향</b>입니다.
          같은 규칙(재고 ÷ 참여)에서 재고를 공유하면 오르고, 나누면 내려갑니다.
        </p>
        <div className="tablewrap">
          <table>
            <thead><tr><th>응모자</th><th>당첨</th><th>확률</th></tr></thead>
            <tbody>
              {deal.table.map((r) => (
                <tr key={r.E}>
                  <td className="n">{`${r.E.toLocaleString('ko-KR')}명`}</td>
                  <td className="n">{r.freq.split('중 ')[1]}</td>
                  <td className="n hi">{r.pct}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dim">당첨된 사람은 빼면서 뽑고, 뽑기 기록을 공개해 같은 조건이면 결과를 다시 확인할 수 있어요.</p>
      </section>

      <div className="cta">
        {!entered ? (
          <button className="btn btn--go" onClick={() => setEntered(true)}>{deal.cta}</button>
        ) : (
          <div className="notice">
            <h3>응모가 접수되었습니다 <SimBadge what="응모 — 집계는 저장되지 않습니다" /></h3>
            <p>자정에 응모하신 분들 중에서 한 분씩 빼면서 뽑습니다. 결과 알림은 이 MVP에서 구현하지 않았습니다.</p>
          </div>
        )}
        <p className="cta__note">응모에는 비용이 들지 않습니다 · 당첨 시 1,000원에 구매합니다</p>
      </div>
    </>
  )
}

/* ── ① 참여 후 — 모집 → 준비 → 개봉 → 교환 ─────────────────── */
function TeamFlow(p) {
  const { sel, room, me, teamSize, busy, gateMsg, onMyReady, onTrade, onSheet, oripa } = p
  const [vs, setVs] = useState(false)
  const { box, odds } = sel
  const live = room?.live
  const left = live ? live.left : box.N
  const myResult = room?.openResults?.find((x) => x.memberId === me)
  const myTrade = room?.trade?.results.find((x) => x.memberId === me)
  const members = room ? room.members.map((m) => ({ ...m, sim: m.id !== me })) : []
  const iAmReady = !!room?.members.find((m) => m.id === me)?.ready
  const inbox = (room?.requests ?? []).filter((q) => q.to === me)
  const joining = (room?.members.length ?? 0) < teamSize

  return (
    <>
      <button type="button" className="backrow" onClick={p.onBackToList}>‹ 올박스 목록</button>
      <section className="hsec">
        <header className="shead"><h2>{room?.opened ? '개봉 완료' : '팀 모으는 중'}</h2></header>
        <MemberRail members={members} teamMax={teamSize}
          readyCount={room?.readyCount ?? 0} phase={room?.opened ? 'join' : 'ready'} />
        {!room?.opened && (
          <p className="dim">
            {joining
              ? `${members.length} / ${teamSize}명 · 시뮬 팀원이 차례로 들어옵니다`
              : `${members.length}명 모임 · 준비 ${room?.readyCount ?? 0} / ${members.length}명`}
            {' · '}<SimBadge what="나 외 팀원" />
          </p>
        )}
        {!room?.opened && room?.id && (
          <InviteBox roomId={room.id} teamMax={teamSize} joined={room.members.length} />
        )}
        <Gauge num={live?.drawn ?? 0} den={box.N}
          label={live?.drawn
            ? `이 박스에서 빠진 카드 ${live.drawn.toLocaleString('ko-KR')} / ${box.N.toLocaleString('ko-KR')}`
            : `아직 아무도 뽑지 않은 박스 · 남은 카드 ${left.toLocaleString('ko-KR')} / ${box.N.toLocaleString('ko-KR')}`} />
      </section>

      {!room?.opened && (
        <>
          <section className="hsec" id="sec-pick">
            <header className="shead"><h2>원하는 카드를 고르세요</h2></header>
            <p className="lead">
              갖고 싶은 카드를 찍어두세요. <b>교환할 때 1순위</b>가 됩니다. 찍는다고 뽑힐 확률이 오르진 않아요.
            </p>
            <div className="cardlist">
              {p.cards.slice(0, 12).map((c) => (
                <CardPick key={c.id} card={c} picked={p.myTarget === c.id}
                  onPick={p.onPick} count={room?.targets?.[c.id] ?? 0} />
              ))}
            </div>
            <p className="dim">
              서로 다른 걸 원해야 바꿀 게 생겨요. 팀원들의 취향은 각자 정해져 있어요 · <SimBadge what="팀원 취향" />
            </p>
          </section>

          <div className="cta">
            <button className="btn btn--go" onClick={onMyReady} disabled={busy === 'ready' || iAmReady}>
              {iAmReady ? '준비 완료 — 팀을 기다리는 중' : '준비 완료'}
            </button>
            <p className="cta__note">전원이 준비하면 자동으로 열립니다 · 한 명이라도 안 되면 서버가 열어주지 않아요</p>
          </div>
          {gateMsg && gateMsg.waiting?.length > 0 && (
            <div className="notice notice--warn">
              <h3>{`아직 ${gateMsg.waiting.length}명이 준비하지 않았어요`}</h3>
              <p>{`${gateMsg.waiting.join(', ')} — 전원이 준비해야 박스가 열립니다. 이 판정은 서버가 합니다.`}</p>
            </div>
          )}
        </>
      )}

      {room?.opened && (
        <>
          <section className="hsec" id="sec-open">
            <ul className="rv__list">
              {room.openResults.map((r, i) => (
                <RevealCard key={r.memberId} r={r} mine={r.memberId === me} fee={box.fee} delay={i * 60}
                  onRequest={p.onSwapRequest} onCheer={p.onCheer} busy={busy}
                  asked={(room.requests ?? []).some((q) => q.from === me && q.to === r.memberId)}
                  cheered={(room.cheers ?? []).some((c) => c.from === me && c.to === r.memberId)} />
              ))}
            </ul>
            <div className="notice">
              <h3>뽑힌 카드는 박스에서 빠져요</h3>
              <p>
                {`한 명씩 뽑을 때마다 남은 카드가 줄고 확률이 올라갑니다. 지금 ${left.toLocaleString('ko-KR')}장 남았어요. `}
                <b>안 나올수록 다음 사람 확률이 실제로 높아집니다.</b>
              </p>
            </div>
          </section>

          <section className="hsec" id="sec-trade">
            {/* 교환 요청은 위 결과 카드에서 바로 한다. 여기는 **받은 요청**과
                1:1로 못 푸는 고리를 정리하는 '한 번에 맞추기'만 남긴다. */}
            {!room.trade ? (
              <>
                {inbox.length > 0 && (
                  <>
                    <header className="shead"><h2>{`교환 요청 ${inbox.length}건`}</h2></header>
                    <div className="swap__inbox">
                      {inbox.map((q) => {
                        const who = room.members.find((m) => m.id === q.from)
                        const theirs = p.cardById.get(room.holdings?.[q.from])
                        const ours = p.cardById.get(room.holdings?.[me])
                        return (
                          <div key={q.from} className="swapreq">
                            <p className="swapreq__t"><b>{who?.name ?? q.from}</b>님이 교환을 요청했어요</p>
                            <p className="swapreq__d">
                              {`${theirs?.name?.slice(0, 20) ?? '카드'} (${won(theirs?.price ?? 0)})`}
                              {' ↔ '}
                              {`내 ${ours?.name?.slice(0, 20) ?? '카드'} (${won(ours?.price ?? 0)})`}
                            </p>
                            <div className="swapreq__b">
                              <button type="button" className="btn btn--go btn--sm"
                                onClick={() => p.onSwapRespond(q.from, true)} disabled={!!busy}>수락</button>
                              <button type="button" className="btn btn--ghost btn--sm"
                                onClick={() => p.onSwapRespond(q.from, false)} disabled={!!busy}>거절</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                {p.swapMsg && <p className="swapmsg">{p.swapMsg}</p>}
                <div className="cta">
                  <button className="btn btn--go" onClick={onTrade} disabled={busy === 'trade'}>
                    {busy === 'trade' ? '맞추는 중…' : '한 번에 맞추기'}
                  </button>
                  <p className="cta__note">
                    {`성사된 직접 교환 ${room.swaps?.length ?? 0}건 · 서로 엇갈려 1:1로 안 풀리는 것은 고리로 풀어드려요`}
                  </p>
                </div>
              </>
            ) : (
              <>
                <header className="shead"><h2>교환 결과</h2></header>
                <h3 className="sub">성립한 교환 고리</h3>
                <CycleView cycles={room.trade.cycles} />
                <TradeTable results={room.trade.results} me={me} />
                <div className="notice">
                  <h3>아무도 손해 보지 않아요</h3>
                  <p>
                    {`이번에 ${room.trade.improvedCount}명이 원하던 쪽으로 갔고, 손해 본 사람은 ${room.trade.noneWorse ? '없습니다' : '있습니다'}.`}
                    <b> 바꾸기 전보다 나빠지는 일은 구조상 생기지 않습니다.</b>{' '}
                    <button type="button" className="linklike" onClick={onSheet}>왜 그런가요?</button>
                  </p>
                </div>
              </>
            )}
          </section>

          {/* 오리파 대조는 **검증하고 싶은 사람**을 위한 정보다.
              구매 흐름에 늘 펼쳐 두면 소비자에게는 논쟁으로 읽힌다.
              ⓘ로 접어 두고, 누른 사람에게만 보여준다. */}
          <section className="hsec" id="sec-vs">
            <button type="button" className="infotoggle" onClick={() => setVs((v) => !v)}
              aria-expanded={vs}>
              <span className="infotoggle__i" aria-hidden="true">i</span>
              <span className="infotoggle__t">오리파와 뭐가 다른가요</span>
              <span className="infotoggle__go" aria-hidden="true">{vs ? '▲' : '▼'}</span>
            </button>
            {vs && (
              <>
            <div className="tablewrap compare">
              <table>
                <thead>
                  <tr><th> </th><th>오리파</th><th>혼자</th><th>{`팀 ${room.members.length}명`}</th></tr>
                </thead>
                <tbody>
                  <tr><td>구성 공개</td><td className="unknown">✗</td><td>✓</td><td>✓</td></tr>
                  <tr>
                    <td>공시 확률</td><td className="unknown">?</td>
                    <td className="n">{odds[0].soloPct}</td>
                    <td className="n hi">{odds[0].team[room.members.length - 1].pct}</td>
                  </tr>
                  <tr>
                    <td>받은 것</td><td className="unknown">?</td>
                    <td className="n">{myResult ? `${myResult.tier} · ${won(myResult.price)}` : '—'}</td>
                    <td className="n">{myTrade?.after ? `${myTrade.after.tier} · ${won(myTrade.after.price)}` : (myResult ? `${myResult.tier} · ${won(myResult.price)}` : '—')}</td>
                  </tr>
                  <tr>
                    <td>교환</td><td className="unknown">불가</td><td>불가</td>
                    <td className="n">{room.trade ? `${room.trade.improvedCount}명 개선` : '아직'}</td>
                  </tr>
                  <tr><td>꽝</td><td className="unknown">?</td><td>없음</td><td>없음</td></tr>
                </tbody>
              </table>
            </div>
            <div className="notice">
              <h3>물음표는 채울 수가 없어요</h3>
              <p>
                {`오리파는 확률을 공개하지 않습니다. 저희가 직접 ${oripa.total}건을 확인했는데 확률을 적어 둔 건 ${oripa.probNum}건이었어요. `}
                <b>모르는 칸을 그럴듯한 숫자로 채우지 않았습니다.</b>
              </p>
            </div>
              </>
            )}
            <p className="seed">{`추첨 시드 ${room.id}|${room.boxId}|${me}|${room.round}`}{room.trade && ` · 교환 시드 ${room.trade.seed}`}</p>
          </section>
        </>
      )}
    </>
  )
}

/* ── 올박스 탭 라우터 ─────────────────────────────────────── */
function OlboxTab(p) {
  const { deals, phase, deal, sel } = p
  if (phase === 'list' || !deal) return <DealListScreen deals={deals} sel={sel} onOpenDeal={p.onOpenDeal} />
  if (deal.kind === 'group') return <GroupScreen deal={deal} onBack={p.onBackToList} />
  if (deal.kind === 'daily') return <DailyScreen deal={deal} onBack={p.onBackToList} />
  if (phase === 'detail') {
    return <TeamDetail sel={sel} deal={deal} teamSize={p.teamSize} setTeamSize={p.setTeamSize}
      busy={p.busy} onBack={p.onBackToList} onBuy={p.onBuy} onSheet={p.onSheet} />
  }
  if (phase === 'team') {
    return <TeamSetupScreen sel={sel} deal={deal} teamSize={p.teamSize} setTeamSize={p.setTeamSize}
      busy={p.busy} onBack={() => p.setPhase('detail')} onNext={p.onTeamNext} />
  }
  if (phase === 'checkout') {
    return <CheckoutScreen sel={sel} teamSize={p.teamSize} busy={p.busy}
      onBack={() => p.setPhase(p.teamSize > 1 ? 'team' : 'detail')} onPay={p.onPay} />
  }
  if (phase === 'ordered') {
    return <OrderDoneScreen sel={sel} room={p.room} deal={deal}
      onRecruit={p.onRecruit} onOrders={p.onOrders} />
  }
  return <TeamFlow {...p} />
}

/* ── 개봉 카운트다운 — 기다리는 순간 ──────────────────────────
   v1이 갖고 있던 연출. 결과를 바로 띄우지 않고 3·2·1을 센다. */
function CountDown({ n }) {
  return (
    <div className="count" role="status" aria-live="polite">
      <span className="count__n">{n > 0 ? n : '개봉'}</span>
      <span className="count__t">{n > 0 ? '박스를 여는 중' : ''}</span>
    </div>
  )
}

/* ── 앱 ────────────────────────────────────────────────────── */
export default function App() {
  const [boxes, setBoxes] = useState(null)
  const [err, setErr] = useState(null)
  const [tab, setTab] = useState('home')
  const [teamSize, setTeamSize] = useState(10)
  const [room, setRoom] = useState(null)
  const [me, setMe] = useState(null)
  const [busy, setBusy] = useState('')
  const [gateMsg, setGateMsg] = useState(null)
  const [scene, setScene] = useState(null)
  const [phase, setPhase] = useState('list')     // list → detail → checkout → ordered → flow
  const [dealId, setDealId] = useState(null)
  const [count, setCount] = useState(null)       // 3 · 2 · 1 · 0
  const [sheet, setSheet] = useState(false)
  const [teamMode, setTeamMode] = useState('open')
  const [search, setSearch] = useState(false)
  const [q, setQ] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchBusy, setSearchBusy] = useState(false)
  const [recent, setRecent] = useState(() => loadRecent())
  const [swapMsg, setSwapMsg] = useState(null)
  const countTimer = useRef(null)
  const timer = useRef(null)
  const opening = useRef(false)
  const prefsDone = useRef(false)
  const [, setReveal] = useState(null)

  useEffect(() => {
    api('/api/boxes').then(({ ok, data }) => (ok ? setBoxes(data) : setErr('구성을 불러오지 못했습니다.')))
    // 새로고침 복구 — 식별자만 저장돼 있고 상태는 서버에서 다시 읽는다(I1).
    const saved = loadOrder()
    if (saved?.roomId) {
      api('/api/room', { action: 'state', roomId: saved.roomId }).then((r) => {
        if (r.ok && r.data?.id) {
          setRoom(r.data); setMe(saved.me)
          setDealId(r.data.boxId); setPhase('flow')
          if (r.data.opened) opening.current = true
        } else clearOrder()   // memory 폴백·TTL로 방이 사라졌을 수 있다 — 조용히 새 시작
      })
    }
    return () => { clearInterval(timer.current); clearInterval(countTimer.current) }
  }, [])

  const deal = useMemo(() => boxes?.deals.find((d) => d.id === dealId) ?? null, [boxes, dealId])
  const sel = useMemo(() => {
    if (!boxes) return null
    return boxes.boxes.find((b) => b.box.id === dealId) ?? boxes.boxes[0]
  }, [boxes, dealId])

  const cards = useMemo(
    () => (sel ? sel.box.tiers.flatMap((t) => t.cards.map((c) => ({ ...c, tier: t.tier }))) : []),
    [sel]
  )
  /** 카드 id → 카드. 교환 보드가 "누가 무엇을 들고 있는가"를 그릴 때 쓴다. */
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const homeCards = useMemo(
    () => (boxes ? boxes.boxes[0].box.tiers.flatMap((t) => t.cards.map((c) => ({ ...c, tier: t.tier }))) : []),
    [boxes]
  )
  const myTarget = room?.members.find((m) => m.id === me)?.target ?? null

  const act = useCallback(async (body) => {
    const r = await api('/api/room', body)
    if (r.data?.id) setRoom(r.data)
    return r
  }, [])

  /** 결제 → 방(주문) 생성. 주문번호는 서버가 발급한다. */
  const onPay = useCallback(async () => {
    setBusy('pay')
    const c = await api('/api/room', { action: 'create', name: '나', boxId: dealId })
    if (!c.ok) { setErr('방을 만들지 못했습니다.'); setBusy(''); return }
    setMe(c.data.you)
    setRoom(c.data)
    saveOrder({ roomId: c.data.id, me: c.data.you })
    setBusy('')
    setPhase('ordered')
  }, [dealId])

  /**
   * 모집·준비·개봉의 시간차 연출을 하나의 효과가 몬다.
   *   인원이 모자라면 → 시뮬 팀원 1명 입장 (1.2초)
   *   전원 모였으면   → 준비 안 한 시뮬 1명 준비 (0.9초)
   *   전원 준비면     → 자동 개봉 (판정은 서버가 한다 — I8)
   * 이전 버전은 for 루프로 9명을 즉시 넣어 모집이 0초였다. 모집이 0초면 모집이 아니다.
   */
  useEffect(() => {
    if (phase !== 'flow' || !room || room.opened || opening.current) return undefined
    if (room.members.length < teamSize) {
      const t = setTimeout(() => act({ action: 'join', roomId: room.id, name: nickOf(room.id, room.members.length) }), 1200)
      return () => clearTimeout(t)
    }
    // 전원 모이면 시뮬 팀원의 취향을 자동으로 깐다. 버튼 뒤에 숨겨두면
    // "선호가 전원 동질 → 교환 0건" 함정을 보는 사람이 그대로 밟는다 — 실측된 함정이다.
    if (!prefsDone.current) {
      prefsDone.current = true
      act({ action: 'simPrefs', roomId: room.id, memberId: me })
      return undefined
    }
    // 준비 순서를 섞는다 — 입장 순서대로 준비하면 사람이 아니라 루프로 보인다
    const idle = room.members
      .filter((m) => m.id !== me && !m.ready)
      .sort((a, b) => hash(room.id + a.id) - hash(room.id + b.id))[0]
    if (idle) {
      const t = setTimeout(() => act({ action: 'ready', roomId: room.id, memberId: idle.id, ready: true }), 900)
      return () => clearTimeout(t)
    }
    if (room.allReady) { opening.current = true; onOpen() }
    return undefined
    // eslint 없음 — onOpen은 아래 선언이지만 함수 선언 호이스팅으로 안전하다
  }, [phase, room, teamSize, me]) // eslint-disable-line

  const onPick = (cardId) => act({ action: 'target', roomId: room.id, memberId: me, cardId })

  /**
   * 내 준비. 전원 준비 전에도 열기를 **실제로 호출한다** — 서버가 409를 내는 경로가
   * 존재한다는 것이 주장이므로, 프론트에서 버튼만 막아 두면 그 주장이 증명되지 않는다(I8).
   * 폰에는 사람 말로("아직 3명이…"), OPS 레일에는 원문(409)으로 나눠 보여준다.
   */
  const onMyReady = async () => {
    setBusy('ready')
    const r = await act({ action: 'ready', roomId: room.id, memberId: me, ready: true })
    if (r.ok && !r.data.allReady) {
      const o = await api('/api/room', { action: 'open', roomId: room.id })
      if (o.status === 409) {
        setGateMsg({ status: 409, error: o.data.error, waiting: o.data.waiting })
        if (o.data.id) setRoom(o.data)
      }
    }
    setBusy('')
  }

  async function onOpen() {
    setGateMsg(null)
    const r = await api('/api/room', { action: 'open', roomId: room.id })
    if (r.status === 409) {
      opening.current = false
      setGateMsg({ status: 409, error: r.data.error, waiting: r.data.waiting })
      if (r.data.id) setRoom(r.data)
      return
    }
    if (!r.ok) { opening.current = false; return }
    const data = r.data
    const mine = data.openResults.find((x) => x.memberId === me)
    const total = data.openResults.length
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setRoom(data); setReveal(total); setScene(mine); return }

    // 3 · 2 · 1 → 개봉. 결과를 바로 띄우지 않는다 — 기다리는 순간이 이 제품의 절정이다.
    setCount(3)
    let c = 3
    countTimer.current = setInterval(() => {
      c -= 1
      setCount(c)
      if (c > 0) return
      clearInterval(countTimer.current)
      setTimeout(() => {
        setCount(null)
        setRoom(data)
        setReveal(0)
        let k = 0
        timer.current = setInterval(() => {
          k += 1; setReveal(k)
          if (k >= total) { clearInterval(timer.current); setScene(mine) }
        }, 200)
      }, 620)
    }, 800)
  }

  const onSearch = async (text) => {
    setSearchBusy(true); setSearchResult(null)
    const next = [text, ...recent.filter((t) => t !== text)].slice(0, 8)
    setRecent(next); saveRecent(next)
    const r = await api(`/api/search?q=${encodeURIComponent(text)}`)
    setSearchResult(r.ok ? r.data : { q: text, count: 0, total: 875, items: [] })
    setSearchBusy(false)
  }

  const onTrade = async () => {
    setBusy('trade')
    await act({ action: 'trade', roomId: room.id })
    setBusy('')
  }

  const onSwapRequest = async (targetId) => {
    setBusy('swap')
    await act({ action: 'swapRequest', roomId: room.id, memberId: me, targetId })
    setBusy('')
  }

  const onCheer = async (targetId) => {
    await act({ action: 'cheer', roomId: room.id, memberId: me, targetId })
  }

  const onSwapRespond = async (fromId, accept) => {
    setBusy('swap')
    await act({ action: 'swapRespond', roomId: room.id, memberId: me, fromId, accept })
    setBusy('')
  }

  /**
   * 시뮬 팀원의 응답 — 내가 보낸 요청에 사람처럼 답한다.
   * 방 id로 시드를 만들어 **같은 방에서는 같은 판단**이 나오게 한다.
   * 실제 사용자라면 이 자리를 그 사람이 채운다(그래서 시뮬 배지를 단다).
   */
  useEffect(() => {
    if (!room?.opened || room.trade) return undefined
    const pending = (room.requests ?? []).filter((q) => q.from === me)
    if (!pending.length) return undefined
    const q = pending[0]
    const t = setTimeout(() => {
      /* 사람의 판단을 흉내낸다.
         시세만으로 거절하게 두면 내 카드가 더 비쌀 때만 성사돼 데모에서 거의 항상 거절된다.
         실제로 사람은 **자기 취향**으로 받는다 — 싼 카드를 더 원할 수도 있다.
         그래서 방·상대로 시드를 만들어 약 60%를 수락하게 한다. 시뮬이므로 배지를 단다. */
      const accept = hash(`${room.id}|${q.to}|swap`) % 100 < 60
      const who = room.members.find((m) => m.id === q.to)?.name ?? '상대'
      api('/api/room', { action: 'swapRespond', roomId: room.id, memberId: q.to, fromId: me, accept })
        .then((r) => {
          if (r.data?.id) setRoom(r.data)
          setSwapMsg(accept ? `${who}님이 교환을 수락했어요` : `${who}님이 이번 교환은 거절했어요`)
          setTimeout(() => setSwapMsg(null), 3200)
        })
    }, 1600)
    return () => clearTimeout(t)
  }, [room, me, cardById])



  if (err) return <div className="stage"><div className="phone"><div className="empty"><p>{err}</p><p className="empty__sub">새로고침해 주세요.</p></div></div></div>
  if (!boxes) return <div className="stage"><div className="phone"><div className="empty"><p>구성을 불러오는 중…</p></div></div></div>

  const olboxProps = {
    deals: boxes.deals, deal, sel, phase, setPhase,
    room, me, teamSize, setTeamSize, cards, cardById, myTarget,
    busy, gateMsg, swapMsg, oripa: boxes.oripa,
    onOpenDeal: (d) => {
      // 진행 중인 내 주문(같은 통)이 있으면 그 흐름으로 돌아간다 — 주문이 사라지지 않게
      setDealId(d.id)
      if (room && room.boxId === d.id) setPhase('flow')
      else setPhase('detail')
    },
    onBackToList: () => setPhase('list'),
    onBuy: (how) => {
      // 혼자면 인원이 1로 확정되고 주문서로 직행한다.
      // 팀이면 인원을 팀 모으기 화면에서 고르므로 여기서 정하지 않는다.
      if (how === 'solo') { setTeamSize(1); setPhase('checkout') }
      else { setTeamSize((n) => (n > 1 ? n : 10)); setPhase('team') }
    },
    onTeamNext: (mode) => { setTeamMode(mode); setPhase('checkout') },
    onPay,
    onRecruit: () => setPhase('flow'),
    onOrders: () => setTab('me'),
    onPick, onMyReady, onTrade, onSwapRequest, onSwapRespond, onCheer, cardById,
    onSheet: () => setSheet(true),
  }

  return (
    <>
      <Shell tab={tab} setTab={setTab}
        brief={<BriefRail box={sel.box} oripa={boxes.oripa} crawl={875} />}
        ops={<OpsRail sel={sel} conversion={boxes.conversion} room={room} teamSize={teamSize} gateMsg={gateMsg} />}
        overlay={
          /* 폰 프레임 **안에** 뜨는 것들. 밖에 두면 오버레이가 뷰포트 전체를 덮는다. */
          count !== null ? <CountDown n={count} />
            : scene ? <RevealScene r={scene} fee={sel.box.fee} onClose={() => setScene(null)} />
              : search ? (
                <SearchScreen
                  onClose={() => setSearch(false)} onSearch={onSearch}
                  suggest={boxes.suggest ?? []} recent={recent}
                  onClearRecent={() => { setRecent([]); saveRecent([]) }}
                  result={searchResult} busy={searchBusy} q={q} setQ={setQ}
                  picks={homeCards.slice(0, 6)} />
              ) : null
        }>
        {tab === 'home' && <HomeTab cards={homeCards} deals={boxes.deals} onGoOlbox={() => setTab('olbox')}
          onOpenSearch={() => { setSearch(true); setSearchResult(null); setQ('') }} />}
        {tab === 'olbox' && <OlboxTab {...olboxProps} />}
        {tab === 'content' && <StubTab title="콘텐츠" body="이 과제에서는 구현하지 않았습니다." />}
        {tab === 'wish' && <StubTab title="관심상품" body="이 과제에서는 구현하지 않았습니다." />}
        {tab === 'me' && <MeTab room={room} sel={sel} me={me} onGoOlbox={() => setTab('olbox')} />}
      </Shell>
      {sheet && <HonestySheet sel={sel} conversion={boxes.conversion} oripa={boxes.oripa}
        room={room} teamSize={teamSize} onClose={() => setSheet(false)} />}
    </>
  )
}
