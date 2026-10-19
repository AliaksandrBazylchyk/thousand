// Статистика (ТЗ 8): считается из тех же результатов replay, что и таблица.

import { MARRIAGE_POINTS } from './rules';
import type { GameState, Marriage, Mark, PlayerId, RedealReason } from './types';

export interface StatsGame {
  id: string;
  seats: PlayerId[];
  state: GameState;
  /** Партия завершена: учитывается в итогах (места, победы, длительность). */
  finished: boolean;
  winnerId: PlayerId | null;
  startedAt: number;
  finishedAt: number | null;
}

export interface PlayerStats {
  playerId: PlayerId;
  totals: {
    games: number;
    wins: number;
    winRate: number | null;
    /** Место → сколько раз. */
    places: Record<number, number>;
    avgScore: number | null;
    hands: number;
    avgHandsPerGame: number | null;
    avgDurationMin: number | null;
  };
  bids: {
    count: number;
    made: number;
    failed: number;
    rospis: number;
    madeRate: number | null;
    avgBid: number | null;
    maxBid: number | null;
    /** Ставка → сколько раз. */
    distribution: Record<number, number>;
  };
  dark: { declared: number; made: number; failed: number; overbid: number };
  opponent: { hands: number; avgPoints: number | null };
  marriages: { bySuit: Record<Marriage, number>; goldenThousands: number; points: number };
  penalties: {
    bolts: number;
    boltPenalties: number;
    redeals: Record<RedealReason, number>;
    redealPenalties: number;
    ninePenalties: number;
    misdeals: number;
  };
  barrel: {
    sits: number;
    wins: number;
    falls: number;
    /** Сколько раз сбил соперников с бочки. */
    knocked: number;
    /** Кто и сколько раз сбивал этого игрока. */
    knockedBy: Record<PlayerId, number>;
    avgWinAttempt: number | null;
  };
  bulldozers: { total: number; fromPlus: number; fromMinus: number };
  records: { maxMadeBid: number | null; maxGain: number | null; longestMadeStreak: number };
}

export interface HeadToHead {
  playerId: PlayerId;
  opponentId: PlayerId;
  /** Завершённых партий вместе. */
  games: number;
  wins: number;
  opponentWins: number;
  /** Закончил выше соперника. */
  higher: number;
  lower: number;
  knocked: number;
  knockedBy: number;
}

export interface StatsResult {
  players: Record<PlayerId, PlayerStats>;
  headToHead: HeadToHead[];
}

const avg = (sum: number, n: number) => (n > 0 ? sum / n : null);

function emptyStats(playerId: PlayerId): PlayerStats {
  return {
    playerId,
    totals: {
      games: 0,
      wins: 0,
      winRate: null,
      places: {},
      avgScore: null,
      hands: 0,
      avgHandsPerGame: null,
      avgDurationMin: null,
    },
    bids: {
      count: 0,
      made: 0,
      failed: 0,
      rospis: 0,
      madeRate: null,
      avgBid: null,
      maxBid: null,
      distribution: {},
    },
    dark: { declared: 0, made: 0, failed: 0, overbid: 0 },
    opponent: { hands: 0, avgPoints: null },
    marriages: {
      bySuit: { spades: 0, clubs: 0, diamonds: 0, hearts: 0, aces: 0 },
      goldenThousands: 0,
      points: 0,
    },
    penalties: {
      bolts: 0,
      boltPenalties: 0,
      redeals: { fourNines: 0, fourJacks: 0, threeNines: 0 },
      redealPenalties: 0,
      ninePenalties: 0,
      misdeals: 0,
    },
    barrel: { sits: 0, wins: 0, falls: 0, knocked: 0, knockedBy: {}, avgWinAttempt: null },
    bulldozers: { total: 0, fromPlus: 0, fromMinus: 0 },
    records: { maxMadeBid: null, maxGain: null, longestMadeStreak: 0 },
  };
}

/** Место по итоговому счёту: 1 + число игроков со счётом выше. */
export function finalPlaces(game: Pick<StatsGame, 'seats' | 'state'>): Record<PlayerId, number> {
  const score = (p: PlayerId) => game.state.players[p]?.score ?? 0;
  return Object.fromEntries(
    game.seats.map((p) => [p, 1 + game.seats.filter((q) => score(q) > score(p)).length]),
  );
}

