import { useState } from 'react';
import type { DayLog } from '../types';
import { categoryColorVar, getCategory, MOODS } from '../lib/categories';
import { formatHours, longDate, weekdayShort } from '../lib/date';
import type { WeekStats } from '../lib/stats';

function fmt(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

function moodText(mood: number): string {
  const rounded = MOODS[Math.min(4, Math.max(0, Math.round(mood) - 1))];
  return `${rounded.emoji} ${rounded.label} (${fmt(mood)})`;
}

/**
 * Columnas de ánimo (1–5) de lunes a domingo. El día más alto se destaca con
 * relleno rayado; la línea punteada marca el promedio de la semana.
 */
export function MoodColumns({ data, average }: { data: WeekStats['moodByDay']; average: number | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => d.mood ?? 0);
  const max = Math.max(...values);
  const top = max > 0 ? values.indexOf(max) : -1;

  return (
    <div className="columns-chart" onMouseLeave={() => setHover(null)}>
      <div className="columns-plot">
        {average !== null && (
          <div className="avg-line" style={{ bottom: `${(average / 5) * 100}%` }}>
            <span className="avg-tag">Promedio {fmt(average)}</span>
          </div>
        )}
        {data.map((d, i) => {
          const has = d.mood !== null;
          return (
            <div
              key={d.date}
              className="column"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${longDate(d.date)}: ${has ? moodText(d.mood!) : 'sin registro de ánimo'}`}
            >
              <div
                className={`col-bar${i === top ? ' is-top' : ''}${has ? '' : ' is-empty'}${d.fromEntries ? ' is-derived' : ''}`}
                style={{ height: has ? `${(d.mood! / 5) * 100}%` : '14%' }}
              >
                {has && <span className="col-value">{fmt(d.mood!)}</span>}
                {hover === i && (
                  <span className="col-tip" role="tooltip">
                    <strong>{longDate(d.date)}</strong>
                    {has ? `${moodText(d.mood!)}${d.fromEntries ? ' · promedio de actividades' : ''}` : 'Sin registro de ánimo'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="columns-axis" aria-hidden>
        {data.map((d) => (
          <span key={d.date}>{weekdayShort(d.date)}</span>
        ))}
      </div>
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

/** Barra segmentada de la semana: un tramo por día, lleno si tiene registros. */
export function DaySegments({ dates, days }: { dates: string[]; days: Record<string, DayLog> }) {
  return (
    <div className="segments" role="list" aria-label="Días con registro">
      {dates.map((date) => {
        const on = (days[date]?.entries.length ?? 0) > 0;
        return (
          <div key={date} className="segment" role="listitem" aria-label={`${longDate(date)}: ${on ? 'con registro' : 'sin registro'}`}>
            <span className={`segment-bar${on ? ' is-on' : ''}`} />
            <span className={`segment-label${on ? ' is-on' : ''}`}>{weekdayShort(date)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Horas por categoría: barras gruesas redondeadas con el valor visible al final. */
export function CategoryBars({ data, totalMinutes }: { data: WeekStats['minutesByCategory']; totalMinutes: number }) {
  const max = Math.max(...data.map((d) => d.minutes), 1);
  return (
    <ul className="hbars">
      {data.map((d) => {
        const share = totalMinutes ? Math.round((d.minutes / totalMinutes) * 100) : 0;
        return (
          <li
            key={d.id}
            className="hbar"
            title={`${getCategory(d.id).label}: ${d.count} actividad${d.count === 1 ? '' : 'es'}${d.minutes ? ` · ${formatHours(d.minutes)} (${share}%)` : ''}`}
          >
            <span className="hbar-label">
              <span className="dot" style={{ background: categoryColorVar(d.id) }} aria-hidden />
              <span>{getCategory(d.id).label}</span>
            </span>
            <span className="hbar-track">
              <span
                className="hbar-fill"
                style={{ width: `${Math.max((d.minutes / max) * 100, 3)}%`, background: categoryColorVar(d.id) }}
              />
            </span>
            <span className="hbar-value">{d.minutes ? formatHours(d.minutes) : `${d.count} act.`}</span>
          </li>
        );
      })}
    </ul>
  );
}
