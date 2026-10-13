import { useMemo } from 'react'
import { computeAlerts } from '../../domain/alerts'
import { phaseAt, targetWeightOf } from '../../domain/phases'
import { weeklySeries } from '../../domain/series'
import { addDays, diffDays, shortDate, todayISO, weekStart } from '../../domain/weeks'
import { latestPace, weeklyWeights, weekTarget } from '../../domain/weight'
import { syncNow } from '../../sync/syncEngine'
import { ago, f0, f1, signed } from '../format'
import { useMeta, useSyncState, type Data } from '../useData'

const KIND_LABEL = { bulk: '増量期', cut: '減量期', checkpoint: '判定' } as const

function SyncLine() {
  const sync = useSyncState()
  const lastBackupAt = useMeta<number>('lastBackupAt')
  if (sync.status === 'off') {
    return (
      <div className="muted">
        記録はこの端末の中にだけあります。最終バックアップ：{ago(lastBackupAt)}（設定から書き出し、または Drive 同期）
      </div>
    )
  }
  const label = {
    idle: `Drive 同期済み（${ago(sync.lastSyncAt)}）`,
    syncing: 'Drive と同期中…',
    needsAuth: `Drive 未同期（最終 ${ago(sync.lastSyncAt)}）`,
    offline: `オフライン（最終同期 ${ago(sync.lastSyncAt)}）`,
    error: `同期エラー：${sync.error ?? ''}`,
  }[sync.status]
  return (
    <div className="row between">
      <span className="muted">{label}</span>
      {sync.status !== 'syncing' && (
        <button type="button" className="btn small" onClick={() => void syncNow(true)}>
          今すぐ同期
        </button>
      )}
    </div>
  )
}

export function Home({ data }: { data: Data }) {
  const today = todayISO()
  const v = useMemo(() => {
    const { settings: s, phases, dailyLogs, topSets, waistLogs } = data
    const phase = phaseAt(phases, today)
    const week = weeklyWeights(dailyLogs).get(weekStart(today)) ?? null
    const target = week ? weekTarget(week, phases) : null
    const rows = weeklySeries(s, data.refWeight, phases, dailyLogs, topSets, waistLogs, addDays(today, -21), today)
    return {
      phase,
      week,
      target,
      pace: latestPace(dailyLogs, today),
      strength: rows.filter((r) => r.total !== null).at(-1) ?? null,
      alerts: computeAlerts(s, phases, dailyLogs, topSets, today),
      weighedToday: dailyLogs.some((l) => l.date === today),
      waistThisWeek: waistLogs.some((l) => weekStart(l.date) === weekStart(today)),
    }
  }, [data, today])

  const { phase, week, target, pace, strength } = v
  const s = data.settings
  const kcal =
    phase && s.maintenanceKcal !== null && phase.kcalOffsetMin !== null && phase.kcalOffsetMax !== null
      ? [s.maintenanceKcal + phase.kcalOffsetMin, s.maintenanceKcal + phase.kcalOffsetMax].sort((a, b) => a - b)
      : null
  const phaseTarget = phase ? targetWeightOf(phase) : null

  return (
    <>
      <div className="page-head">
        <h1>ホーム</h1>
        <span className="sub">{shortDate(today)}</span>
      </div>

      <div className="card">
        {phase ? (
          <>
            <div className="row between">
              <h2 style={{ margin: 0 }}>
                {phase.name}
                <span className="sub">　{KIND_LABEL[phase.kind]}</span>
              </h2>
              <span className="sub">残り {diffDays(today, phase.endDate)} 日</span>
            </div>
            <div className="sub">
              {phase.startDate ? shortDate(phase.startDate) : ''}〜{shortDate(phase.endDate)}
              {phaseTarget !== null && `　目標 ${f1(phaseTarget)}kg`}
              {phase.paceNote && `（${phase.paceNote}）`}
            </div>
            <div className="sub">
              カロリー目安：
              {kcal
                ? `${kcal[0]}〜${kcal[1]} kcal`
                : phase.kcalOffsetMin !== null
                  ? `維持${signed(phase.kcalOffsetMin, 0)}〜${f0(Math.abs(phase.kcalOffsetMax ?? 0))}（維持カロリー未入力）`
                  : '—'}
            </div>
          </>
        ) : (
          <div className="sub">今日に当たるフェーズがありません。設定のフェーズ表に行を追加してください。</div>
        )}
      </div>

      {data.formula.fallbackReason && (
        <div className="card" role="alert">
          <div className="alert">
            <span className="mark" aria-hidden>
              !
            </span>
            <div>
              <b>推定1RMの式を Epley に戻しています</b>
              <div className="sub">{data.formula.fallbackReason}（設定で式を確認してください）</div>
            </div>
          </div>
        </div>
      )}

      {v.alerts.length > 0 && (
        <div className="card" role="alert">
          {v.alerts.map((a) => (
            <div className="alert" key={a.id}>
              <span className="mark" aria-hidden>
                !
              </span>
              <div>
                <b>{a.title}</b>
                <div className="sub">{a.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="sub">今週の週平均体重{week ? `（${week.count}日分）` : ''}</div>
        <div className="hero num">
          {f1(week?.avg)}
          <small>kg</small>
        </div>
        <div className="stats" style={{ marginTop: 12 }}>
          <div className="stat">
            <div className="sub">目標との差</div>
            <div className="value num">
              {week && target !== null ? signed(week.avg - target) : '—'}
              <small>kg</small>
            </div>
            <div className="muted">目標 {f1(target)} kg</div>
          </div>
          <div className="stat">
            <div className="sub">ペース</div>
            <div className="value num">
              {signed(pace?.perMonth)}
              <small>kg/月</small>
            </div>
            <div className="muted">
              {pace ? `${shortDate(pace.weekStart)}の週 − 前の週` : '2週ぶんの記録が必要'}
              {phase?.targetPacePerMonth != null && `／目標 ${signed(phase.targetPacePerMonth)}`}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="sub">
          直近のトータルe1RM{strength ? `（${shortDate(strength.weekStart)}の週）` : ''}・{data.formula.formula.name}式
        </div>
        <div className="stats" style={{ marginTop: 6 }}>
          <div className="stat">
            <div className="value num">
              {f1(strength?.total)}
              <small>kg</small>
            </div>
            <div className="muted">そのまま</div>
          </div>
          <div className="stat">
            <div className="value num">
              {f1(strength?.adjTotal)}
              <small>kg</small>
            </div>
            <div className="muted">体重補正後（{f1(data.refWeight)}kg換算）</div>
          </div>
        </div>
        {!strength && <div className="muted">SQ・BP・DL が直近2週以内に揃うと表示されます。</div>}
      </div>

      {(!v.weighedToday || !v.waistThisWeek) && (
        <div className="card sub">
          {!v.weighedToday && <div>・今日の体重が未入力</div>}
          {!v.waistThisWeek && <div>・今週のウエストが未入力</div>}
        </div>
      )}

      <SyncLine />
    </>
  )
}
