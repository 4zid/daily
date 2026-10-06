import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Briefcase,
  Check,
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
import type { CategoryId, Mood } from '../types';
import { MOODS, categoryColorVar, getCategory } from '../lib/categories';

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
          <span aria-hidden>{m.emoji}</span>
        </button>
      ))}
    </div>
  );
}

export interface MenuItem {
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

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div className={`menu menu-${align} menu-${placement}`} role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu-item${item.selected ? ' is-selected' : ''}${item.danger ? ' is-danger' : ''}`}
              onClick={() => {
                setOpen(false);
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
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
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
