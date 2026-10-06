import { CalendarDays } from 'lucide-react';
import { isoWeekNumber, weekRangeLabel } from '../lib/date';
import type { WeekSummary } from '../lib/cloud';

/** Semanas con registros, más la actual y la que se está viendo. */
export function mergeWeeks(list: WeekSummary[], ...extra: WeekSummary[]): WeekSummary[] {
  const map = new Map(list.map((w) => [w.week, w.entries]));
  for (const w of extra) map.set(w.week, Math.max(w.entries, map.get(w.week) ?? 0));
  return [...map].map(([week, entries]) => ({ week, entries })).sort((a, b) => b.week.localeCompare(a.week));
}

export function WeekList({
  weeks,
  current,
  thisWeek,
  onSelect,
}: {
  weeks: WeekSummary[];
  current: string;
  thisWeek: string;
  onSelect: (monday: string) => void;
}) {
  return (
    <ul className="nav-list">
      {weeks.map(({ week: monday, entries: count }) => (
        <li key={monday}>
          <button
            type="button"
            className="nav-item"
            aria-current={monday === current ? 'true' : undefined}
            onClick={() => onSelect(monday)}
          >
            <CalendarDays aria-hidden />
            <span className="nav-text">
              {monday === thisWeek ? 'Esta semana' : `Semana ${isoWeekNumber(monday)}`}
              <small>{weekRangeLabel(monday)}</small>
            </span>
            {count > 0 && (
              <span className="nav-badge" title={`${count} actividades`}>
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