export function computeStats(games: readonly StatsGame[]): StatsResult {
  const stats = new Map<PlayerId, PlayerStats>();
  const of = (p: PlayerId) => {
    let s = stats.get(p);
    if (!s) stats.set(p, (s = emptyStats(p)));
    return s;
  };
  const h2h = new Map<string, HeadToHead>();
  const pair = (a: PlayerId, b: PlayerId) => {
    const key = `${a}|${b}`;
    let h = h2h.get(key);
    if (!h) {
      h = {
        playerId: a,
        opponentId: b,
        games: 0,
        wins: 0,
        opponentWins: 0,
        higher: 0,
        lower: 0,
        knocked: 0,
        knockedBy: 0,
      };
      h2h.set(key, h);
    }
    return h;
  };

  // Накопители для средних и серий.
  const acc = new Map<
    PlayerId,
    {
      scoreSum: number;
      durSum: number;
      durN: number;
      handsInFinished: number;
      bidSum: number;
      oppSum: number;
      winAttemptSum: number;
      streak: number;
    }
  >();
  const accOf = (p: PlayerId) => {
    let a = acc.get(p);
    if (!a)
      acc.set(
        p,
        (a = {
          scoreSum: 0,
          durSum: 0,
          durN: 0,
          handsInFinished: 0,
          bidSum: 0,
          oppSum: 0,
          winAttemptSum: 0,
          streak: 0,
        }),
      );
    return a;
  };

  const sorted = [...games].sort((a, b) => a.startedAt - b.startedAt);
  for (const game of sorted) {
    for (const p of game.seats) of(p);
    const handRows = game.state.rows.filter((r) => r.kind === 'hand');

    // ─── Итоги и личные встречи (только завершённые партии) ───
    if (game.finished) {
      const places = finalPlaces(game);
      for (const p of game.seats) {
        const s = of(p);
        const a = accOf(p);
        s.totals.games++;
        if (game.winnerId === p) s.totals.wins++;
        const place = places[p]!;
        s.totals.places[place] = (s.totals.places[place] ?? 0) + 1;
        a.scoreSum += game.state.players[p]?.score ?? 0;
        a.handsInFinished += handRows.length;
        if (game.finishedAt) {
          a.durSum += game.finishedAt - game.startedAt;
          a.durN++;
        }
        for (const q of game.seats) {
          if (q === p) continue;
          const h = pair(p, q);
          h.games++;
          if (game.winnerId === p) h.wins++;
          if (game.winnerId === q) h.opponentWins++;
          if (places[p]! < places[q]!) h.higher++;
          if (places[p]! > places[q]!) h.lower++;
        }
      }
    }

    // ─── Коны и события ───
    /** Кто на бочке перед текущей строкой. */
    const onBarrel = new Set<PlayerId>();
    for (const row of game.state.rows) {
      for (const d of row.dealMarks) {
        const dealer = of(row.turn.dealer);
        if (d.type === 'redeal' && d.reason) dealer.penalties.redeals[d.reason]++;
        if (d.type === 'misdeal') dealer.penalties.misdeals++;
      }

      for (const p of game.seats) {
        const cell = row.cells[p];
        if (!cell) continue;
        const s = of(p);
        const a = accOf(p);
        const marks = cell.marks;
        const has = (t: Mark['type']) => marks.some((m) => m.type === t);

        if (row.kind === 'hand') {
          s.totals.hands++;
          s.records.maxGain = Math.max(s.records.maxGain ?? cell.delta, cell.delta);
        }

        for (const m of marks) {
          switch (m.type) {
            case 'bolt':
              s.penalties.bolts++;
              if (m.penalty) s.penalties.boltPenalties++;
              break;
            case 'dealPenalty':
              if (m.kind === 'redeal') s.penalties.redealPenalties++;
              if (m.kind === 'nine') s.penalties.ninePenalties++;
              break;
            case 'marriage':
              s.marriages.bySuit[m.marriage]++;
              s.marriages.points += MARRIAGE_POINTS[m.marriage];
              break;
            case 'barrelSit':
              if (!marks.some((x) => x.type === 'barrelFall' && x.reason === 'collision'))
                s.barrel.sits++;
              break;
            case 'barrelFall':
              if (m.reason === 'collision') break;
              s.barrel.falls++;
              if (m.reason === 'knocked') {
                for (const by of m.by ?? []) {
                  s.barrel.knockedBy[by] = (s.barrel.knockedBy[by] ?? 0) + 1;
                  of(by).barrel.knocked++;
                  pair(by, p).knocked++;
                  pair(p, by).knockedBy++;
                }
              }
              break;
            case 'bulldozer':
              s.bulldozers.total++;
              if (m.from > 0) s.bulldozers.fromPlus++;
              else s.bulldozers.fromMinus++;
              break;
            case 'goldenThousand':
              s.marriages.goldenThousands++;
              break;
            case 'winner': {
              const barrel = marks.find((x) => x.type === 'barrel');
              if (barrel && barrel.type === 'barrel') {
                s.barrel.wins++;
                a.winAttemptSum += barrel.attempt;
              }
              break;
            }
          }
        }

        if (!row.hand) continue;
        const hand = row.hand;

        // Заказы.
        if (hand.declarer === p && !hand.goldenThousand) {
          s.bids.count++;
          a.bidSum += hand.bid;
          s.bids.distribution[hand.bid] = (s.bids.distribution[hand.bid] ?? 0) + 1;
          s.bids.maxBid = Math.max(s.bids.maxBid ?? 0, hand.bid);
          if (has('bidMade')) {
            s.bids.made++;
            a.streak++;
            s.records.longestMadeStreak = Math.max(s.records.longestMadeStreak, a.streak);
            s.records.maxMadeBid = Math.max(s.records.maxMadeBid ?? 0, hand.bid);
          } else {
            if (has('rospis')) s.bids.rospis++;
            else s.bids.failed++;
            a.streak = 0;
          }
        }

        // Тёмные: объявляет игрок на 100.
        if (hand.dark !== 'none' && row.turn.onHundred === p) {
          s.dark.declared++;
          if (hand.dark === 'overbid') s.dark.overbid++;
          else if (hand.declarer === p && has('bidMade')) s.dark.made++;
          else if (hand.declarer === p && !hand.goldenThousand) s.dark.failed++;
        }

        // Игра соперником: очки за кон без штрафа за болт, кон на бочке не считается.
        const opponent =
          hand.declarer !== p &&
          row.turn.active.includes(p) &&
          !hand.goldenThousand &&
          !onBarrel.has(p);
        if (opponent) {
          const boltPenalty = marks.some((m) => m.type === 'bolt' && m.penalty) ? 120 : 0;
          s.opponent.hands++;
          a.oppSum += cell.credited + boltPenalty;
        }
      }

      for (const p of game.seats) {
        for (const m of row.cells[p]?.marks ?? []) {
          if (m.type === 'barrelSit') onBarrel.add(p);
          if (m.type === 'barrelFall' || m.type === 'winner') onBarrel.delete(p);
        }
      }
    }
  }

  for (const [p, s] of stats) {
    const a = accOf(p);
    s.totals.winRate = avg(s.totals.wins, s.totals.games);
    s.totals.avgScore = avg(a.scoreSum, s.totals.games);
    s.totals.avgHandsPerGame = avg(a.handsInFinished, s.totals.games);
    s.totals.avgDurationMin = a.durN ? a.durSum / a.durN / 60000 : null;
    s.bids.madeRate = avg(s.bids.made, s.bids.count);
    s.bids.avgBid = avg(a.bidSum, s.bids.count);
    s.opponent.avgPoints = avg(a.oppSum, s.opponent.hands);
    s.barrel.avgWinAttempt = avg(a.winAttemptSum, s.barrel.wins);
  }

  return { players: Object.fromEntries(stats), headToHead: [...h2h.values()] };
}

/** Ряды графика хода партии: счёт каждого игрока после каждой строки таблицы. */
export function scoreSeries(
  seats: readonly PlayerId[],
  state: GameState,
): Record<PlayerId, number[]> {
  return Object.fromEntries(
    seats.map((p) => [p, [0, ...state.rows.map((r) => r.cells[p]?.total ?? 0)]]),
  );
}
