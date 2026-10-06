import { useState, type MouseEvent } from 'react';
import { categoryColorVar, getCategory, MOODS } from '../lib/categories';
import { formatHours, longDate, weekdayShort } from '../lib/date';
import type { WeekStats } from '../lib/stats';

interface Tip {
  x: number;
  y: number;
  lines: [string, string?];
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <strong>{tip.lines[0]}</strong>
      {tip.lines[1] && (
        <>
          <br />
          {tip.lines[1]}
        </>
      )}
    </div>
  );
}

function moodText(mood: number): string {
  const rounded = MOODS[Math.min(4, Math.max(0, Math.round(mood) - 1))];
  const value = Number.isInteger(mood) ? String(mood) : mood.toLocaleString('es-AR', { maximumFractionDigits: 1 });
  return `${rounded.emoji} ${rounded.label} (${value})`;
}

// Columnas de ánimo (1–5) de lunes a domingo. Una sola serie: el título la nombra.
export function MoodChart({ data }: { data: WeekStats['moodByDay'] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 360;
  const H = 190;
  const pad = { top: 10, right: 6, bottom: 26, left: 40 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const band = plotW / data.length;
  const barW = Math.min(24, band * 0.5);
  const y = (v: number) => pad.top + plotH - (v / 5) * plotH;
  const r = 4;

  function show(e: MouseEvent<SVGRectElement>, i: number) {
    const d = data[i];
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const scale = box.width / W;
    const cx = (pad.left + band * i + band / 2) * scale;
    const top = (d.mood ? y(d.mood) : y(0)) * scale;
    setTip({
      x: cx,
      y: top,
      lines: [
        longDate(d.date),
        d.mood ? `${moodText(d.mood)}${d.fromEntries ? ' · promedio de actividades' : ''}` : 'Sin registro de ánimo',
      ],
    });
  }

  return (
    <div className="chart-wrap" onMouseLeave={() => setTip(null)}>
      <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ánimo por día de la semana">
        {[1, 2, 3, 4, 5].map((v) => (
          <g key={v}>
            <line x1={pad.left} x2={W - pad.right} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {MOODS[v - 1].emoji} {v}
            </text>
          </g>
        ))}
        <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth={1} />
        {data.map((d, i) => {
          const cx = pad.left + band * i + band / 2;
          const x0 = cx - barW / 2;
          const top = d.mood ? y(d.mood) : y(0);
          const base = y(0);
          const h = base - top;
          return (
            <g key={d.date}>
              {d.mood && h > 0 && (
                <path
                  d={`M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${base} Z`}
                  fill="var(--accent)"
                  opacity={d.fromEntries ? 0.55 : 1}
                />
              )}
              <text x={cx} y={H - 8} textAnchor="middle">
                {weekdayShort(d.date)}
              </text>
              <rect
                x={pad.left + band * i}
                y={pad.top}
                width={band}
                height={plotH}
                fill="transparent"
                onMouseEnter={(e) => show(e, i)}
                onMouseMove={(e) => show(e, i)}
              />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
      <table className="sr-only">
        <caption>Ánimo por día</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th>{longDate(d.date)}</th>
              <td>{d.mood ? moodText(d.mood) : 'Sin registro'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Barras horizontales: horas por categoría. El nombre va siempre visible junto a la barra.
export function CategoryBars({ data, totalMinutes }: { data: WeekStats['minutesByCategory']; totalMinutes: number }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const max = Math.max(...data.map((d) => d.minutes), 1);

  function show(e: MouseEvent<HTMLElement>, i: number) {
    const d = data[i];
    const wrap = e.currentTarget.closest('.chart-wrap')!.getBoundingClientRect();
    const fill = e.currentTarget.querySelector('.hbar-fill')!.getBoundingClientRect();
    const share = totalMinutes ? Math.round((d.minutes / totalMinutes) * 100) : 0;
    setTip({
      x: fill.right - wrap.left,
      y: fill.top - wrap.top,
      lines: [
        getCategory(d.id).label,
        `${d.count} actividad${d.count === 1 ? '' : 'es'}${d.minutes ? ` · ${formatHours(d.minutes)} (${share}%)` : ''}`,
      ],
    });
  }

  return (
    <div className="chart-wrap" onMouseLeave={() => setTip(null)}>
      <ul className="hbars">
        {data.map((d, i) => (
          <li key={d.id} className="hbar" onMouseEnter={(e) => show(e, i)}>
            <span className="hbar-label">
              <span className="dot" style={{ background: categoryColorVar(d.id) }} aria-hidden />
              <span>{getCategory(d.id).label}</span>
            </span>
            <span className="hbar-track">
              <span
                className="hbar-fill"
                style={{ width: `calc((100% - 64px) * ${d.minutes / max})`, background: categoryColorVar(d.id) }}
              />
              <span className="hbar-value">{d.minutes ? formatHours(d.minutes) : `${d.count} act.`}</span>
            </span>
          </li>
        ))}
      </ul>
      <Tooltip tip={tip} />
    </div>
  );
}
