import { useSettings } from '../settings';
import { iconUrl, type Symbol } from '../symbols';

/** Символ таблицы: SVG-иконка с подписью или текстовое обозначение — по настройке устройства. */
export function Sym({ s }: { s: Symbol }) {
  const { symbols } = useSettings();
  return (
    <span className={`sym ${s.tone ?? ''}`} title={s.title || undefined}>
      {symbols === 'text' ? (
        <span className="sym-text">{s.text}</span>
      ) : (
        <>
          <img className="icon" src={iconUrl(s.icon)} alt={s.text} draggable={false} />
          {s.label && <span className="sym-label">{s.label}</span>}
        </>
      )}
    </span>
  );
}
