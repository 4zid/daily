// Links de los emails de la cuenta. Los templates propios (supabase/templates) llevan a la raíz
// con "?token_hash=…&type=…", antes del hash, y sirven en cualquier dispositivo. Los links de
// siempre de Supabase llegan con "?code=…" (solo sirven en el navegador donde se creó la cuenta)
// o, si vencieron o ya se usaron, con "error=…" en la búsqueda o en el hash.
//
// Se lee una sola vez, al cargar la página (main.tsx importa este módulo antes que nada), y el
// token y los errores se sacan de la dirección enseguida: el token sirve una sola vez y no tiene
// que quedar en el historial. "?code=" queda: lo canjea y lo saca Supabase al iniciar.

/** Los tipos de link que verifica la app (los de verifyOtp para emails). */
export type EmailLinkType = 'email' | 'signup' | 'magiclink' | 'recovery' | 'email_change';

export type StartupLink =
  | { kind: 'token'; tokenHash: string; type: EmailLinkType }
  | { kind: 'code' }
  | { kind: 'invalid'; type: EmailLinkType | null };

const TYPES: readonly string[] = ['email', 'signup', 'magiclink', 'recovery', 'email_change'];
const ERROR_KEYS = ['error', 'error_code', 'error_description'];

function isLinkType(value: string | null): value is EmailLinkType {
  return value !== null && TYPES.includes(value);
}

function readStartupLink(): StartupLink | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const search = url.searchParams;
  // Supabase manda los errores también en el hash ("#error=…"), que no es una ruta de la app ("#/…").
  const hash = url.hash && !url.hash.startsWith('#/') ? new URLSearchParams(url.hash.slice(1)) : null;
  const errorInHash = Boolean(hash && ERROR_KEYS.some((key) => hash.has(key)));

  let link: StartupLink | null = null;
  const tokenHash = search.get('token_hash');
  if (tokenHash) {
    const type = search.get('type');
    link = isLinkType(type) ? { kind: 'token', tokenHash, type } : { kind: 'invalid', type: null };
    search.delete('token_hash');
    search.delete('type');
  } else if (errorInHash || ERROR_KEYS.some((key) => search.has(key))) {
    link = { kind: 'invalid', type: null };
    for (const key of [...ERROR_KEYS, 'sb_flow_id']) search.delete(key);
    if (errorInHash) url.hash = '';
  } else if (search.has('code')) {
    return { kind: 'code' };
  }
  if (link) {
    const query = search.toString();
    history.replaceState(history.state, '', `${url.pathname}${query ? `?${query}` : ''}${url.hash}`);
  }
  return link;
}

/** El link con el que se abrió la página, si vino de un email de la cuenta. */
export const startupLink = readStartupLink();

/** Si la dirección todavía tiene el "?code=" de un link de Supabase (no se pudo canjear). */
export function hasAuthCode(): boolean {
  return /[?&]code=/.test(window.location.search);
}
