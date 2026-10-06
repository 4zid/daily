import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, NotebookPen, Printer } from 'lucide-react';
import type { CategoryId, PatientDataset } from '../types';
import { CATEGORIES, MOODS, SCALES, getCategory, moodInfo, type ScaleKey } from '../lib/categories';
import {
  formatDuration,
  isoWeekNumber,
  longDate,
  parseISODate,
  weekRangeLabel,
  weekdayShort,
} from '../lib/date';
import { weekStats, withDurations, type RatedEntry } from '../lib/stats';
import { CategoryAvatar, CategoryPill, Menu, Scores } from './common';
import { CategoryBars, DaySegments, RatingsChart } from './Charts';

export type DataSource = 'local' | 'link' | 'file';

function fmt(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

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
  const [filter, setFilter] = useState<CategoryId | 'todas'>('todas');
  const name = dataset.patientName.trim();
  const avgMood = stats.avgMood ? MOODS[Math.round(stats.avgMood) - 1] : null;
  const constancy = Math.round((stats.daysWithEntries / 7) * 100);
  const usedCategories = new Set(stats.minutesByCategory.map((c) => c.id));

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
            . No se guarda en este dispositivo.
          </span>
          <button type="button" className="btn btn-sm" onClick={onBackToLocal}>
            Ver datos de este dispositivo
          </button>
        </div>
      )}

      <header className="page-head">
        <div>
          <p className="kicker">
            Informe semanal{name ? <> · <b>{name}</b></> : null} · Semana <b>{isoWeekNumber(week)}</b>
          </p>
          <h1 className="display">
            {weekRangeLabel(week)} <span className="display-soft">{parseISODate(week).getFullYear()}</span>
          </h1>
        </div>
        <div className="page-actions no-print">
          <div className="arrows">
            <button type="button" className="circle-btn" onClick={() => onWeekStep(-1)} aria-label="Semana anterior">
              <ChevronLeft />
            </button>
            <button type="button" className="circle-btn" onClick={() => onWeekStep(1)} aria-label="Semana siguiente">
              <ChevronRight />
            </button>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Printer aria-hidden />
            Imprimir / PDF
          </button>
        </div>
      </header>

      <div className="grid-2 hero-row">
        <section className="hero-card" aria-label="Resumen de la semana">
          <svg className="hero-art" viewBox="0 0 400 300" aria-hidden preserveAspectRatio="xMaxYMin slice">
            <circle cx="120" cy="40" r="120" />
            <circle cx="300" cy="300" r="190" />
            <circle cx="345" cy="232" r="18" />
            <circle className="fill" cx="250" cy="30" r="2.5" />
            <circle className="fill" cx="30" cy="110" r="2.5" />
          </svg>
          <div className="hero-top">
            <span className="pill-outline">Resumen</span>
            <a className="circle-btn on-color" href="#registro-semana" aria-label="Ir al registro de la semana">
              <ArrowUpRight />
            </a>
          </div>
          {stats.avgPleasure || stats.avgControl ? (
            <div className="hero-text">
              <div className="hero-scores">
                {(['pleasure', 'control'] as const).map((k) => {
                  const v = k === 'pleasure' ? stats.avgPleasure : stats.avgControl;
                  return (
                    <div key={k} className="hero-score">
                      <span>{SCALES[k].label}</span>
                      <b>
                        {v ? fmt(v) : '–'}
                        <small>/10</small>
                      </b>
                    </div>
                  );
                })}
              </div>
              <p className="hero-sub">
                Promedios de la semana · {stats.totalEntries} actividad{stats.totalEntries === 1 ? '' : 'es'} en{' '}
                {stats.daysWithEntries} día{stats.daysWithEntries === 1 ? '' : 's'}
                {avgMood ? ` · Ánimo general: ${avgMood.label.toLowerCase()}` : ''}
              </p>
            </div>
          ) : stats.totalEntries > 0 || avgMood ? (
            <div className="hero-text">
              <p className="hero-title">Todavía no hay puntajes de placer y control</p>
              <p className="hero-sub">
                {stats.totalEntries} actividad{stats.totalEntries === 1 ? '' : 'es'} en {stats.daysWithEntries} día
                {stats.daysWithEntries === 1 ? '' : 's'}
                {avgMood ? ` · Ánimo general: ${avgMood.label.toLowerCase()}` : ''}
              </p>
            </div>
          ) : (
            <div className="hero-text">
              <p className="hero-title">Todavía no hay registros en esta semana</p>
              <p className="hero-sub">Pedile a tu paciente el link para compartir o el archivo de respaldo.</p>
            </div>
          )}
        </section>

        <section className="card stat-card" aria-labelledby="constancy-title">
          <h3 id="constancy-title" className="h3">
            Constancia
          </h3>
          <div className="stat-line">
            <span className="big-number">{constancy}%</span>
            <span className="soft-pill">
              {stats.daysWithEntries} de 7 días
            </span>
          </div>
          <DaySegments dates={stats.dates} days={dataset.days} />
          <div className="stat-foot no-print">
            <span className="lbl">Para la sesión:</span>
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => window.print()}>
                Imprimir
                <Printer aria-hidden />
              </button>
              <a className="btn btn-sm" href="#notas-sesion">
                Notas
                <NotebookPen aria-hidden />
              </a>
            </div>
          </div>
        </section>
      </div>

      {stats.totalEntries > 0 ? (
        <>
          <section className="card chart-card" aria-labelledby="ratings-title">
            <header className="card-head">
              <div>
                <h3 id="ratings-title" className="h3">
                  Placer y control por día
                </h3>
                <p className="sub">Promedio de las actividades, del 1 (nada) al 10 (muchísimo). Debajo, el ánimo del día.</p>
              </div>
            </header>
            <RatingsChart data={stats.ratingsByDay} moods={stats.moodByDay} />
          </section>

          <div className="grid-2">
            <section className="card chart-card" aria-labelledby="top-title">
              <header className="card-head">
                <div>
                  <h3 id="top-title" className="h3">
                    Actividades destacadas
                  </h3>
                  <p className="sub">Las de más placer y las de más control</p>
                </div>
              </header>
              <div className="tops">
                <TopList scale="pleasure" items={stats.topPleasure} />
                <TopList scale="control" items={stats.topControl} />
              </div>
            </section>

            <section className="card chart-card" aria-labelledby="time-title">
              <header className="card-head">
                <div>
                  <h3 id="time-title" className="h3">
                    Tiempo por categoría
                  </h3>
                  <p className="sub">Con placer y control promedio. Sin hora de fin, cuenta hasta la siguiente (máx. 4 h)</p>
                </div>
              </header>
              <CategoryBars data={stats.minutesByCategory} totalMinutes={stats.totalMinutes} />
            </section>
          </div>
        </>
      ) : null}

      <section className="card list-card" id="registro-semana" aria-labelledby="log-title">
        <header className="card-head">
          <div>
            <h3 id="log-title" className="h3">
              Registro de la semana
            </h3>
            <p className="sub">
              {longDate(stats.dates[0])} – {longDate(stats.dates[6])}
            </p>
          </div>
          {usedCategories.size > 1 && (
            <Menu
              label="Filtrar por categoría"
              triggerClassName="btn btn-sm no-print"
              trigger={
                <>
                  {filter === 'todas' ? 'Todas las categorías' : getCategory(filter).label}
                  <ChevronDown aria-hidden />
                </>
              }
              items={[
                { label: 'Todas las categorías', selected: filter === 'todas', onSelect: () => setFilter('todas') },
                ...CATEGORIES.filter((c) => usedCategories.has(c.id)).map((c) => ({
                  label: c.label,
                  selected: filter === c.id,
                  onSelect: () => setFilter(c.id),
                })),
              ]}
            />
          )}
        </header>

        <WeekLog dataset={dataset} dates={stats.dates} filter={filter} />
      </section>

      <TherapistNotes key={`${dataset.patientName}|${week}`} value={note} onChange={onNote} />
    </div>
  );
}

