import { Seg } from '../components/Fields'
import { goBack, navigate } from '../route'
import type { Data } from '../useData'
import { Bests } from './Bests'
import { Charts } from './Charts'
import { Cycle } from './Cycle'
import { Report } from './Report'

const VIEWS = ['cycle', 'charts', 'bests'] as const
type View = (typeof VIEWS)[number]
const LABEL: Record<View, string> = { cycle: 'サイクル', charts: 'グラフ', bests: '自己ベスト' }

/** 振り返り：サイクル／グラフ／自己ベストを切り替える。判定レポートもここから開く */
export function Review(props: { data: Data; toast: (m: string) => void; sub: string | null; id: string | null }) {
  if (props.sub === 'report' && props.id) {
    return <Report data={props.data} cycleId={props.id} close={() => goBack(() => navigate('review', 'cycle'))} />
  }
  const view: View = (VIEWS as readonly string[]).includes(props.sub ?? '') ? (props.sub as View) : 'cycle'
  return (
    <>
      <Seg
        options={VIEWS}
        value={view}
        onChange={(v) => navigate('review', v, null, true)}
        label="振り返りの表示"
        render={(v) => LABEL[v]}
        className="top"
      />
      {view === 'cycle' && (
        <Cycle data={props.data} toast={props.toast} openReport={(id) => navigate('review', 'report', id)} />
      )}
      {view === 'charts' && <Charts data={props.data} />}
      {view === 'bests' && <Bests data={props.data} />}
    </>
  )
}
