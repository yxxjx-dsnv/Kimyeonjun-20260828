/**
 * 올박스 — 통이 보이는 팀 뽑기.
 *
 * ## 화면 구조 (v1의 앱 셸을 되살렸다)
 *   왼쪽  BriefRail  무엇을 왜 만들었나 (데스크톱 1180px↑)
 *   가운데 phone      **실제 유저가 보는 그대로**. 올웨이즈 앱 문법 + 하단 탭바
 *   오른쪽 OpsRail    확률이 어디서 나오는지, 지금 값이 얼마인지 (심사자·운영자용)
 *
 * v2 재구축 때 이 셸을 통째로 버리고 넓은 문서형 화면으로 만들었던 적이 있다.
 * 제품이 올웨이즈 앱 **안의 기능**인데 데스크톱 문서로 보여주면 그 사실이 사라진다.
 * 셸은 되살리고, 그 안의 내용만 v2 엔진으로 바꾼다.
 *
 * v1에서 되살리지 않은 것과 이유:
 *   카운트다운("오늘 마감까지 …")  희소성 압박 금지(I10). v2엔 데일리가 없어 가리킬 대상도 없다
 *   형식 칩 5개                   MVP를 팀 뽑기 1형식으로 좁혔다(올웨이즈에 0원딜·다인딜이 이미 있다)
 *   확률 배수(×2.8)·천장           재고=상한과 모순이었다. 초기하분포가 배수 없이 팀 효과를 준다
 *   화면에서의 확률 계산            서버가 만든 문자열만 렌더한다(I4)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  won, Delta, TIERS, TIER_LABEL, Rarity, Badge, SimBadge,
  ProductCard, BoxGrid, GridLegend, TierShowcase, MemberRail,
  RevealScene, RevealCard, TasteChat, OddsTable, UpdateTable,
  CardPick, CycleView, TradeTable,
  IconHome, IconContent, IconHeart, IconUser, IconBox, IconCart, IconSearch,
} from './parts.jsx'

const TABS = [
  { id: 'home', label: '홈', Icon: IconHome },
  { id: 'content', label: '콘텐츠', Icon: IconContent },
  { id: 'olbox', label: '올박스', Icon: IconBox, center: true },
  { id: 'wish', label: '관심상품', Icon: IconHeart },
  { id: 'me', label: '내 정보', Icon: IconUser },
]

const SIM_NAMES = ['민서', '지호', '서연', '도윤', '하은', '준우', '수아', '시우', '나윤']

const api = async (path, body) => {
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : undefined)
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

/* ── 좌측 배경 레일 (데스크톱) ────────────────────────────────
   폰 셸이 448px이라 넓은 화면에서 양옆이 빈다. 그 자리를 설명에 쓴다.
   왼쪽은 '무엇을 왜 만들었나', 오른쪽은 '지금 화면의 실시간 수치와 근거'. */
