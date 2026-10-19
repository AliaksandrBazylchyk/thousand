import type { ReactNode } from 'react';
import { computeStats, type GameView, type PlayerId, type PlayerStats } from '@thousand/core';
import { MARRIAGES, MARRIAGE_SYMBOL, REDEAL_REASON_LABEL } from '../symbols';

export const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)} %`);
export const num = (x: number | null, digits = 0) =>
  x === null
    ? '—'
    : x.toLocaleString('ru', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Срез «текущая партия»: главное по каждому игроку. */
export function GameStatsTable({ view }: { view: GameView }) {
  const { players } = computeStats([
    {
      id: view.id,
      seats: view.seats.map((s) => s.id),
      state: view.state,
      finished: view.status === 'finished',
      winnerId: view.winnerId,
      startedAt: view.startedAt,
      finishedAt: view.finishedAt,
    },
  ]);
  const rows: { label: string; value: (s: PlayerStats) => ReactNode }[] = [
    { label: 'Заказы: сыграно / всего', value: (s) => `${s.bids.made} / ${s.bids.count}` },
    { label: 'Макс. сыгранная ставка', value: (s) => num(s.records.maxMadeBid) },
    { label: 'Роспись', value: (s) => s.bids.rospis },
    { label: 'Тёмные: сыграно / объявлено', value: (s) => `${s.dark.made} / ${s.dark.declared}` },
    { label: 'Очки соперником, в среднем', value: (s) => num(s.opponent.avgPoints) },
    { label: 'Марьяжи, очков', value: (s) => s.marriages.points },
    {
      label: 'Болты (штрафов)',
      value: (s) => `${s.penalties.bolts} (${s.penalties.boltPenalties})`,
    },
    { label: 'Бочка: посадки / падения', value: (s) => `${s.barrel.sits} / ${s.barrel.falls}` },
    { label: 'Бульдозеры', value: (s) => s.bulldozers.total },
    { label: 'Лучший прирост за кон', value: (s) => num(s.records.maxGain) },
  ];
  return (
    <div className="table-wrap">
      <table className="stats-table">
        <thead>
          <tr>
            <th />
            {view.seats.map((p) => (
              <th key={p.id}>{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="muted">{r.label}</td>
              {view.seats.map((p) => (
                <td key={p.id} className="num">
                  {players[p.id] ? r.value(players[p.id]!) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Group({ title, items }: { title: string; items: [string, ReactNode][] }) {
  return (
    <section className="card stack-sm">
      <h3>{title}</h3>
      <dl className="stats-list">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const distribution = (d: Record<number, number>) =>
  Object.entries(d)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([bid, n]) => `${bid}×${n}`)
    .join(', ') || '—';

/** Все группы показателей игрока (ТЗ 8). */
export function PlayerGroups({ s, nameOf }: { s: PlayerStats; nameOf: (id: PlayerId) => string }) {
  const places = Object.entries(s.totals.places)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([place, n]) => `${place}-е: ${n}`)
    .join(', ');
  const knockedBy = Object.entries(s.barrel.knockedBy)
    .map(([id, n]) => `${nameOf(id)} ×${n}`)
    .join(', ');
  return (
    <div className="stats-groups">
      <Group
        title="Итоги"
        items={[
          ['Сыграно партий', s.totals.games],
          ['Победы', `${s.totals.wins} (${pct(s.totals.winRate)})`],
          ['Места', places || '—'],
          ['Средний итоговый счёт', num(s.totals.avgScore)],
          ['Конов в партии, в среднем', num(s.totals.avgHandsPerGame, 1)],
          [
            'Длительность партии',
            s.totals.avgDurationMin === null ? '—' : `${num(s.totals.avgDurationMin)} мин`,
          ],
        ]}
      />
      <Group
        title="Заказы"
        items={[
          ['Заказов', s.bids.count],
          ['Сыграно', `${s.bids.made} (${pct(s.bids.madeRate)})`],
          ['Сорвано', s.bids.failed],
          ['Роспись', s.bids.rospis],
          ['Средняя ставка', num(s.bids.avgBid)],
          ['Максимальная ставка', num(s.bids.maxBid)],
          ['Ставки', distribution(s.bids.distribution)],
        ]}
      />
      <Group
        title="Тёмные"
        items={[
          ['Объявлено', s.dark.declared],
          ['Сыграно', s.dark.made],
          ['Сорвано', s.dark.failed],
          ['Перебито ставкой от 125', s.dark.overbid],
        ]}
      />
      <Group
        title="Игра соперником"
        items={[
          ['Конов соперником', s.opponent.hands],
          ['Средние очки за кон', num(s.opponent.avgPoints, 1)],
        ]}
      />
      <Group
        title="Марьяжи"
        items={[
          ...MARRIAGES.map(
            (m) => [MARRIAGE_SYMBOL[m], s.marriages.bySuit[m]] as [string, ReactNode],
          ),
          ['Золотые тысячи', s.marriages.goldenThousands],
          ['Очков с марьяжей', s.marriages.points],
        ]}
      />
      <Group
        title="Штрафы"
        items={[
          ['Болты', s.penalties.bolts],
          ['Штрафы за болты', s.penalties.boltPenalties],
          ...(Object.keys(REDEAL_REASON_LABEL) as (keyof typeof REDEAL_REASON_LABEL)[]).map(
            (r) =>
              [`Пересдачи: ${REDEAL_REASON_LABEL[r]}`, s.penalties.redeals[r]] as [
                string,
                ReactNode,
              ],
          ),
          ['Третья пересдача подряд', s.penalties.redealPenalties],
          ['Девятка внизу 3 раза', s.penalties.ninePenalties],
          ['Неправильные раздачи', s.penalties.misdeals],
        ]}
      />
      <Group
        title="Бочка"
        items={[
          ['Посадки', s.barrel.sits],
          ['Выигрыши с бочки', s.barrel.wins],
          ['Падения', s.barrel.falls],
          ['Сбил соперников', s.barrel.knocked],
          ['Кем сбит', knockedBy || '—'],
          ['Средняя попытка выигрыша', num(s.barrel.avgWinAttempt, 1)],
        ]}
      />
      <Group
        title="Бульдозеры"
        items={[
          ['Всего', s.bulldozers.total],
          ['С плюса', s.bulldozers.fromPlus],
          ['С минуса', s.bulldozers.fromMinus],
        ]}
      />
      <Group
        title="Рекорды"
        items={[
          ['Самая большая сыгранная ставка', num(s.records.maxMadeBid)],
          ['Самый большой прирост за кон', num(s.records.maxGain)],
          ['Самая длинная серия сыгранных заказов', s.records.longestMadeStreak],
        ]}
      />
    </div>
  );
}
