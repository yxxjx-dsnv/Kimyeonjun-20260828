/**
 * SSR 진입점 — tests/render.test.mjs 전용이다. 브라우저 번들에는 들어가지 않는다.
 *
 * 화면 문자열이 서버 계산과 **문자 단위로** 같은지(I4) 보려면 소스를 읽는 것으로는
 * 부족하다. 실제로 렌더해서 나온 HTML을 봐야 한다. v1에서 `+{won(v)}`가
 * `+<!-- -->1,300원`으로 쪼개져 문구 매칭이 깨진 것도 렌더해야만 보이는 문제였다.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { OddsTable, UpdateTable, TradeTable, CycleView, BoxGrid, GridLegend, CardPick, Badge, SimBadge, TierShowcase } from './parts.jsx'

export const render = (el) => renderToStaticMarkup(el)
export { OddsTable, UpdateTable, TradeTable, CycleView, BoxGrid, GridLegend, CardPick, Badge, SimBadge, TierShowcase }
export const h = (C, props) => <C {...props} />