function BriefRail({ box, oripa, crawl }) {
  return (
    <aside className="brief" aria-label="과제 설명">
      <p className="brief__tag">레브잇 올웨이즈 직무 과제</p>
      <h2 className="brief__h">올박스 — 통이 보이는 팀 뽑기</h2>
      <p className="brief__lead">
        오리파의 문제는 확률이 낮은 것이 아닙니다.
        <b> 통이 안 보이는 것</b>입니다. 통이 안 보이면 확률은 검증할 수 없는 주장일 뿐입니다.
      </p>

      <section className="brief__sec">
        <h3>컬처 시그널</h3>
        <p className="brief__p">
          <b>포켓몬 카드 열풍</b>. 2026년은 출시 30주년입니다.
          크림 TCG 거래액이 1~4월 전년 대비 <b>+5,625%</b>,
          용산 아이파크몰 카드숍에 발매일 개점 전 <b>600여 명</b>이 줄을 섰습니다.
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
          통 구성 · 교환 선호 · ChatGPT 입력 <b>세 곳</b>에 씁니다.
        </p>
        <p className="brief__dim">
          상품 가격이 바뀌면 통도 확률도 함께 바뀝니다 — 크롤 데이터가 장식이 아니라 연산의 입력입니다.
        </p>
      </section>

      {/* ②번 축 — 왜 다른 커머스가 아니라 올웨이즈인가.
          이 논거가 없으면 "좋은 아이디어"이지 "올웨이즈에 정착한 기능"이 아니다. */}
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
          <li><b>통 공개</b> — {box ? `${box.N.toLocaleString('ko-KR')}구좌를 전부 그린다` : '통 전체를 그린다'}</li>
          <li><b>확률 검증</b> — 재고 ÷ 구좌. 세면 확인된다</li>
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

/* ── 실무자 모니터 (데스크톱 우측) ────────────────────────────
   유저 화면(폰)에서는 확률 세부를 계층 뒤로 내렸다. 대신 심사자·운영자가
   보는 이 패널이 수치를 전부 노출한다. 폰과 같은 서버 값을 쓰므로
   두 화면이 어긋날 수 없다. */
function OpsRail({ boxes, room, teamSize }) {
  const { box, odds, updates, conversion } = boxes
  const live = room?.live
  return (
    <aside className="ops" aria-label="실무자 실시간 지표">
      <p className="ops__tag">OPS · 실무자 화면</p>

      <section className="ops__sec">
        <h4 className="ops__h">확률이 어디서 나오나</h4>
        <div className="opsw">
          <div className="opsw__name">사람이 적는 자리가 없습니다</div>
          <p className="opsw__eq">
            {`P(등급) = 재고 ÷ 구좌\nP_team(g,n) = 1 − C(N−K,n) / C(N,n)`}
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
        <h4 className="ops__h">{`지금 통 상태`}</h4>
        <p className="ops__row">
          {live
            ? `남은 구좌 ${live.left.toLocaleString('ko-KR')} / ${box.N.toLocaleString('ko-KR')} · 뽑힌 ${live.drawn}개`
            : `${box.N.toLocaleString('ko-KR')}구좌 · 아직 아무도 뽑지 않음`}
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
      </section>

      <section className="ops__sec">
        <h4 className="ops__h">구좌가 빠지면 확률이 오릅니다</h4>
        <UpdateTable updates={updates} tiers={TIERS} />
        <p className="opsw__ref">
          —는 확률 0이 아니라 성립 불가능한 상태입니다. 990구좌가 빠졌는데 B등급 25장이 남을 수는 없습니다.
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
          지목과 ChatGPT는 편의 기능이 아니라 이 메커니즘의 하중을 받는 부품입니다.
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

const CATS = [
  { id: 'all', label: '전체' }, { id: 'card', label: '포켓몬카드' },
  { id: 'sealed', label: '박스상품' }, { id: 'grade', label: '그레이딩' },
]

/* ── 홈 탭 — 실제 올웨이즈 홈 구조 ────────────────────────── */
function HomeTab({ cards, box, onGoOlbox }) {
  const [cat, setCat] = useState('all')
  const shown = useMemo(() => {
    const c = cat === 'all' ? cards : cards.filter((x) => x.group === cat)
    return c.slice(0, 8)
  }, [cards, cat])
  return (
    <>
      <div className="hsearch">
        <IconSearch />
        <span className="top__q">포켓몬 카드</span>
      </div>

      {/* 골드박스 문법의 노란 히어로.
          v1에는 여기 "오늘 마감까지 18:16:19" 카운트다운이 있었다. 뺐다 —
          희소성 압박 금지(I10)이고, 데일리 형식이 없는 v2에는 가리킬 대상도 없다. */}
      <button type="button" className="goldhero" onClick={onGoOlbox}>
        <span className="goldhero__sub">통을 전부 보여주는 뽑기</span>
        <span className="goldhero__logo">
          올 <span className="goldhero__gift" aria-hidden="true"><IconBox /></span> 박스
        </span>
        <span className="goldhero__note">
          {box ? `이번 통은 포켓몬 카드 · ${box.N.toLocaleString('ko-KR')}구좌 전부 공개` : '통 전체 공개'}
        </span>
      </button>

      <div className="cats">
        {CATS.map((c) => (
          <button key={c.id} type="button"
            className={`cats__b ${cat === c.id ? 'is-on' : ''}`}
            onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>

      <section className="hsec">
        <header className="shead">
          <h2>지금 많이 찾는 카드</h2>
          <span className="shead__more">더보기 ›</span>
        </header>
        <div className="grid">
          {shown.map((it) => <ProductCard key={it.id} item={it} />)}
        </div>
      </section>

      <p className="hfoot">
        다나와에서 직접 수집한 상품입니다. 올박스의 통도 같은 데이터로 채웁니다.
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

/* ── 근거 시트 (v1의 바텀시트 문법, v2 내용) ─────────────────
   근거는 숨기는 게 아니라 요청했을 때 나와야 한다. 상세에는 지금 확률만 남기고
   유도 과정 전체를 여기로 옮긴다. */
function HonestySheet({ boxes, room, teamSize, onClose }) {
  const { box, odds, conversion, oripa } = boxes
  return (
    <div className="sheet" role="dialog" aria-label="확률이 어떻게 정해지나요">
      <div className="sheet__bar" />
      <button type="button" className="sheet__x" onClick={onClose} aria-label="닫기">✕</button>
      <h3>확률이 어떻게 정해지나요</h3>

      <p className="sheet__lead">
        확률표를 <b>사람이 적지 않습니다.</b> 재고를 구좌로 나눈 값이고,
        팀 효과는 비복원 추출의 성질에서 나옵니다. 화면과 추첨이 같은 값을 씁니다.
      </p>

      {/* 통 전체를 실제로 그린다. 오리파가 못 하는 것이 이것이고,
          소비자 화면이 아니라 "검증하고 싶은 사람"에게 보여줄 자리다. */}
      <section className="sheet__verify">
        <h4>{`${boxes.box.N.toLocaleString('ko-KR')}구좌를 전부 그렸습니다`}</h4>
        <BoxGrid slotTiers={boxes.slotTiers} drawn={room?.openResults?.map((r) => r.i) ?? []} />
        <GridLegend tiers={boxes.box.tiers} />
        <p className="sheet__lead">
          네모 하나가 구좌 하나입니다. 세어보시면 재고와 정확히 맞습니다.
          {room?.live && ` 지금 ${room.live.drawn}개가 빠져 ${room.live.left.toLocaleString('ko-KR')}구좌 남았습니다.`}
        </p>
      </section>

      <dl className="sheet__grid">
        <dt>⓪ 기본 확률 = 재고 ÷ 구좌</dt>
        <dd>
          {`통은 ${box.N.toLocaleString('ko-KR')}구좌입니다. 어떤 등급의 재고가 1장이면 확률은 ${odds[0].soloPct}입니다.`}
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

        <dt>② 뽑히면 통에서 빠집니다</dt>
        <dd>
          비복원입니다. 남은 구좌가 줄면 확률이 오릅니다.
          &ldquo;많이 안 나왔으니 이제 나올 때가 됐다&rdquo;는 생각은 매번 다시 채워넣는 방식에서는
          착각이지만 <b>빼고 나면 참</b>이 됩니다.
          <br />그래서 <b>천장 같은 장치를 만들지 않았습니다.</b> 통이 줄어드는 것 자체가 천장입니다.
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
        <li><b>정의</b> — 확률 = 재고 ÷ 구좌</li>
        <li><b>정의에서 유도</b> — 팀 확률(초기하분포), 비복원 갱신</li>
        <li><b>정리</b> — 교환의 네 가지 성질, 꽝 없음 2층</li>
        <li><b>실측</b> — 크롤 875건, 오리파 확률 미표기 {oripa ? `${oripa.probNum}/${oripa.total}건` : ''}</li>
        <li><b>설계 선택</b> — 통 구성, 참여비 {won(box.fee)}, 정원 {box.teamMax}명</li>
        <li><b>가정</b> — 타깃이 30~40대 부모라는 것, 통 원가를 시세로 둔 것</li>
        <li><b>미검증</b> — 교환이 진입장벽을 실제로 낮추는가</li>
      </ul>

      <h4>무엇이 시뮬레이션인가</h4>
      <p className="sheet__lead">
        팀원 · 팀원의 취향 · 10만 회 분포는 시뮬레이션입니다. 결제와 배송은 구현하지 않았습니다.
        <b> 추첨과 교환은 시뮬레이션이 아니라</b> 서버가 실제로 계산한 결과이고, 시드를 공개해 재현할 수 있습니다.
        {room?.trade && <><br /><code>{`교환 시드 ${room.trade.seed}`}</code></>}
      </p>
    </div>
  )
}

/* ── 올박스 탭 — 이 제품의 본체 ─────────────────────────────
   단계 칩으로 건너뛸 수 있게 하되, 순서대로 내려가면 그대로 3분 데모가 된다.
      통 보기 → 팀 모으기 → 지목·AI → 전원 개봉 → 교환 → 오리파와 대조 */
const STEPS = [
  ['sec-box', '통 보기'], ['sec-team', '팀'], ['sec-pick', '지목'],
  ['sec-open', '개봉'], ['sec-trade', '교환'], ['sec-vs', '오리파 대조'],
]

function OlboxTab(p) {
  const {
    boxes, room, me, teamSize, setTeamSize, cards, myTarget,
    busy, gateMsg, ai, reveal, phase,
    onJoinBox, onPick, onSimPrefs, onAsk, onReadyAll, onOpen, onTrade, onSheet,
  } = p
  const { box, odds, oripa } = boxes
  const live = room?.live
  const left = live ? live.left : box.N
  const myResult = room?.openResults?.find((x) => x.memberId === me)
  const myTrade = room?.trade?.results.find((x) => x.memberId === me)
  const members = room ? room.members.map((m) => ({ ...m, sim: m.id !== me })) : []

  /* ── 구매 전 — 무엇을 사는지 보여주고, 하단에 고정 CTA ────────
     v1은 목록 → 상세 → 참여 → 모집 → 개봉 → 결과의 단계 기계였다.
     v2가 한 스크롤로 합치면서 **사는 순간과 기다리는 순간**이 사라졌고,
     그게 이 제품에서 가장 만족스러웠던 부분이었다. 되살린다. */
  if (phase === 'detail') {
    return (
      <>
        <section className="hero">
          <div className="bcard">
            <span className="bcard__glow" aria-hidden="true" />
            {box.tiers[0].cards[0]?.image && (
              <img className="bcard__prize" src={box.tiers[0].cards[0].image} alt="" loading="lazy" />
            )}
            <span className="bcard__shine" aria-hidden="true" />
            <span className="bcard__body">
              <span className="bcard__name">포켓몬 카드 올박스</span>
              <span className="bcard__blurb">{`${box.N.toLocaleString('ko-KR')}구좌를 전부 보여드립니다`}</span>
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

        <section className="hsec">
          <header className="shead"><h2>이번 통에 뭐가 들어있나요</h2></header>
          <p className="lead"><b>전부 공개합니다.</b> 어떤 카드가 몇 장 들었는지, 시세가 얼마인지 다 보여드려요.</p>
          {box.tiers.map((t, i) => (
            <TierShowcase key={t.tier} tier={t} hero={t.tier === 'S'}
              pct={odds[i].soloPct} freq={odds[i].soloFreq} />
          ))}
          <button type="button" className="verify" onClick={onSheet}>
            <span className="verify__n">{`${box.N.toLocaleString('ko-KR')}구좌`}</span>
            <span className="verify__t">전부 그려서 보여드립니다 · 직접 세어보기</span>
            <span className="verify__go" aria-hidden="true">›</span>
          </button>
        </section>

        <section className="hsec">
          <header className="shead"><h2>친구랑 열수록 확률 UP</h2></header>
          <div className="notice">
            <h3>친구를 부르면 뭐가 달라지나요</h3>
            <p>
              같은 통에서 각자 한 구좌씩 뽑아요. 사람이 많을수록 <b>팀 안에 좋은 카드가 나올 확률</b>이 올라갑니다.
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
            {' 저희가 정한 숫자가 아니라 통에서 그냥 나오는 값이라, 반올림하지 않고 그대로 적었어요.'}
          </p>
        </section>

        {/* 고정 CTA — 사는 순간. v1이 갖고 있던 것. */}
        <div className="cta">
          <button className="btn btn--go" onClick={onJoinBox} disabled={busy === 'team'}>
            {busy === 'team' ? '참여하는 중…' : `${won(box.fee)} · ${teamSize}명으로 참여하기`}
          </button>
          <p className="cta__note">
            {`꽝 없음 · 어떤 카드가 나와도 ${won(box.fee)} 이상입니다`}
            {teamSize > 1 && <> · <SimBadge what={`팀원 ${teamSize - 1}명 자동 참여`} /></>}
          </p>
        </div>
      </>
    )
  }

  /* ── 참여 후 — 모집 → 준비 → 개봉 → 교환 ───────────────────── */
  return (
    <>
      <section className="hsec">
        <header className="shead"><h2>{room?.opened ? '개봉 완료' : '팀 모으는 중'}</h2></header>
        <MemberRail members={members} teamMax={room?.members.length ?? teamSize}
          readyCount={room?.readyCount ?? 0} phase={room?.opened ? 'join' : 'ready'} />
        <p className="dim">
          {`남은 구좌 ${left.toLocaleString('ko-KR')} / ${box.N.toLocaleString('ko-KR')}`}
          {' · '}<SimBadge what="나 외 팀원" />
        </p>
      </section>

      {!room?.opened && (
        <>
          <section className="hsec" id="sec-pick">
            <header className="shead"><h2>원하는 카드를 고르세요</h2></header>
            <p className="lead">
              갖고 싶은 카드를 찍어두세요. <b>교환할 때 1순위</b>가 됩니다. 찍는다고 뽑힐 확률이 오르진 않아요.
            </p>
            <div className="cardlist">
              {cards.slice(0, 12).map((c) => (
                <CardPick key={c.id} card={c} picked={myTarget === c.id}
                  onPick={onPick} count={room?.targets?.[c.id] ?? 0} />
              ))}
            </div>
            <div className="row">
              <button className="btn btn--ghost btn--sm" onClick={onSimPrefs} disabled={busy === 'sim'}>
                {busy === 'sim' ? '정하는 중…' : '팀원들 취향 정하기'}
              </button>
              <SimBadge what="팀원 취향" />
            </div>
            <p className="dim">서로 다른 걸 원해야 바꿀 게 생겨요.</p>
            <h3 className="sub">모르는 건 물어보세요</h3>
            <TasteChat onSubmit={onAsk} result={ai} busy={busy === 'ai'} />
          </section>

          <div className="cta">
            <button className="btn btn--go" onClick={onOpen} disabled={busy === 'open'}>
              {busy === 'open' ? '여는 중…' : '통 열기'}
            </button>
            {!room?.allReady && (
              <button className="btn btn--ghost btn--sm" style={{ width: '100%', marginTop: 8 }}
                onClick={onReadyAll} disabled={busy === 'ready'}>전원 준비시키기</button>
            )}
            <p className="cta__note">{`준비 ${room?.readyCount ?? 0} / ${room?.members.length ?? 0}명 · 전원이 눌러야 열려요`}</p>
          </div>
          {gateMsg && (
            <div className="notice notice--warn">
              <h3>{`서버 응답 ${gateMsg.status}`}</h3>
              <p>{gateMsg.error}{gateMsg.waiting?.length ? ` — 아직 안 누른 사람: ${gateMsg.waiting.join(', ')}` : ''}</p>
            </div>
          )}
        </>
      )}

      {room?.opened && (
        <>
          <section className="hsec" id="sec-open">
            <ul className="rv__list">
              {room.openResults.map((r, i) => (
                <RevealCard key={r.memberId} r={r} mine={r.memberId === me} fee={box.fee} delay={i * 60} />
              ))}
            </ul>
            <div className="notice">
              <h3>뽑힌 카드는 통에서 빠져요</h3>
              <p>
                {`한 명씩 뽑을 때마다 남은 구좌가 줄고 확률이 올라갑니다. 지금 ${left.toLocaleString('ko-KR')}구좌 남았어요. `}
                <b>안 나올수록 다음 사람 확률이 실제로 높아집니다.</b>
              </p>
            </div>
          </section>

          <section className="hsec" id="sec-trade">
            <header className="shead"><h2>안 나온 것은 팀 안에서 바꿉니다</h2></header>
            <p className="lead">팀에 나온 카드를 서로 바꿉니다. 원하는 사람에게 가도록 자동으로 맞춰드려요.</p>
            {!room.trade ? (
              <button className="btn btn--go" onClick={onTrade} disabled={busy === 'trade'}>
                {busy === 'trade' ? '교환 계산 중…' : '교환 실행'}
              </button>
            ) : (
              <>
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

          <section className="hsec" id="sec-vs">
            <header className="shead"><h2>오리파와 뭐가 다른가요</h2></header>
            <div className="tablewrap compare">
              <table>
                <thead>
                  <tr><th> </th><th>오리파</th><th>혼자</th><th>{`팀 ${room.members.length}명`}</th></tr>
                </thead>
                <tbody>
                  <tr><td>통 공개</td><td className="unknown">✗</td><td>✓</td><td>✓</td></tr>
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
            <p className="seed">{`추첨 시드 ${room.id}|${room.boxId}|${me}|${room.round}`}{room.trade && ` · 교환 시드 ${room.trade.seed}`}</p>
          </section>
        </>
      )}
    </>
  )
}

/* ── 개봉 카운트다운 — 기다리는 순간 ────────────────────────────
   v1이 갖고 있던 연출. 결과를 바로 띄우지 않고 3·2·1을 센다.
   이것이 "구매하고 당첨되기까지"에서 가장 만족스러웠던 구간이다. */
function CountDown({ n }) {
  return (
    <div className="count" role="status" aria-live="polite">
      <span className="count__n">{n > 0 ? n : '개봉'}</span>
      <span className="count__t">{n > 0 ? '통을 여는 중' : ''}</span>
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
  const [ai, setAi] = useState(null)
  const [reveal, setReveal] = useState(null)
  const [scene, setScene] = useState(null)
  const [phase, setPhase] = useState('detail')   // detail → flow
  const [count, setCount] = useState(null)       // 3 · 2 · 1 · 0
  const countTimer = useRef(null)
  const [sheet, setSheet] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    api('/api/boxes').then(({ ok, data }) => (ok ? setBoxes(data) : setErr('통을 불러오지 못했습니다.')))
    return () => { clearInterval(timer.current); clearInterval(countTimer.current) }
  }, [])

  const cards = useMemo(
    () => (boxes ? boxes.box.tiers.flatMap((t) => t.cards.map((c) => ({ ...c, tier: t.tier }))) : []),
    [boxes]
  )
  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards])
  const myTarget = room?.members.find((m) => m.id === me)?.target ?? null

  const act = useCallback(async (body) => {
    const r = await api('/api/room', body)
    if (r.data?.id) setRoom(r.data)
    return r
  }, [])

  /** 참여 = 구매. 이 순간이 v2에 없어서 "사고 기다리는" 감각이 사라져 있었다. */
  const onJoinBox = useCallback(async () => {
    setBusy('team')
    const c = await api('/api/room', { action: 'create', name: '나' })
    if (!c.ok) { setErr('방을 만들지 못했습니다.'); setBusy(''); return }
    let st = c.data
    setMe(c.data.you)
    for (let i = 0; i < teamSize - 1; i++) {
      const j = await api('/api/room', { action: 'join', roomId: c.data.id, name: SIM_NAMES[i] })
      if (j.ok) st = j.data
    }
    setRoom(st); setBusy(''); setPhase('flow')
  }, [teamSize])

  const onPick = (cardId) => act({ action: 'target', roomId: room.id, memberId: me, cardId })

  const onSimPrefs = async () => {
    setBusy('sim')
    await act({ action: 'simPrefs', roomId: room.id, memberId: me })
    setBusy('')
  }

  const onAsk = async (taste) => {
    setBusy('ai')
    const r = await api('/api/curate', { action: 'prefs', taste, target: myTarget })
    setAi(r.data)
    // curate는 방을 건드리지 않는다(배포본에서 함수가 갈라지기 때문). 저장은 room이 한다.
    if (r.ok && r.data?.aiRanking?.length) {
      await act({ action: 'setPrefs', roomId: room.id, memberId: me, prefs: r.data.aiRanking, source: r.data.source })
    }
    setBusy('')
  }

  const onReadyAll = async () => {
    setBusy('ready')
    for (const m of room.members) await act({ action: 'ready', roomId: room.id, memberId: m.id, ready: true })
    setBusy('')
  }

  /**
   * 개봉. 전원 준비 전에도 **실제로 호출한다** — 서버가 409를 내는 경로가 존재한다는
   * 것이 주장이므로, 프론트에서 버튼만 막아 두면 그 주장이 증명되지 않는다(I8).
   */
  const onOpen = async () => {
    setBusy('open'); setGateMsg(null)
    const r = await api('/api/room', { action: 'open', roomId: room.id })
    if (r.status === 409) {
      setGateMsg({ status: 409, error: r.data.error, waiting: r.data.waiting })
      if (r.data.id) setRoom(r.data)
    } else if (r.ok) {
      const data = r.data
      const mine = data.openResults.find((x) => x.memberId === me)
      const total = data.openResults.length
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      if (reduce) { setRoom(data); setReveal(total); setScene(mine); setBusy(''); return }

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
    setBusy('')
  }

  const onTrade = async () => {
    setBusy('trade')
    await act({ action: 'trade', roomId: room.id })
    setBusy('')
  }

  if (err) return <div className="stage"><div className="phone"><div className="empty"><p>{err}</p><p className="empty__sub">새로고침해 주세요.</p></div></div></div>
  if (!boxes) return <div className="stage"><div className="phone"><div className="empty"><p>통을 세는 중…</p></div></div></div>

  const olboxProps = {
    boxes, room, me, teamSize, setTeamSize, cards, cardById, myTarget,
    busy, gateMsg, ai, reveal,
    phase, onJoinBox, onPick, onSimPrefs, onAsk, onReadyAll, onOpen, onTrade,
    onSheet: () => setSheet(true),
  }

  return (
    <>
      <Shell tab={tab} setTab={setTab}
        brief={<BriefRail box={boxes.box} oripa={boxes.oripa} crawl={875} />}
        ops={<OpsRail boxes={boxes} room={room} teamSize={teamSize} />}
        overlay={
          count !== null ? <CountDown n={count} />
            : scene ? <RevealScene r={scene} fee={boxes.box.fee} onClose={() => setScene(null)} />
              : null
        }>
        {tab === 'home' && <HomeTab cards={cards} box={boxes.box} onGoOlbox={() => setTab('olbox')} />}
        {tab === 'olbox' && <OlboxTab {...olboxProps} />}
        {tab === 'content' && <StubTab title="콘텐츠" body="이 과제에서는 구현하지 않았습니다." />}
        {tab === 'wish' && <StubTab title="관심상품" body="이 과제에서는 구현하지 않았습니다." />}
        {tab === 'me' && <StubTab title="내 정보" body="이 과제에서는 구현하지 않았습니다." />}
      </Shell>
      {sheet && <HonestySheet boxes={boxes} room={room} teamSize={teamSize} onClose={() => setSheet(false)} />}
    </>
  )
}
