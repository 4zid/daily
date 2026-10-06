import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Copy, Download, LogOut, MessageCircle, Send, Share2, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  createInvitation,
  deleteInvitation,
  deleteMyAccount,
  fetchAllDays,
  fetchInvitations,
  inviteUrl,
  type Invitation,
} from '../lib/cloud';
import { buildBackup, local, useLocal } from '../lib/store';
import { authErrorMessage } from '../lib/supabase';
import { Modal, copyText, downloadJson } from './common';

const THEMES = [
  ['system', 'Sistema'],
  ['light', 'Claro'],
  ['dark', 'Oscuro'],
] as const;

export function SettingsDialog({
  open,
  therapistName,
  onEndLink,
  onClose,
  onToast,
}: {
  open: boolean;
  /** Paciente: nombre del terapeuta vinculado (null si no hay). */
  therapistName?: string | null;
  /** Paciente: deja de compartir el registro con su terapeuta. */
  onEndLink?: () => Promise<void>;
  onClose: () => void;
  onToast: (text: string) => void;
}) {
  const auth = useAuth();
  const { theme } = useLocal();
  const ids = useId();
  const profile = auth.profile!;
  const isPatient = profile.role === 'patient';
  const [name, setName] = useState(profile.full_name);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(profile.full_name);
      setPassword('');
    }
  }, [open, profile.full_name]);

  async function task(id: string, run: () => Promise<void>) {
    setBusy(id);
    try {
      await run();
    } catch (error) {
      onToast(authErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  function saveName() {
    const next = name.trim();
    if (!next || next === profile.full_name) return;
    void task('name', async () => {
      await auth.updateName(next);
      onToast('Guardaste tu nombre.');
    });
  }

  function savePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      onToast('La contraseña tiene que tener al menos 8 caracteres.');
      return;
    }
    void task('password', async () => {
      await auth.updatePassword(password);
      setPassword('');
      onToast('Cambiaste tu contraseña.');
    });
  }

  function downloadBackup() {
    void task('backup', async () => {
      const days = await fetchAllDays(profile.id);
      downloadJson(`daily-respaldo-${new Date().toISOString().slice(0, 10)}.json`, buildBackup(profile.full_name, days));
    });
  }

  function removeAccount() {
    const answer = window.prompt(
      isPatient
        ? 'Se borran tu cuenta y todos tus registros, y tu terapeuta deja de verlos. No se puede deshacer.\n\nEscribí ELIMINAR para confirmar.'
        : 'Se borran tu cuenta, tus notas de sesión y tus invitaciones. Tus pacientes conservan sus registros.\n\nEscribí ELIMINAR para confirmar.',
    );
    if (answer?.trim().toUpperCase() !== 'ELIMINAR') return;
    void task('delete', async () => {
      await deleteMyAccount();
      await auth.signOut();
    });
  }

  return (
    <Modal open={open} title="Ajustes" onClose={onClose}>
      <div className="modal-section">
        <h3>Tu cuenta</h3>
        <div className="field">
          <label htmlFor={`${ids}-name`}>{isPatient ? 'Tu nombre (lo ve tu terapeuta)' : 'Tu nombre (lo ven tus pacientes)'}</label>
          <input
            id={`${ids}-name`}
            className="input"
            type="text"
            maxLength={120}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          />
        </div>
        <p>
          Ingresás con <b>{auth.session?.user.email}</b>.
        </p>
      </div>

      {isPatient && (
        <div className="modal-section">
          <h3>Tu terapeuta</h3>
          {therapistName === null ? (
            <p>No estás compartiendo tu registro con nadie. Si tu terapeuta te manda un link de invitación, abrilo para vincularte.</p>
          ) : (
            <>
              <p>
                Compartís tu registro con <b>{therapistName || 'tu terapeuta'}</b>: ve tus actividades, puntajes y reflexiones,
                pero no puede cambiarlos.
              </p>
              {onEndLink && (
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy === 'unlink'}
                    onClick={() => {
                      if (window.confirm(`¿Dejar de compartir tu registro con ${therapistName || 'tu terapeuta'}? Va a dejar de verlo enseguida.`)) {
                        void task('unlink', onEndLink);
                      }
                    }}
                  >
                    Dejar de compartir
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="modal-section">
        <h3>Tema</h3>
        <div className="segmented" role="group" aria-label="Tema">
          {THEMES.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={theme === value} onClick={() => local.setTheme(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {isPatient && (
        <div className="modal-section">
          <h3>Respaldo</h3>
          <p>Tus registros se guardan en tu cuenta. Si querés una copia propia, descargala en un archivo.</p>
          <div className="row">
            <button type="button" className="btn" onClick={downloadBackup} disabled={busy === 'backup'}>
              <Download />
              {busy === 'backup' ? 'Preparando…' : 'Descargar mis registros'}
            </button>
          </div>
        </div>
      )}

      <form className="modal-section" onSubmit={savePassword}>
        <h3>Contraseña</h3>
        <div className="inline-field">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            placeholder="Contraseña nueva"
            aria-label="Contraseña nueva"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" className="btn" disabled={!password || busy === 'password'}>
            Cambiar
          </button>
        </div>
      </form>

      <div className="modal-section">
        <div className="row">
          <button type="button" className="btn" onClick={() => void auth.signOut()}>
            <LogOut />
            Cerrar sesión
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-ghost btn-danger" onClick={removeAccount} disabled={busy === 'delete'}>
            Eliminar cuenta
          </button>
        </div>
      </div>
    </Modal>
  );
}

function shareMessage(url: string, label: string, therapistName: string) {
  const hello = label ? `¡Hola, ${label.split(/\s+/)[0]}!` : '¡Hola!';
  const from = therapistName ? ` Soy ${therapistName}.` : '';
  return `${hello}${from} Te invito a llevar tu registro diario en daily: anotás tus actividades del día y yo las veo antes de la sesión. Creá tu cuenta con este link: ${url}`;
}

function formatShort(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export function InviteDialog({
  open,
  therapistName,
  onClose,
  onToast,
}: {
  open: boolean;
  therapistName: string;
  onClose: () => void;
  onToast: (text: string) => void;
}) {
  const ids = useId();
  const [label, setLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<Invitation | null>(null);
  const [pending, setPending] = useState<Invitation[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchInvitations()
      .then((list) => setPending(list.filter((i) => !i.used_at)))
      .catch(() => setPending([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setLabel('');
    refresh();
  }, [open, refresh]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const invitation = await createInvitation(label);
      setCreated(invitation);
      refresh();
    } catch {
      onToast('No pude crear la invitación. Probá de nuevo.');
    } finally {
      setCreating(false);
    }
  }

  async function copy(invitation: Invitation) {
    if (await copyText(inviteUrl(invitation.code))) {
      setCopied(invitation.code);
      window.setTimeout(() => setCopied((c) => (c === invitation.code ? null : c)), 2000);
    } else {
      onToast('No pude copiar. Seleccioná el link y copialo a mano.');
    }
  }

  async function revoke(invitation: Invitation) {
    if (!window.confirm('¿Borrar esta invitación? El link deja de funcionar.')) return;
    try {
      await deleteInvitation(invitation.code);
      if (created?.code === invitation.code) setCreated(null);
      refresh();
    } catch {
      onToast('No pude borrar la invitación.');
    }
  }

  const url = created ? inviteUrl(created.code) : '';
  const message = created ? shareMessage(url, created.patient_label, therapistName) : '';
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  const now = Date.now();

  return (
    <Modal open={open} title="Invitar paciente" onClose={onClose}>
      {created ? (
        <div className="modal-section share-box">
          <h3>Link para {created.patient_label || 'tu paciente'}</h3>
          <p>
            Con este link crea su cuenta y queda vinculada a la tuya. Sirve para una sola cuenta y vence el{' '}
            {formatShort(created.expires_at)}.
          </p>
          <input className="input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link de invitación" />
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => void copy(created)}>
              <Copy />
              {copied === created.code ? '¡Copiado!' : 'Copiar link'}
            </button>
            <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
              <MessageCircle />
              WhatsApp
            </a>
            <a
              className="btn"
              href={`mailto:?subject=${encodeURIComponent('Tu invitación a daily')}&body=${encodeURIComponent(message)}`}
            >
              <Send />
              Email
            </a>
            {canShare && (
              <button
                type="button"
                className="btn"
                onClick={() => void navigator.share({ title: 'Invitación a daily', text: message }).catch(() => {})}
              >
                <Share2 />
                Más
              </button>
            )}
          </div>
          <div className="row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreated(null)}>
              Crear otra invitación
            </button>
          </div>
        </div>
      ) : (
        <form className="modal-section" onSubmit={create}>
          <p>
            Creá un link y mandáselo a tu paciente. Cuando cree su cuenta con ese link, va a aparecer en tu lista y vas a ver
            lo que registre.
          </p>
          <div className="field">
            <label htmlFor={`${ids}-label`}>¿A quién invitás? (opcional, solo lo ves vos)</label>
            <div className="inline-field">
              <input
                id={`${ids}-label`}
                className="input"
                type="text"
                maxLength={120}
                placeholder="Nombre del paciente"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={creating}>
                {creating ? 'Creando…' : 'Crear link'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="modal-section">
        <h3>Invitaciones pendientes</h3>
        {pending === null ? (
          <p>Cargando…</p>
        ) : pending.length === 0 ? (
          <p>No tenés invitaciones sin usar.</p>
        ) : (
          <ul className="invite-list">
            {pending.map((inv) => {
              const expired = new Date(inv.expires_at).getTime() < now;
              return (
                <li key={inv.code} className="invite-row">
                  <span className="invite-main">
                    <b>{inv.patient_label || 'Sin nombre'}</b>
                    <small>
                      <span className="code">{inv.code}</span> ·{' '}
                      {expired ? 'Vencida' : `Vence el ${formatShort(inv.expires_at)}`}
                    </small>
                  </span>
                  {!expired && (
                    <button
                      type="button"
                      className="circle-btn ghost sm"
                      aria-label={`Copiar link de ${inv.patient_label || 'la invitación'}`}
                      title={copied === inv.code ? '¡Copiado!' : 'Copiar link'}
                      onClick={() => void copy(inv)}
                    >
                      <Copy />
                    </button>
                  )}
                  <button
                    type="button"
                    className="circle-btn ghost sm"
                    aria-label={`Borrar invitación de ${inv.patient_label || 'paciente sin nombre'}`}
                    title="Borrar"
                    onClick={() => void revoke(inv)}
                  >
                    <Trash2 />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
