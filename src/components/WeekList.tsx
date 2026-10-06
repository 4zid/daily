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
    <ul className="weeks-list">
      {weeks.map((monday) => {
        const count = countWeekEntries(days, monday);
        return (
          <li key={monday}>
            <button
              type="button"
              className="week-item"
              aria-current={monday === current}
              onClick={() => onSelect(monday)}
            >
              <span>
                <span className="week-item-title">
                  {monday === thisWeek ? 'Esta semana' : `Semana ${isoWeekNumber(monday)}`}
                </span>
                <br />
                <span className="week-item-range">{weekRangeLabel(monday)}</span>
              </span>
              <span className="badge" title={`${count} actividades`}>
                {count}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
