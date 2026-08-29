// Phase 5가 이 파일을 다시 쓴다. 그때까지 브랜치 프리뷰 빌드를 살려두는 스텁이다.
// v1의 App.jsx(1,322줄)와 parts.jsx(748줄)는 3형식 캠페인 화면이라 통째로 지웠다.
export default function App() {
  return (
    <main style={{ font: '16px/1.7 system-ui', padding: '4rem 1.5rem', maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem' }}>올박스 v2 — 재구축 중</h1>
      <p>통이 보이는 팀 뽑기. 화면은 Phase 5에서 만든다.</p>
      <p style={{ color: '#666' }}>
        약속의 문장은 <code>SPEC.md</code>, 근거는 <code>docs/references.md</code>에 있다.
      </p>
    </main>
  )
}
