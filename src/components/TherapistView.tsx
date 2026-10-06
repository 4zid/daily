import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import type { PatientDataset } from '../types';
import { MOODS, moodInfo } from '../lib/categories';
import { formatDuration, formatHours, isoWeekNumber, parseISODate, weekRangeLabel, longDate } from '../lib/date';
import { weekStats, withDurations } from '../lib/stats';
import { CategoryLabel } from './common';
import { CategoryBars, MoodChart } from './Charts';

export type DataSource = 'local' | 'link' | 'file';

export function TherapistView({
  dataset,
  source,
  week,
  note,
  onNote,
  onWeekStep,
  onBackToLocal,
}: {
  dataset: PatientDataset;
  source: DataSource;
  week: string;
  note: string;
  onNote: (note: string) => void;
  onWeekStep: (step: number) => void;
  onBackToLocal: () => void;
}) {
  const stats = useMemo(() => weekStats(dataset.days, week), [dataset.days, week]);
  const name = dataset.patientName.trim();
  const avgMood = stats.avgMood ? MOODS[Math.round(stats.avgMood) - 1] : null;

  return (
    <div className="main-inner">
      {source !== 'local' && (
        <div className="source-banner">
          <span>
            Estás viendo {source === 'link' ? 'la semana compartida' : 'el registro importado'}
            {name ? (
              <>
                {' '}
                de <strong>{name}</strong>
              </>
            ) : null}
            . Los datos no se guardan en este dispositivo.
          </span>
          <button type="button" className="btn btn-sm" onClick={onBackToLocal}>
            Ver los datos de este dispositivo
          </button>
        </div>
      )}

      <header className="report-head">
        <div>
          <p className="eyebrow">Registro semanal{name ? ` · ${name}` : ''}</p>
          <div className="week-title">
            <h1>
              Semana {isoWeekNumber(week)} · {weekRangeLabel(week)} {parseISODate(week).getFullYear()}
            </h1>
            <span className="no-print" style={{ display: 'inline-flex' }}>
              <button type="button" className="icon-btn" onClick={() => onWeekStep(-1)} aria-label="Semana anterior">
                <ChevronLeft />
              </button>
              <button type="button" className="icon-btn" onClick={() => onWeekStep(1)} aria-label="Semana siguiente">
                <ChevronRight />
              </button>
            </span>
          </div>
        </div>
        <div className="week-actions no-print">
          <button type="button" className="btn" onClick={() => window.print()}>
            <Printer />
            Imprimir / PDF
          </button>
        </div>
      </header>

      <section className="stats" aria-label="Resumen de la semana">
        <div className="card stat">
          <span className="stat-label">Días con registro</span>
          <span className="stat-value">
            {stats.daysWithEntries} <small>/ 7</small>
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Actividades</span>
          <span className="stat-value">{stats.totalEntries}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Tiempo registrado</span>
          <span className="stat-value">{stats.totalMinutes ? formatHours(stats.totalMinutes) : '—'}</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Ánimo promedio</span>
          <span className="stat-value">
            {stats.avgMood && avgMood ? (
              <>
                {stats.avgMood.toLocaleString('es-AR', { maximumFractionDigits: 1 })}{' '}
                <small>
                  {avgMood.emoji} {avgMood.label}
                </small>
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
      </section>

      {stats.totalEntries > 0 || stats.avgMood ? (
        <section className="charts">
          <div className="card chart-card">
            <header>
              <h3>Ánimo por día</h3>
              <p>De 1 (muy mal) a 5 (muy bien). Las columnas claras son el promedio de las actividades.</p>
            </header>
            <MoodChart data={stats.moodByDay} />
          </div>
          <div className="card chart-card">
            <header>
              <h3>Tiempo por categoría</h3>
              <p>Horas en la semana. Sin hora de fin, cada actividad cuenta hasta la siguiente (máx. 4 h).</p>
            </header>
            {stats.minutesByCategory.length ? (
              <CategoryBars data={stats.minutesByCategory} totalMinutes={stats.totalMinutes} />
            ) : (
              <p className="day-empty">Sin actividades.</p>
            )}
          </div>
        </section>
      ) : (
        <div className="card empty">
          <p>No hay registros en esta semana.</p>
        </div>
      )}

      <section className="days-report" aria-label="Detalle por día">
        {stats.dates.map((date) => {
          const day = dataset.days[date];
          const entries = withDurations(day?.entries ?? []);
          const mood = moodInfo(day?.mood);
          const hasContent = entries.length > 0 || day?.reflection || mood;
          return (
            <article key={date} className="card day-report">
              <div className="day-report-head" style={hasContent ? undefined : { marginBottom: 0 }}>
                <h3>{longDate(date)}</h3>
                {mood ? (
                  <span className="chip">
                    {mood.emoji} Día: {mood.label}
                  </span>
                ) : !hasContent ? (
                  <span className="day-empty">Sin registros</span>
                ) : null}
              </div>
              {entries.length > 0 && (
                <table className="entries-table">
                  <thead>
                    <tr>
                      <th className="col-time">Horario</th>
                      <th>Actividad</th>
                      <th className="col-cat">Categoría</th>
                      <th className="col-mood">Ánimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const em = moodInfo(e.mood);
                      return (
                        <tr key={e.id}>
                          <td className="col-time">
                            {e.start}
                            {e.end ? ` – ${e.end}` : ''}
                            {!e.end && e.minutes ? (
                              <span className="notes" title="Hasta la siguiente actividad">
                                ≈ {formatDuration(e.minutes)}
                              </span>
                            ) : null}
                          </td>
                          <td>
                            {e.activity}
                            {e.notes && <span className="notes">{e.notes}</span>}
                          </td>
                          <td className="col-cat">
                            <CategoryLabel id={e.category} />
                          </td>
                          <td className="col-mood" title={em?.label}>
                            {em ? em.emoji : <span className="muted">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {day?.reflection && <blockquote className="quote">{day.reflection}</blockquote>}
            </article>
          );
        })}
      </section>

      <TherapistNotes key={`${dataset.patientName}|${week}`} value={note} onChange={onNote} />
    </div>
  );
}

function TherapistNotes({ value, onChange }: { value: string; onChange: (note: string) => void }) {
  const [text, setText] = useState(value);

  useEffect(() => {
    if (text === value) return;
    const t = window.setTimeout(() => onChange(text), 500);
    return () => window.clearTimeout(t);
  }, [text, value, onChange]);

  return (
    <section className="card notes-card no-print">
      <h3>Notas de sesión</h3>
      <p className="hint">Solo para vos: se guardan en este dispositivo y no se comparten.</p>
      <textarea
        className="textarea"
        rows={4}
        placeholder="Temas para trabajar, patrones que notaste, preguntas para la próxima sesión…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onChange(text)}
      />
    </section>
  );
}
