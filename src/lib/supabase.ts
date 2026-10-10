import { createClient } from '@supabase/supabase-js';

// La URL y la clave publicable son públicas por diseño: lo que protege los datos
// son las reglas de acceso por fila de la base (ver supabase/migrations).
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://kiifochsbrbuhyrrmwsv.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_ApxSFOfQ-VBD-Zbb5Cs9NQ_TCzvVWIf';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

/** A dónde vuelven los links de los emails de Supabase. Con la barra final, para que coincida
 *  con las Redirect URLs del proyecto ("…/**"), que la piden después del dominio. */
export function authRedirectUrl(): string {
  return `${window.location.origin}/`;
}

export type UserRole = 'patient' | 'therapist';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
}

/** Traduce los errores de Supabase a mensajes para la persona. */
export function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'El email o la contraseña no son correctos.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Ya existe una cuenta con ese email. Ingresá con tu contraseña o recuperala con «¿Olvidaste tu contraseña?».';
  if (m.includes('email not confirmed')) return 'Tenés que confirmar tu email antes de entrar. Revisá tu casilla.';
  if (m.includes('database error saving new user')) return 'La invitación no es válida, venció o ya se usó. Pedile a tu terapeuta una nueva.';
  if (m.includes('invitacion_invalida')) return 'La invitación no es válida, venció o ya se usó. Pedile a tu terapeuta una nueva.';
  if (m.includes('password should be') || m.includes('weak password')) return 'La contraseña es muy débil. Usá al menos 8 caracteres.';
  if (m.includes('sending') && m.includes('email')) {
    return 'No pudimos enviar el email. Avisale a quien administra la app que configure el envío de mails.';
  }
  if (m.includes('email address') && m.includes('invalid')) return 'Revisá el email: no parece válido.';
  // Supabase deja pasar un minuto entre un email y otro a la misma persona.
  if (m.includes('only request this after')) return 'Ya te mandamos un email hace muy poco. Esperá un minuto y probá de nuevo.';
  // El tope de emails por hora del proyecto (Authentication → Rate Limits).
  if (m.includes('email rate limit')) return 'Se mandaron muchos emails en poco tiempo. Probá de nuevo en un rato.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Hubo demasiados intentos. Esperá un minuto y probá de nuevo.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'No hay conexión. Revisá internet y probá de nuevo.';
  return 'Algo salió mal. Probá de nuevo en un momento.';
}
