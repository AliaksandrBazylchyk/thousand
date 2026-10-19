// Настройки устройства: тема и вид символов. Хранятся в localStorage, применяются сразу на всех экранах.

import { useSyncExternalStore } from 'react';

export type Theme = 'auto' | 'light' | 'dark';
export type SymbolStyle = 'icons' | 'text';
export type SymbolSize = 's' | 'm' | 'l';

export interface Settings {
  theme: Theme;
  symbols: SymbolStyle;
  symbolSize: SymbolSize;
  /** Марьяжи под числом в таблице по умолчанию. */
  marriages: boolean;
}

const KEY = 'thousand:settings';
const DEFAULTS: Settings = { theme: 'auto', symbols: 'icons', symbolSize: 'm', marriages: false };
const SIZE_SCALE: Record<SymbolSize, number> = { s: 0.75, m: 0.85, l: 1.05 };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

let current = load();
const listeners = new Set<() => void>();

function apply(s: Settings) {
  const root = document.documentElement;
  if (s.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  root.style.setProperty('--sym-scale', String(SIZE_SCALE[s.symbolSize]));
}

export function initSettings() {
  apply(current);
}

export function updateSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Хранилище недоступно — настройки живут до перезагрузки.
  }
  apply(current);
  listeners.forEach((l) => l());
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}
