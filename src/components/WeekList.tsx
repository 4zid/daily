import { CalendarDays } from 'lucide-react';
import type { DayLog } from '../types';
import { isoWeekNumber, weekRangeLabel } from '../lib/date';
import { countWeekEntries } from '../lib/stats';

export function WeekList({
  weeks,
  current,
  thisWeek,
  days,
  onSelect,
}: {
  weeks: string[];
  current: string;
  thisWeek: string;
  days: Record<string, DayLog>;
  onSelect: (monday: string) => void;
}) {
  return (
    <ul className="nav-list">
      {weeks.map((monday) => {
        const count = countWeekEntries(days, monday);
        return (
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
        );
      })}
    </ul>
  );
}
