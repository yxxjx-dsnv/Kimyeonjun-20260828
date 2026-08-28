// 화면이 보여준 구성(composeBox) vs 개봉이 실제로 쓰는 구성(resolve) 대조
const r = await fetch('http://localhost:3111/api/curate', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'user', content: '먹거리 위주로' }], boxId: 'charizard', teamSize: 1 }),
})
const j = await r.json()
console.log('axis=' + j.axis + ' pickedCount=' + j.pickedCount + ' fallback=' + j.usedFallback)
console.log('화면이 보여준 티어 후보수:', j.tiers.map(t => `${t.tier}:${t.count}`).join(' '))
console.log('화면이 보여준 확률:', JSON.stringify(j.odds))

const { getBox, tiersOf, collapseUp, byId, TIERS } = await import('./api/_draw.js')
const box = getBox('charizard')
const ids = j.pickedIds.filter(id => byId.has(id))
const drawTiers = collapseUp(tiersOf(box, ids))
console.log('개봉이 실제로 쓸 티어 후보수:', TIERS.map(t => `${t}:${drawTiers[t].length}`).join(' '))
console.log('개봉 S 후보:', drawTiers.S.map(i => i.name.slice(0,26)))
console.log('화면 S 샘플 :', j.tiers[0].samples.map(i => i.name.slice(0,26)))
