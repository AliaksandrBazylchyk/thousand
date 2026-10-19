import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { PlayerId, RoomStatsView } from '@thousand/core';
import { api } from '../api';
import { PlayerGroups, num, pct } from '../components/Stats';

function useRoomStats(code: string) {
  const [data, setData] = useState<RoomStatsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .getRoomStats(code)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [code]);
  return { data, error };
}

/** Срез «комната за всё время» (ТЗ 8). */
export function StatsPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { data, error } = useRoomStats(code);
  if (error) return <main className="page error">{error}</main>;
  if (!data) return <main className="page muted">Загрузка…</main>;

  const rows = data.players
    .map((p) => ({ p, s: data.stats.players[p.id] }))
    .filter((r) => r.s && r.s.totals.games > 0)
    .sort(
      (a, b) =>
        b.s!.totals.wins - a.s!.totals.wins ||
        (b.s!.totals.winRate ?? 0) - (a.s!.totals.winRate ?? 0),
    );

  return (
    <main className="page">
      <header className="stack-sm">
        <Link to={`/r/${code}`} className="muted small">
          ← {data.roomName}
        </Link>
        <h1>Статистика</h1>
        <p className="muted small">
          По завершённым партиям: {data.games} · конов: {data.hands}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="card muted">Пока нет завершённых партий.</p>
      ) : (
        <div className="table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Игрок</th>
                <th className="num">Партий</th>
                <th className="num">Побед</th>
                <th className="num">Ср. счёт</th>
                <th className="num">Заказы</th>
                <th className="num">Болты</th>
                <th className="num">Бочка</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, s }) => (
                <tr
                  key={p.id}
                  className="clickable"
                  onClick={() => navigate(`/r/${code}/stats/${p.id}`)}
                >
                  <td>
                    <Link to={`/r/${code}/stats/${p.id}`}>{p.name}</Link>
                  </td>
                  <td className="num">{s!.totals.games}</td>
                  <td className="num">
                    {s!.totals.wins} <span className="muted small">{pct(s!.totals.winRate)}</span>
                  </td>
                  <td className="num">{num(s!.totals.avgScore)}</td>
                  <td className="num">
                    {s!.bids.made}/{s!.bids.count}{' '}
                    <span className="muted small">{pct(s!.bids.madeRate)}</span>
                  </td>
                  <td className="num">{s!.penalties.bolts}</td>
                  <td className="num">
                    {s!.barrel.wins}/{s!.barrel.sits}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p className="small muted">
          Бочка: выигрыши с бочки / посадки. Нажмите на игрока — подробности и личные встречи.
        </p>
      )}
    </main>
  );
}

/** Срез «отдельный игрок» и личные встречи (ТЗ 8). */
export function PlayerStatsPage() {
  const { code = '', playerId = '' } = useParams();
  const { data, error } = useRoomStats(code);
  if (error) return <main className="page error">{error}</main>;
  if (!data) return <main className="page muted">Загрузка…</main>;

  const nameOf = (id: PlayerId) => data.players.find((p) => p.id === id)?.name ?? '?';
  const s = data.stats.players[playerId];
  const h2h = data.stats.headToHead
    .filter((h) => h.playerId === playerId)
    .sort((a, b) => b.games - a.games);

  return (
    <main className="page">
      <header className="stack-sm">
        <Link to={`/r/${code}/stats`} className="muted small">
          ← Статистика комнаты
        </Link>
        <h1>{nameOf(playerId)}</h1>
      </header>
      {!s ? (
        <p className="card muted">У игрока пока нет завершённых партий.</p>
      ) : (
        <>
          <PlayerGroups s={s} nameOf={nameOf} />
          {h2h.length > 0 && (
            <section className="stack-sm">
              <h2>Личные встречи</h2>
              <div className="table-wrap">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Соперник</th>
                      <th className="num">Партий</th>
                      <th className="num">Победы</th>
                      <th className="num">Выше / ниже</th>
                      <th className="num">Сбил / сбит</th>
                    </tr>
                  </thead>
                  <tbody>
                    {h2h.map((h) => (
                      <tr key={h.opponentId}>
                        <td>{nameOf(h.opponentId)}</td>
                        <td className="num">{h.games}</td>
                        <td className="num">
                          {h.wins} : {h.opponentWins}
                        </td>
                        <td className="num">
                          {h.higher} / {h.lower}
                        </td>
                        <td className="num">
                          {h.knocked} / {h.knockedBy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted">
                Победы — свои против побед соперника. «Выше / ниже» — кто закончил партию выше по
                счёту.
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}
