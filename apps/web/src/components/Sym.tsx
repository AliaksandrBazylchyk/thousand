import { iconUrl, type Symbol } from '../symbols';

/** Символ таблицы: SVG-иконка и подпись. */
export function Sym({ s }: { s: Symbol }) {
  return (
    <span className={`sym ${s.tone ?? ''}`} title={s.title || undefined}>
      <img className="icon" src={iconUrl(s.icon)} alt={s.text} draggable={false} />
      {s.label && <span className="sym-label">{s.label}</span>}
    </span>
  );
}
