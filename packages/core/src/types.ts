// ─── Вход ────────────────────────────────────────────────────────────────

export type PlayerId = string;

export type Suit = 'spades' | 'clubs' | 'diamonds' | 'hearts';
/** Марьяж: масть (K+Q) или тузовый (4 туза). */
export type Marriage = Suit | 'aces';

export interface GameSetup {
  /** Игроки в порядке мест по часовой стрелке, 2–4. */
  seats: PlayerId[];
  firstDealer: PlayerId;
}

export interface PlayerInput {
  /** Сырые очки взяток (вдвоём — вместе со вторым прикупом за последнюю взятку). */
  tricks: number;
  marriages: Marriage[];
}

/** Ввод раздающего вчетвером. */
export interface PrikupInput {
  /** Очки карт прикупа. При марьяже в прикупе — только третья карта (R6). */
  points: number;
  marriage: Suit | null;
}

/** none — тёмной не было; played — сыграна в тёмную; overbid — тёмную перебили ставкой от 125. */
export type DarkStatus = 'none' | 'played' | 'overbid';

export interface HandEntry {
  kind: 'hand';
  id: string;
  declarer: PlayerId;
  bid: number;
  dark: DarkStatus;
  rospis: boolean;
  goldenThousand: boolean;
  /** Ввод играющих игроков (вчетвером без раздающего). */
  inputs: Partial<Record<PlayerId, PlayerInput>>;
  /** Только вчетвером: ввод раздающего на прикупе. */
  prikup: PrikupInput | null;
}

export type DealEventType = 'nineAtBottom' | 'redeal' | 'misdeal';
export type RedealReason = 'fourNines' | 'fourJacks' | 'threeNines';

export interface DealEventEntry {
  kind: 'dealEvent';
  id: string;
  type: DealEventType;
  /** Только для пересдачи. */
  reason?: RedealReason;
  /** У кого на руках карты, из-за которых пересдача (для показа). */
  playerId?: PlayerId;
}

/** Записи партии в порядке, в котором они произошли. */
export type Entry = HandEntry | DealEventEntry;

// ─── Выход ───────────────────────────────────────────────────────────────

export interface Turn {
  dealer: PlayerId;
  /** Сдвигает колоду: справа от раздающего. */
  shifter: PlayerId;
  /** Игрок на 100: следующий после раздающего. */
  onHundred: PlayerId;
  /** Вчетвером — раздающий, иначе null. */
  prikupSitter: PlayerId | null;
  /** Играющие в этом коне (вчетвером без раздающего). */
  active: PlayerId[];
}

export type BarrelFallReason =
  | 'failedBid' // не сыграл ставку на бочке
  | 'rospis' // расписал на бочке
  | 'penalty' // штраф −120 (болт, сдвиг, пересдача, неправильная раздача)
  | 'attempts' // не выиграл за 3 кона
  | 'knocked' // сбит севшим на бочку
  | 'collision'; // сели на бочку одновременно с другим

export type DealPenaltyKind = 'nine' | 'redeal' | 'misdeal';

export type Mark =
  | { type: 'bidMade'; bid: number }
  | { type: 'bidFailed'; bid: number }
  | { type: 'rospis'; bid: number }
  | { type: 'dark' }
  | { type: 'goldenThousand' }
  | { type: 'winner' }
  | { type: 'bolt'; count: number; penalty: boolean }
  | { type: 'prikup' }
  | { type: 'marriage'; marriage: Marriage }
  | { type: 'barrelSit' }
  /** На бочке; attempt — номер кона на бочке, counted=false — кон на прикупе вчетвером. */
  | { type: 'barrel'; attempt: number; counted: boolean }
  | { type: 'barrelFall'; reason: BarrelFallReason; by?: PlayerId[] }
  | { type: 'bulldozer'; from: number }
  | { type: 'dealPenalty'; kind: DealPenaltyKind };

/** Событие раздачи для показа в столбце «Раздаёт». */
export interface DealMark {
  entryId: string;
  type: DealEventType;
  reason?: RedealReason;
  /** Счётчик: какая по счёту девятка внизу / пересдача подряд. */
  count: number;
  playerId?: PlayerId;
}

export interface CellInput {
  tricks?: number;
  marriages?: Marriage[];
  prikup?: PrikupInput;
}

export interface Cell {
  total: number;
  delta: number;
  /** Начислено правилами кона до бочки и бульдозера (для деталей ячейки). */
  credited: number;
  marks: Mark[];
  input: CellInput | null;
}

export type IssueCode =
  | 'unknownPlayer'
  | 'declarerNotActive'
  | 'badBid'
  | 'darkBidTooLow'
  | 'darkOverbidTooLow'
  | 'darkNotOnHundred'
  | 'darkOnBarrel'
  | 'missingInput'
  | 'missingPrikup'
  | 'badTricks'
  | 'trickSum'
  | 'marriageWithoutTricks'
  | 'duplicateMarriage'
  | 'redealReasonMissing'
  | 'afterGameOver';

export interface Issue {
  level: 'error' | 'warning';
  code: IssueCode;
  entryId: string;
  playerId?: PlayerId;
  message: string;
}

export interface HandSummary {
  number: number;
  declarer: PlayerId;
  bid: number;
  dark: DarkStatus;
  rospis: boolean;
  goldenThousand: boolean;
  /** Сумма сырых очков взяток играющих (должна быть 120). */
  trickSum: number;
}

/** Строка таблицы: одна очередь раздающего — сыгранный кон или штраф с переходом раздачи. */
export interface Row {
  index: number;
  /** Запись, которой закончилась строка (кон или штрафное событие). */
  entryId: string;
  kind: 'hand' | 'dealPenalty';
  turn: Turn;
  hand: HandSummary | null;
  dealMarks: DealMark[];
  cells: Record<PlayerId, Cell>;
  issues: Issue[];
}

export interface PlayerStatus {
  score: number;
  bolts: number;
  onBarrel: boolean;
  /** Израсходовано попыток на бочке (0–2, на третьей неудаче — падение). */
  barrelAttempts: number;
}

export interface CurrentDeal {
  turn: Turn;
  /** Сколько раз подряд внизу девятка в этой раздаче. */
  nineCount: number;
  /** Сколько пересдач подряд у этого раздающего. */
  redealCount: number;
  dealMarks: DealMark[];
  /** Номер следующего кона. */
  handNumber: number;
}

export interface GameState {
  setup: GameSetup;
  rows: Row[];
  players: Record<PlayerId, PlayerStatus>;
  /** null, если партия окончена. */
  current: CurrentDeal | null;
  winner: PlayerId | null;
  issues: Issue[];
}
