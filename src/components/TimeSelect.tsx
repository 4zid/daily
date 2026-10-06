import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { normalizeTime, pad } from '../lib/date';

export interface TimeShortcut {
  label: string;
  value: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

/** Mueve el foco entre las opciones de una columna con las flechas. */
function onColumnKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  const options = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  const index = options.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    e.key === 'ArrowDown' ? index + 1 : e.key === 'ArrowUp' ? index - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : null;
  if (next === null) return;
  e.preventDefault();
  options[Math.max(0, Math.min(options.length - 1, next))]?.focus();
}

/**
 * Selector de hora en formato 24 h: un desplegable con columnas de horas y
 * minutos (de a 5), atajos y un campo para escribir la hora ("1430" o "14:30").
 */
export function TimeSelect({
  label,
  value,
  onChange,
  align = 'start',
  shortcuts = [],
  clearLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  align?: 'start' | 'end';
  shortcuts?: TimeShortcut[];
  /** Si se pasa, muestra un botón para dejar la hora vacía. */
  clearLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hoursRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLDivElement>(null);
  const [hour, minute] = value ? value.split(':') : [undefined, undefined];

  // Si la hora vino con minutos sueltos (por ejemplo de la IA), también se ofrecen.
  const minutes = useMemo(
    () => (minute && !MINUTES.includes(minute) ? [...MINUTES, minute].sort() : MINUTES),
    [minute],
  );

  function close(focusTrigger = true) {
    setOpen(false);
    setTyped('');
    if (focusTrigger) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    // Centra la hora elegida y pone el foco en ella.
    for (const col of [hoursRef.current, minutesRef.current]) {
      const selected = col?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (col && selected) col.scrollTop = selected.offsetTop - col.clientHeight / 2 + selected.clientHeight / 2;
    }
    (hoursRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ?? hoursRef.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function pickHour(h: string) {
    onChange(`${h}:${minute ?? '00'}`);
    // Sigue con los minutos.
    requestAnimationFrame(() => {
      (minutesRef.current?.querySelector<HTMLElement>('[aria-selected="true"]') ??
        minutesRef.current?.querySelector<HTMLElement>('[role="option"]'))?.focus();
    });
  }

  function pickMinute(m: string) {
    onChange(`${hour ?? '00'}:${m}`);
    close();
  }

  function submitTyped() {
    const t = normalizeTime(typed);
    if (t) {
      onChange(t);
      close();
    }
  }

  return (
    <div
      className={`time-select${align === 'end' ? ' is-end' : ''}`}
      ref={wrapRef}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`time-trigger${value ? '' : ' is-empty'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${value || 'sin elegir'}`}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="time-value tabular">{value || '--:--'}</span>
        <ChevronDown aria-hidden />
      </button>

      {open && (
        <div className={`time-pop is-${align}`} role="dialog" aria-label={`Elegir ${label.toLowerCase()}`}>
          {shortcuts.length > 0 && (
            <div className="time-shortcuts">
              {shortcuts.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  className="chip"
                  onClick={() => {
                    onChange(s.value);
                    close();
                  }}
                >
                  {s.label}
                  <span className="tabular muted">{s.value}</span>
                </button>
              ))}
            </div>
          )}

          <div className="time-cols">
            <div className="time-col-wrap">
              <span className="time-col-label">Hora</span>
              <div className="time-col" role="listbox" aria-label="Hora" ref={hoursRef} onKeyDown={onColumnKeyDown}>
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    role="option"
                    aria-selected={h === hour}
                    tabIndex={h === (hour ?? '00') ? 0 : -1}
                    className="time-option tabular"
                    onClick={() => pickHour(h)}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
            <div className="time-col-wrap">
              <span className="time-col-label">Min</span>
              <div className="time-col" role="listbox" aria-label="Minutos" ref={minutesRef} onKeyDown={onColumnKeyDown}>
                {minutes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="option"
                    aria-selected={m === minute}
                    tabIndex={m === (minute ?? '00') ? 0 : -1}
                    className="time-option tabular"
                    onClick={() => pickMinute(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="time-foot">
            <input
              className="time-typed"
              inputMode="numeric"
              placeholder="Escribí: 14:30"
              aria-label={`Escribir ${label.toLowerCase()}`}
              value={typed}
              maxLength={5}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitTyped();
                }
              }}
            />
            {clearLabel && value && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  onChange('');
                  close();
                }}
              >
                {clearLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
