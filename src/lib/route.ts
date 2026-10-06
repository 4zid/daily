import { useEffect, useState } from 'react';

// Rutas con hash: "#/registro", "#/informe", "#/invitacion/CODIGO".

function currentPath(): string {
  return window.location.hash.replace(/^#\/?/, '').split('?')[0];
}

/** Lo que sigue a "#/" en la URL; se actualiza al navegar. */
export function useHashPath(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onHash = () => {
      // Solo las rutas "#/…" cambian de vista; otros fragmentos no.
      if (window.location.hash && !window.location.hash.startsWith('#/')) return;
      setPath(currentPath());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return path;
}

/** Cambia de ruta. Con `replace` no deja la ruta anterior en el historial. */
export function navigate(path: string, replace = false) {
  if (replace) {
    history.replaceState(null, '', `#/${path}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = `/${path}`;
  }
}

/** Código de invitación de una ruta "invitacion/CODIGO". */
export function inviteCodeFrom(path: string): string | null {
  const match = /^invitacion\/([A-Za-z0-9]{4,32})$/.exec(path);
  return match ? match[1].toUpperCase() : null;
}
