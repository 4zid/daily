import { useRef, useState } from 'react';
import { Copy, Download, Eye, Upload } from 'lucide-react';
import type { StoreData } from '../types';
import { weekRangeLabel } from '../lib/date';
import { actions, exportBackup, parseBackup } from '../lib/store';
import { Modal, downloadJson } from './common';

export function SettingsDialog({
  open,
  data,
  onClose,
  onToast,
}: {
  open: boolean;
  data: StoreData;
  onClose: () => void;
  onToast: (text: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  async function importFile(file: File) {
    try {
      const backup = parseBackup(await file.text());
      const count = Object.keys(backup.days).length;
      if (!window.confirm(`Se van a importar ${count} días. Los días que ya tengas con la misma fecha se reemplazan. ¿Continuar?`)) {
        return;
      }
      actions.importBackup(backup);
      onToast(`Importaste ${count} días.`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'No pude leer el archivo.');
    }
  }

  return (
    <Modal open={open} title="Ajustes" onClose={onClose}>
      <div className="modal-section">
        <label className="field">
          <span>Tu nombre</span>
          <input
            className="input"
            type="text"
            maxLength={80}
            placeholder="Aparece en el informe para tu terapeuta"
            value={data.patientName}
            onChange={(e) => actions.setPatientName(e.target.value)}
          />
        </label>
      </div>

      <div className="modal-section">
        <h3>Tema</h3>
        <div className="segmented" role="group" aria-label="Tema">
          {(
            [
              ['system', 'Sistema'],
              ['light', 'Claro'],
              ['dark', 'Oscuro'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={data.settings.theme === value}
              onClick={() => actions.setSettings({ theme: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="modal-section">
        <label className="field">
          <span>Código de acceso a la IA (si tu servidor lo pide)</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            value={data.settings.accessCode}
            onChange={(e) => actions.setSettings({ accessCode: e.target.value })}
          />
        </label>
        <p>Es el valor de APP_ACCESS_CODE configurado al publicar la app. Si no hay uno, dejalo vacío.</p>
      </div>

      <div className="modal-section">
        <h3>Respaldo</h3>
        <p>Tus registros se guardan solo en este navegador. Descargá un respaldo para no perderlos o para pasarlos a otro dispositivo.</p>
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => downloadJson(`daily-respaldo-${new Date().toISOString().slice(0, 10)}.json`, exportBackup(data))}
          >
            <Download />
            Descargar respaldo
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Upload />
            Importar respaldo
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="modal-section">
        <h3>Borrar datos</h3>
        <p>Elimina todos los registros de este dispositivo. No se puede deshacer.</p>
        <div className="row">
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm('¿Borrar todos tus registros de este dispositivo? Esta acción no se puede deshacer.')) {
                actions.clearAll();
                onToast('Se borraron todos los registros.');
              }
            }}
          >
            Borrar todo
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ShareDialog({
  open,
  url,
  week,
  data,
  onClose,
  onPreview,
  onToast,
}: {
  open: boolean;
  url: string | null;
  week: string;
  data: StoreData;
  onClose: () => void;
  onPreview: () => void;
  onToast: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast('No pude copiar. Seleccioná el link y copialo a mano.');
    }
  }

  return (
    <Modal open={open} title={`Compartir semana del ${weekRangeLabel(week)}`} onClose={onClose}>
      <div className="modal-section share-box">
        <h3>Link para tu terapeuta</h3>
        <p>
          El link abre la vista de terapeuta con los registros de esta semana. Los datos van dentro del link (no se suben a
          ningún servidor), así que compartilo solo con tu terapeuta.
        </p>
        <input
          className="input"
          readOnly
          value={url ?? 'Generando…'}
          onFocus={(e) => e.target.select()}
          aria-label="Link para compartir"
        />
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={copy} disabled={!url}>
            <Copy />
            {copied ? '¡Copiado!' : 'Copiar link'}
          </button>
          <button type="button" className="btn" onClick={onPreview}>
            <Eye />
            Ver cómo lo ve
          </button>
        </div>
      </div>
      <div className="modal-section">
        <h3>Otras opciones</h3>
        <p>Podés enviarle el archivo de respaldo completo, o imprimir el informe semanal / guardarlo como PDF desde la vista de terapeuta.</p>
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() => downloadJson(`daily-${data.patientName || 'registro'}-${week}.json`, exportBackup(data))}
          >
            <Download />
            Descargar archivo
          </button>
        </div>
      </div>
    </Modal>
  );
}
