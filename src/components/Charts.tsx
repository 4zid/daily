import { useState } from 'react';
import type { DayLog } from '../types';
import { categoryColorVar, getCategory, MOODS, SCALES } from '../lib/categories';
import { formatHours, longDate, weekdayShort } from '../lib/date';
import type { WeekStats } from '../lib/stats';
import { MoodIcon } from './common';

function fmt(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

function moodText(mood: number): string {
  return MOODS[Math.min(4, Math.max(0, Math.round(mood) - 1))].label;
}

/**
 * Placer y control por día (1–10): dos columnas por día con su valor arriba.
 * Debajo de cada día va el ánimo general, si se cargó.
 */
export function RatingsChart({ data, moods }: { data: WeekStats['ratingsByDay']; moods: WeekStats['moodByDay'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const keys = ['pleasure', 'control'] as const;

  return (
    <div className="ratings-chart" onMouseLeave={() => setHover(null)}>
      <div className="legend" aria-hidden>
        {keys.map((k) => (
          <span key={k} className="legend-item" style={{ ['--tone' as string]: SCALES[k].color }}>
            <span className="dot" />
            {SCALES[k].label}
          </span>
        ))}
      </div>
      <div className="rc-plot">
        {/* Escala al 90 % del alto para dejar lugar al valor sobre la barra. */}
        {[10, 5, 0].map((t) => (
          <div key={t} className={`rc-grid${t === 0 ? ' is-base' : ''}`} style={{ bottom: `${t * 9}%` }}>
            <span>{t}</span>
          </div>
        ))}
        {data.map((d, i) => {
          const has = d.pleasure !== null || d.control !== null;
          const mood = moods[i]?.mood;
          return (
            <div
              key={d.date}
              className={`rc-day${hover === i ? ' is-hover' : ''}`}
              role="img"
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${longDate(d.date)}: ${
                has ? `placer ${d.pleasure ? fmt(d.pleasure) : 'sin dato'}, control ${d.control ? fmt(d.control) : 'sin dato'}` : 'sin puntajes'
              }`}
            >
              {hover === i && (
                <span className="col-tip" role="tooltip">
                  <strong>{longDate(d.date)}</strong>
                  {has
                    ? `Placer ${d.pleasure ? fmt(d.pleasure) : '–'} · Control ${d.control ? fmt(d.control) : '–'} · ${d.rated} actividad${d.rated === 1 ? '' : 'es'} con puntaje`
                    : 'Sin puntajes'}
                  {mood ? ` · Día: ${moodText(mood)}` : ''}
                </span>
              )}
              {has ? (
                keys.map((k) => {
                  const v = d[k];
                  return (
                    <div key={k} className="rc-bar-wrap">
                      {v !== null && <span className="rc-value">{fmt(v)}</span>}
                      <div
                        className={`rc-bar${v === null ? ' is-empty' : ''}`}
                        style={{ height: v !== null ? `${v * 9}%` : '5%', ['--tone' as string]: SCALES[k].color }}
                      />
                    </div>
                  );
                })
              ) : (
                <div className="rc-bar-wrap is-none">
                  <div className="rc-bar is-empty" style={{ height: '9%' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="rc-axis" aria-hidden>
        {data.map((d, i) => {
          const mood = moods[i]?.mood;
          return (
            <span key={d.date}>
              {weekdayShort(d.date)}
              <small title={mood ? moodText(mood) : undefined}>{mood ? <MoodIcon value={mood} /> : null}</small>
            </span>
          );
        })}
      </div>
      <div className="sr-only">
        <table>
        <caption>Placer y control por día</caption>
        <thead>
          <tr>
            <th>Día</th>
            <th>Placer</th>
            <th>Control</th>
            <th>Ánimo del día</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={d.date}>
              <th>{longDate(d.date)}</th>
              <td>{d.pleasure ? fmt(d.pleasure) : '–'}</td>
              <td>{d.control ? fmt(d.control) : '–'}</td>
              <td>{moods[i]?.mood ? moodText(moods[i].mood!) : '–'}</td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
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
              <span className="hbar-name">
                <span>{getCategory(d.id).label}</span>
                {(d.pleasure || d.control) && (
                  <small>
                    Placer {d.pleasure ? fmt(d.pleasure) : '–'} · Control {d.control ? fmt(d.control) : '–'}
                  </small>
                )}
              </span>
            </span>
            <span className="hbar-track">
              <span
                className="hbar-fill"
                style={{ width: `${Math.max((d.minutes / max) * 100, 3)}%` }}
              />
            </span>
            <span className="hbar-value">{d.minutes ? formatHours(d.minutes) : `${d.count} act.`}</span>
          </li>
        );
      })}
    </ul>
  );
}
