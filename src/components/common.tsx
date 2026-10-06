import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { CategoryId, Mood } from '../types';
import { MOODS, categoryColorVar, getCategory } from '../lib/categories';

export function CategoryLabel({ id }: { id: CategoryId }) {
  return (
    <span className="cat-label">
      <span className="dot" style={{ background: categoryColorVar(id) }} aria-hidden />
      <span>{getCategory(id).label}</span>
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
        <button type="button" className="icon-btn sm" onClick={onClose} aria-label="Cerrar">
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
      {toast.text}
      {toast.action && (
        <>
          {' · '}
          <button
            type="button"
            className="btn-ghost"
            style={{ border: 0, background: 'none', color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}
            onClick={() => {
              toast.action!.run();
              onDone();
            }}
          >
            {toast.action.label}
          </button>
        </>
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
