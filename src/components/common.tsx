import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import {
  Annoyed,
  Briefcase,
  Check,
  Frown,
  Laugh,
  Meh,
  Smile,
  Dumbbell,
  HeartPulse,
  House,
  Moon,
  Shapes,
  Tv,
  Users,
  Utensils,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { CategoryId, Mood, Rating } from '../types';
import { MOODS, SCALES, categoryColorVar, getCategory, type ScaleKey } from '../lib/categories';

const CATEGORY_ICONS: Record<CategoryId, LucideIcon> = {
  trabajo: Briefcase,
  comidas: Utensils,
  movimiento: Dumbbell,
  ocio: Tv,
  vinculos: Users,
  autocuidado: HeartPulse,
  descanso: Moon,
  tareas: House,
  otro: Shapes,
};

export function CategoryIcon({ id }: { id: CategoryId }) {
  const Icon = CATEGORY_ICONS[id] ?? Shapes;
  return <Icon aria-hidden />;
}

const MOOD_ICONS: Record<Mood, LucideIcon> = { 1: Frown, 2: Annoyed, 3: Meh, 4: Smile, 5: Laugh };

/** Ánimo como ícono de línea, en el mismo lenguaje que el resto de la interfaz. */
export function MoodIcon({ value }: { value: number }) {
  const Icon = MOOD_ICONS[Math.min(5, Math.max(1, Math.round(value))) as Mood];
  return <Icon aria-hidden />;
}

/** Círculo con el ícono de la categoría, como los logos de una lista de movimientos. */
export function CategoryAvatar({ id }: { id: CategoryId }) {
  return (
    <span className="avatar" style={{ ['--c' as string]: categoryColorVar(id) }} aria-hidden>
      <CategoryIcon id={id} />
    </span>
  );
}

/** Píldora con punto de color y nombre: el nombre siempre acompaña al color. */
export function CategoryPill({ id }: { id: CategoryId }) {
  return (
    <span className="pill-tag">
      <span className="dot" style={{ background: categoryColorVar(id) }} aria-hidden />
      {getCategory(id).label}
    </span>
  );
}

export function CategoryLabel({ id }: { id: CategoryId }) {
  return (
    <span className="cat-label">
      <span className="dot" style={{ background: categoryColorVar(id) }} aria-hidden />
      <span>{getCategory(id).label}</span>
    </span>
  );
}

/** Check redondo: círculo negro con tilde cuando está marcado. */
export function RoundCheck({ checked }: { checked: boolean }) {
  return (
    <span className={`round-check${checked ? ' is-on' : ''}`} aria-hidden>
      {checked && <Check />}
    </span>
  );
}

export function MoodPicker({
  value,
  onChange,
  size,
  label,
}: {
  value: Mood | undefined;
  onChange: (mood: Mood | undefined) => void;
  size?: 'sm';
  label: string;
}) {
  return (
    <div className={`mood-picker${size ? ` ${size}` : ''}`} role="group" aria-label={label}>
      {MOODS.map((m) => (
        <button
          key={m.value}
          type="button"
          aria-pressed={value === m.value}
          title={m.label}
          aria-label={m.label}
          onClick={() => onChange(value === m.value ? undefined : m.value)}
        >
          <MoodIcon value={m.value} />
        </button>
      ))}
    </div>
  );
}

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function fmtScore(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
}

/**
 * Escala del 1 al 10 como barra segmentada: los tramos hasta el valor elegido
 * se llenan. Funciona como radiogroup (flechas para cambiar el valor).
 */
export function RatingScale({
  scale,
  value,
  onChange,
}: {
  scale: ScaleKey;
  value: Rating | undefined;
  onChange: (value: Rating | undefined) => void;
}) {
  const info = SCALES[scale];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.min(10, Math.max(1, (value ?? 0) + delta)) as Rating;
    onChange(next);
    refs.current[next - 1]?.focus();
  }

  return (
    <div className="rating" style={{ ['--tone' as string]: info.color }}>
      <div className="rating-head">
        <span className="rating-label" id={`rating-${scale}`}>
          <span className="dot" aria-hidden />
          {info.label}
          <span className="rating-question">{info.question}</span>
        </span>
        <span className="rating-value" aria-hidden>
          {value ?? '–'}
          <small>/10</small>
        </span>
      </div>
      <div className="rating-scale" role="radiogroup" aria-labelledby={`rating-${scale}`} onKeyDown={onKeyDown}>
        {STEPS.map((n) => (
          <button
            key={n}
            ref={(el) => {
              refs.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} de 10`}
            tabIndex={value ? (value === n ? 0 : -1) : n === 1 ? 0 : -1}
            className={`rating-step${value && n <= value ? ' is-filled' : ''}`}
            onClick={() => onChange(value === n ? undefined : n)}
          >
            <span className="rating-bar" aria-hidden />
            <span className="rating-num" aria-hidden>
              {n}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Puntajes de placer y control de una actividad, para listas e informes. */
export function Scores({ pleasure, control, compact }: { pleasure?: number | null; control?: number | null; compact?: boolean }) {
  if (!pleasure && !control) {
    return compact ? null : <span className="scores scores-empty">Sin puntaje</span>;
  }
  return (
    <span className={`scores${compact ? ' is-compact' : ''}`}>
      {(['pleasure', 'control'] as const).map((key) => {
        const v = key === 'pleasure' ? pleasure : control;
        return (
          <span key={key} className="score" style={{ ['--tone' as string]: SCALES[key].color }}>
            <span className="dot" aria-hidden />
            <span className="score-label">{SCALES[key].label}</span>
            <b className="tabular">{v ? fmtScore(v) : '–'}</b>
          </span>
        );
      })}
    </span>
  );
}

export interface MenuItem {
  /** Clave única si puede haber títulos repetidos. */
  id?: string;
  label: string;
  hint?: string;
  selected?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

/** Menú desplegable con ítems de título y subtítulo; el elegido lleva un check redondo. */
export function Menu({
  label,
  trigger,
  triggerClassName,
  items,
  align = 'end',
  placement = 'bottom',
}: {
  label: string;
  trigger: ReactNode;
  triggerClassName: string;
  items: MenuItem[];
  align?: 'start' | 'end';
  placement?: 'bottom' | 'top';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectable = items.some((item) => item.selected !== undefined);

  function close(focusTrigger: boolean) {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    // Foco en el ítem elegido o en el primero.
    const options = menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    (menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? options?.[0])?.focus();
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      close(false);
      return;
    }
    const options = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
    const index = options.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'ArrowDown' ? (index + 1) % options.length
      : e.key === 'ArrowUp' ? (index - 1 + options.length) % options.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? options.length - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    options[next]?.focus();
  }

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close(false) : setOpen(true))}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          className={`menu menu-${align} menu-${placement}`}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.id ?? item.label}
              type="button"
              role={selectable ? 'menuitemradio' : 'menuitem'}
              aria-checked={selectable ? Boolean(item.selected) : undefined}
              tabIndex={-1}
              className={`menu-item${item.selected ? ' is-selected' : ''}${item.danger ? ' is-danger' : ''}`}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              <span>
                <span className="menu-title">{item.label}</span>
                {item.hint && <span className="menu-hint">{item.hint}</span>}
              </span>
              {item.selected && <RoundCheck checked />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="circle-btn sm" onClick={onClose} aria-label="Cerrar">
          <X />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

export interface ToastState {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}

export function Toast({ toast, onDone }: { toast: ToastState | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onDone, toast.action ? 6000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast, onDone]);

  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action!.run();
            onDone();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M5 16.5h14M8 12.5a4 4 0 0 1 8 0" />
        </svg>
      </span>
      <span>daily</span>
    </div>
  );
}

/** Iniciales de un nombre en un círculo (lista de pacientes). */
export function Initials({ name }: { name: string }) {
  const letters =
    name
      .trim()
      .split(/\s+/)
      .filter((w) => !/^(lic|dr|dra|psic|ps)\.?$/i.test(w))
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('') || '?';
  return (
    <span className="initials" aria-hidden>
      {letters}
    </span>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
