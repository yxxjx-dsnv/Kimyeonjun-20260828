/**
 * 저장소 문서 → data/docs-digest.json
 *
 * 챗봇(/api/ask)의 유일한 지식원이다. 문서를 섹션 단위로 잘라 담는다.
 * 챗봇이 여기 없는 것을 지어내면 안 되므로, **문서에서 기계적으로 추출**하고
 * 손으로 문장을 쓰지 않는다. 문서가 바뀌면 `npm run digest`로 재생성한다.
 */
import { readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = new URL('..', import.meta.url)
const read = (p) => { try { return readFileSync(new URL(p, ROOT), 'utf8') } catch { return null } }

/**
 * 소비자 어휘로 정규화한다.
 * 문서는 설계 문서라 "통"을 모델의 용어로 쓰지만, 챗봇은 채용 담당자에게 말하는
 * 자리이고 화면에서는 이미 "박스"로 통일했다. 발췌에 "통"이 남아 있으면 모델이
 * 그대로 따라 쓴다 — 프롬프트로 막는 것보다 지식원을 고치는 쪽이 확실하다.
 * 원문 문서는 건드리지 않는다. 바뀌는 것은 챗봇이 읽는 사본뿐이다.
 */
export function normalize(text) {
  return text
    .replace(/같은 통에서/g, '같은 박스에서')
    .replace(/통이 줄어드는/g, '재고가 줄어드는')
    .replace(/통 공개/g, '구성 공개')
    .replace(/통 전체/g, '구성 전체')
    .replace(/통이 안 보이/g, '구성이 안 보이')
    .replace(/통을 공개/g, '구성을 공개')
    // "통"은 받침이 있고 "박스"는 없다. 조사를 그대로 두면 "박스은"이 된다.
    .replace(/(^|[^가-힣])통([은는이가을를과와의에])/g,
      (_, pre, josa) => pre + '박스' + ({ 은: '는', 이: '가', 을: '를', 과: '와' }[josa] ?? josa))
}

/** 마크다운을 ##/### 헤딩 단위 섹션으로 자른다. */
export function sectionize(md, docName) {
  if (!md) return []
  const out = []
  let title = docName, buf = []
  const push = () => {
    const text = buf.join('\n').trim()
    if (text.length > 40) out.push({ doc: docName, title, text: normalize(text).slice(0, 2600) })
    buf = []
  }
  for (const line of md.split('\n')) {
    const h = line.match(/^#{1,3} (.+)/)
    if (h) { push(); title = h[1].replace(/[*`#]/g, '').trim() } else buf.push(line)
  }
  push()
  return out
}

function build() {
  const docs = [
    ['README.md', 'README'],
    ['SPEC.md', 'SPEC'],
    ['docs/references.md', '근거 대장'],
    ['docs/과제1.md', '과제1 문서'],
    ['docs/task1_report_en.md', 'Task 1 report'],
  ]
  const sections = docs.flatMap(([p, name]) => sectionize(read(p), name))
  return {
    builtAt: new Date().toISOString(),
    note: '이 파일은 npm run digest가 저장소 문서에서 기계적으로 추출한다. 손으로 고치지 말 것.',
    sections,
  }
}

function selfCheck() {
  const f = []
  const t = (n, c, d) => { if (!c) f.push(n); console.log(`  ${c ? '✓' : '✗'} ${n}${d ? ` — ${d}` : ''}`) }
  console.log('─────── self-check ───────')
  const secs = sectionize('# 제목\n본문이 사십 자를 넘어야 섹션으로 남습니다. 이 문장이 그 길이를 확실히 넘도록 몇 마디를 더 붙여 둡니다.\n## 소제목\n짧다', 'x')
  t('헤딩 단위로 자른다', secs.length === 1 && secs[0].title === '제목')
  t('짧은 조각은 버린다', !secs.some((s) => s.title === '소제목'))
  t('빈 문서는 빈 배열', sectionize(null, 'x').length === 0)
  const d = build()
  t('다섯 문서를 전부 읽는다', new Set(d.sections.map((s) => s.doc)).size === 5,
    [...new Set(d.sections.map((s) => s.doc))].join(', '))
  t('섹션이 충분히 나온다', d.sections.length >= 40, `${d.sections.length}개`)
  t('섹션이 2,600자를 넘지 않는다', d.sections.every((s) => s.text.length <= 2600))
  t('내부 용어 "통"을 소비자 어휘로 바꾼다',
    normalize('같은 통에서 뽑는다. 통이 줄어드는 것이 천장이다. 통은 1,000구좌다.')
      === '같은 박스에서 뽑는다. 재고가 줄어드는 것이 천장이다. 박스는 1,000구좌다.')
  t('"통"이 남은 섹션이 거의 없다',
    d.sections.filter((s) => /(^|[^가-힣])통([은는이가을를의에])/.test(s.text)).length === 0,
    `${d.sections.filter((s) => /(^|[^가-힣])통([은는이가을를의에])/.test(s.text)).length}개 섹션`)
  console.log(`  ${8 - f.length}개 항목 · ${f.length ? f.length + '건 실패' : '전부 통과'}`)
  return f.length
}

// argv[1]이 없을 수 있다(node -e로 import할 때). 감싸지 않으면 realpathSync가 던진다.
const isMain = () => {
  try { return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]) } catch { return false }
}
if (isMain()) {
  if (process.argv[2] === 'check') process.exit(selfCheck() > 0 ? 1 : 0)
  if (selfCheck() > 0) process.exit(1)
  const d = build()
  writeFileSync(new URL('data/docs-digest.json', ROOT), JSON.stringify(d, null, 1))
  const kb = (JSON.stringify(d).length / 1024).toFixed(0)
  console.log(`\n  섹션 ${d.sections.length}개 · ${kb}KB → data/docs-digest.json`)
}
