/** Инициалы: первые буквы двух первых слов. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Аватар пользователя: фото или инициалы в медальоне. */
export function Avatar({
  name,
  url,
  size = 36,
  className = '',
}: {
  name: string;
  url?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`avatar ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" draggable={false} /> : initials(name)}
    </span>
  );
}