function WeekLog({
  dataset,
  dates,
  filter,
}: {
  dataset: PatientDataset;
  dates: string[];
  filter: CategoryId | 'todas';
}) {
  const withContent = dates.filter((date) => {
    const d = dataset.days[date];
    return d && (d.entries.length || d.reflection || d.mood);
  });
  const empty = dates.filter((date) => !withContent.includes(date));

  if (!withContent.length) {
    return <p className="empty-line">No hay registros en esta semana.</p>;
  }

  return (
    <div className="log">
      {withContent.map((date) => {
        const day = dataset.days[date]!;
        const entries = withDurations(day.entries).filter((e) => filter === 'todas' || e.category === filter);
        const mood = moodInfo(day.mood);
        return (
          <article key={date} className="log-day">
            <header className="log-day-head">
              <h4>{longDate(date)}</h4>
              {mood && (
                <span className="pill-tag">
                  {mood.emoji} Día: {mood.label}
                </span>
              )}
              <span className="sub">
                {day.entries.length} actividad{day.entries.length === 1 ? '' : 'es'}
              </span>
            </header>
            {entries.length > 0 && (
              <ul className="items">
                {entries.map((e) => {
                  return (
                    <li key={e.id} className="item is-static">
                      <CategoryAvatar id={e.category} />
                      <div className="item-main">
                        <p className="item-title">{e.activity}</p>
                        <p className="item-sub">
                          <span className="item-cat-inline">{getCategory(e.category).label}</span>
                          {e.notes && (
                            <span className="item-notes">
                              <span className="item-cat-inline"> · </span>
                              {e.notes}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="item-time tabular">
                        {e.start}
                        {e.end ? ` – ${e.end}` : ''}
                        {!e.end && e.minutes ? <small> ≈ {formatDuration(e.minutes)}</small> : null}
                      </span>
                      <span className="item-cat">
                        <CategoryPill id={e.category} />
                      </span>
                      <span className="item-scores">
                        <Scores pleasure={e.pleasure} control={e.control} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {day.reflection && <blockquote className="quote">{day.reflection}</blockquote>}
          </article>
        );
      })}
      {empty.length > 0 && (
        <p className="empty-line">Sin registros: {empty.map((d) => `${weekdayShort(d)} ${parseISODate(d).getDate()}`).join(', ')}</p>
      )}
    </div>
  );
}

function TopList({ scale, items }: { scale: ScaleKey; items: RatedEntry[] }) {
  const info = SCALES[scale];
  return (
    <div className="top-list" style={{ ['--tone' as string]: info.color }}>
      <p className="top-title">
        <span className="dot" aria-hidden />
        Más {info.label.toLowerCase()}
      </p>
      {items.length ? (
        <ol className="top-items">
          {items.map(({ date, entry }) => (
            <li key={entry.id} className="top-item">
              <CategoryAvatar id={entry.category} />
              <span className="top-main">
                <span className="top-activity">{entry.activity}</span>
                <small>
                  {weekdayShort(date)} {parseISODate(date).getDate()} · {entry.start}
                </small>
              </span>
              <b className="top-value tabular">{entry[scale]}</b>
            </li>
          ))}
        </ol>
      ) : (
        <p className="sub">Sin puntajes todavía.</p>
      )}
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
    <section className="tray no-print" id="notas-sesion">
      <div className="tray-card note-card">
        <label htmlFor="session-notes" className="h3">
          Notas de sesión
        </label>
        <textarea
          id="session-notes"
          className="note-input"
          rows={4}
          placeholder="Temas para trabajar, patrones que notaste, preguntas para la próxima sesión…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== value && onChange(text)}
        />
      </div>
      <div className="tray-foot">
        <span className="lbl">Solo para vos: se guardan en este dispositivo y no se comparten.</span>
      </div>
    </section>
  );
}
