// Цвет флажка игрока (ТЗ 6.3): флажок у имени на ТВ. Выбирает сам игрок в комнате.

export interface FlagColor {
  id: string;
  hex: string;
  name: string;
}

export const FLAG_COLORS: readonly FlagColor[] = [
  { id: 'blue', hex: '#4a8ee0', name: 'синий' },
  { id: 'green', hex: '#1f9e73', name: 'зелёный' },
  { id: 'purple', hex: '#a978e0', name: 'фиолетовый' },
  { id: 'rose', hex: '#c95a6e', name: 'розовый' },
  { id: 'orange', hex: '#e0883c', name: 'оранжевый' },
  { id: 'teal', hex: '#3fb4c4', name: 'бирюзовый' },
  { id: 'gold', hex: '#d8b46a', name: 'золотой' },
  { id: 'slate', hex: '#8a94a6', name: 'серый' },
];

/** Цвет флажка: выбранный игроком, иначе — по месту за столом. */
export function flagHex(flag: string | null | undefined, seatIndex: number): string {
  return FLAG_COLORS.find((f) => f.id === flag)?.hex ?? FLAG_COLORS[seatIndex % 4]!.hex;
}
