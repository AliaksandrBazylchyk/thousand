import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BARREL_SCORE, scoreSeries, type GameView } from '@thousand/core';

/** Шаг сетки: около 5 делений, кратно 50/100/200/250/500. */
function niceStep(range: number): number {
  const steps = [50, 100, 200, 250, 500, 1000];
  return steps.find((s) => range / s <= 6) ?? 1000;
}

/** График хода партии (ТЗ 8): счёт игроков по конам. */
export function ScoreChart({
  view,
  height = 260,
  className = '',
  labelWidth = 96,
}: {
  view: GameView;
  height?: number;
  className?: string;
  /** Место справа под подписи концов линий. */
  labelWidth?: number;
}) {
  const PAD = { top: 12, right: labelWidth, bottom: 24, left: 44 + labelWidth / 4 };
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const seats = view.seats;
  const rows = view.state.rows;
  const series = useMemo(
    () =>
      scoreSeries(
        seats.map((s) => s.id),
        view.state,
      ),
    [seats, view.state],
  );
  const all = Object.values(series).flat();
  const rawMin = Math.min(0, ...all);
  const rawMax = Math.max(100, ...all);
  const step = niceStep(rawMax - rawMin);
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.ceil(rawMax / step) * step;
  const n = rows.length;

  const plotW = width - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n === 0 ? 0 : (i / n) * plotW);
  const y = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin)) * plotH;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax; v += step) ticks.push(v);

  // Подписи на концах линий: раздвигаем, чтобы не наезжали.
  const ends = seats
    .map((s, k) => ({
      id: s.id,
      name: s.name,
      k,
      value: series[s.id]!.at(-1)!,
      ly: y(series[s.id]!.at(-1)!),
    }))
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < ends.length; i++) ends[i]!.ly = Math.max(ends[i]!.ly, ends[i - 1]!.ly + 16);

  const label = (i: number) =>
    i === 0
      ? 'Начало'
      : rows[i - 1]?.hand
        ? `Кон ${rows[i - 1]!.hand!.number}`
        : 'Штраф без розыгрыша';

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - box.left) / box.width;
    setHover(Math.min(n, Math.max(0, Math.round(rel * n))));
  }

  const tipLeft = hover !== null ? Math.min(x(hover) + 12, width - 170) : 0;

  return (
    <div className={`chart ${className}`} ref={wrapRef}>
      {seats.length > 1 && (
        <div className="chart-legend">
          {seats.map((s, k) => (
            <span key={s.id}>
              <i style={{ background: `var(--series-${k + 1})` }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg width={width} height={height} role="img" aria-label="Ход партии: счёт игроков по конам">
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(v)}
              y2={y(v)}
              className={v === 0 ? 'chart-zero' : 'chart-grid'}
            />
            <text
              x={PAD.left - 6}
              y={y(v)}
              className="chart-axis"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {v}
            </text>
          </g>
        ))}
        {yMax >= BARREL_SCORE && (
          <g>
            <line
              x1={PAD.left}
              x2={PAD.left + plotW}
              y1={y(BARREL_SCORE)}
              y2={y(BARREL_SCORE)}
              className="chart-barrel"
            />
            <text x={PAD.left + 4} y={y(BARREL_SCORE) - 4} className="chart-axis">
              бочка 880
            </text>
          </g>
        )}
        <text x={PAD.left} y={height - 6} className="chart-axis">
          коны →
        </text>

        {seats.map((s, k) => (
          <polyline
            key={s.id}
            points={series[s.id]!.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
            fill="none"
            stroke={`var(--series-${k + 1})`}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {ends.map((e) => (
          <text
            key={e.id}
            x={PAD.left + plotW + 8}
            y={e.ly}
            className="chart-end"
            dominantBaseline="middle"
          >
            <tspan className="chart-end-value">{e.value}</tspan> {e.name}
          </text>
        ))}

        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.top}
              y2={PAD.top + plotH}
              className="chart-cross"
            />
            {seats.map((s, k) => (
              <circle
                key={s.id}
                cx={x(hover)}
                cy={y(series[s.id]![hover]!)}
                r={4.5}
                fill={`var(--series-${k + 1})`}
                className="chart-dot"
              />
            ))}
          </g>
        )}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: tipLeft, top: PAD.top + 28 }}>
          <b>{label(hover)}</b>
          {seats
            .map((s, k) => ({ s, k, v: series[s.id]![hover]! }))
            .sort((a, b) => b.v - a.v)
            .map(({ s, k, v }) => (
              <span key={s.id} className="row between">
                <span>
                  <i style={{ background: `var(--series-${k + 1})` }} />
                  {s.name}
                </span>
                <b>{v}</b>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
