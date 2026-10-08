import { useEffect, useState } from 'react';

// Rutas con hash: "#/registro", "#/informe", "#/invitacion/CODIGO", "#/privacidad", "#/terminos".

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

// Marca en el historial de una ruta abierta desde otra pantalla de la app: "Volver" puede ir
// atrás sin salir de daily. Abierta desde un link externo, en otra pestaña o escribiendo la
// dirección, no la tiene.
const RETURN_STATE = 'daily-return';
// Dónde estaba la pantalla de la que se salió, para volver al mismo lugar (ver returnScroll).
const SCROLL_STATE = 'daily-scroll';

/** Abre una ruta recordando que "atrás" vuelve a la pantalla actual. */
export function navigateWithReturn(path: string) {
  history.replaceState({ ...(history.state ?? {}), [SCROLL_STATE]: window.scrollY }, '');
  history.pushState({ [RETURN_STATE]: true }, '', `#/${path}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Al volver con "atrás" a una pantalla que abrió otra con navigateWithReturn: dónde estaba. */
export function returnScroll(): number | null {
  const y = (history.state as Record<string, unknown> | null)?.[SCROLL_STATE];
  return typeof y === 'number' ? y : null;
}

/** Si "atrás" lleva a otra pantalla de daily (ver navigateWithReturn). */
export function canReturn(): boolean {
  const state = history.state as Record<string, unknown> | null;
  return state?.[RETURN_STATE] === true;
}

/** Cambia de ruta sin sumar al historial y sin perder la marca de navigateWithReturn. */
export function replacePath(path: string) {
  history.replaceState(history.state, '', `#/${path}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Lo que sigue a "?" en la ruta (por ejemplo, "#/privacidad?seccion=ia"). */
export function routeParam(name: string): string | null {
  const query = window.location.hash.split('?')[1];
  return query ? new URLSearchParams(query).get(name) : null;
}

/** Código de invitación de una ruta "invitacion/CODIGO". */
export function inviteCodeFrom(path: string): string | null {
  const match = /^invitacion\/([A-Za-z0-9]{4,32})$/.exec(path);
  return match ? match[1].toUpperCase() : null;
}
