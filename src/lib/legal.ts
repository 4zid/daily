// Datos de las páginas legales (#/privacidad y #/terminos) y del consentimiento del alta.
// Todo lo que cambia con el tiempo está acá, así lo que se muestra y lo que se guarda
// al crear la cuenta no se desincronizan.

export type LegalPath = 'privacidad' | 'terminos';

/** Quién responde por los datos y a dónde se escribe. */
export const LEGAL_OWNER = 'Lautaro Lacaze';
export const LEGAL_EMAIL = 'hola@pantufla.design';
export const LEGAL_COUNTRY = 'Argentina';
// La Ley 25.326 (art. 6, inc. b) pide informar también un domicilio. Cuando haya uno para
// publicar (puede ser un domicilio constituido), va acá y aparece solo en las dos páginas y
// en el aviso del alta.
export const LEGAL_ADDRESS: string | null = 'Taparello 448, Río Grande, Tierra del Fuego';
// CUIT del responsable (lo piden las normas de comercio electrónico junto al domicilio).
// Cuando esté, aparece solo junto al nombre del responsable.
export const LEGAL_CUIT: string | null = '20-41903976-5';
// Número de inscripción de la base de datos en el Registro Nacional de Bases de Datos de la
// AAIP (arts. 21 y 24 de la Ley 25.326). Cuando esté, aparece en la sección 1 de la política.
export const LEGAL_RNBD: string | null = null;

// Quién envía los emails de la cuenta (confirmar el email, recuperar la contraseña). null: el
// envío propio de Supabase. Si en Supabase (Authentication → Emails → SMTP Settings) hay un
// SMTP propio, por ejemplo Resend, va acá su nombre y dónde procesa los datos: aparece solo en
// la tabla de proveedores y entre lo que se procesa en EE. UU. (si está en otro país, hay que
// revisar también la sección de transferencias y las casillas del alta).
export const EMAIL_SENDER: { name: string; where: string } | null = null;

/** Desde cuándo valen los textos. */
export const LEGAL_EFFECTIVE = '8 de octubre de 2026';
export const LEGAL_EFFECTIVE_ISO = '2026-10-08';

// Versión de los Términos y la Política de privacidad. Se guarda con el consentimiento de
// cada cuenta. Si los textos cambian, se sube (y se actualiza la fecha de arriba). Todavía no
// hay una pantalla que les pida la versión nueva a las cuentas que aceptaron otra: antes de
// publicar un cambio hay que sumarla, porque los textos prometen pedir la aceptación expresa.
export const TERMS_VERSION = '2026-10-08';

// Retención cero de datos en Groq (el proveedor de la IA del chat), activada en la consola
// de Groq (Settings → Data Controls → Zero Data Retention: "Global ZDR: Enabled"). Sin ella,
// Groq puede guardar lo que se le manda hasta 30 días para resolver errores o investigar
// abusos. Si la desactivás, poné esto en false: los textos de la app y de las páginas
// legales se ajustan solos.
export const GROQ_ZDR = true;

/** Qué hace Groq con el texto del chat, en una oración (va después de "Groq…"). */
export function groqRetention(): string {
  return GROQ_ZDR
    ? 'no usa ese texto para entrenar modelos y no lo guarda: tenemos activada la retención cero de datos, así que no conserva lo que le mandamos ni sus respuestas, tampoco para resolver errores o investigar abusos. Solo registra datos de uso, como la cantidad de pedidos, sin su contenido.'
    : 'no usa ese texto para entrenar modelos ni lo guarda, salvo que puede conservar registros hasta 30 días para resolver errores o investigar abusos, en servidores de Estados Unidos.';
}

/** Lo mismo, corto, para la landing (va después de "Groq…"). */
export function groqRetentionShort(): string {
  return GROQ_ZDR
    ? 'no lo usa para entrenar modelos ni lo guarda'
    : 'no lo usa para entrenar modelos y solo puede guardarlo hasta 30 días para resolver errores o investigar abusos';
}

// Las casillas del consentimiento, cada una por separado (art. 5 de la Ley 25.326: si va
// junto con otras declaraciones, tiene que ser expreso y destacado):
// - terminos: mayoría de edad y aceptación de los Términos y la Política de privacidad;
// - salud: solo el paciente, datos de salud (también las notas de sesión sobre él o ella)
//   y compartir el registro con su terapeuta;
// - transferencia: que los datos se guarden y procesen en Brasil y EE. UU.
export type ConsentKind = 'terminos' | 'salud' | 'transferencia';

export function consentKinds(role: 'therapist' | 'patient'): ConsentKind[] {
  return role === 'patient' ? ['terminos', 'salud', 'transferencia'] : ['terminos', 'transferencia'];
}

/** Lo que se guarda en la cuenta (metadatos de Supabase Auth) al aceptar en el alta. Solo
 *  se llama con todas las casillas marcadas. */
export function consentMetadata(role: 'therapist' | 'patient') {
  return {
    // Versión de los dos textos aceptados y el momento, según el navegador. Supabase guarda
    // además la fecha de alta de la cuenta (auth.users.created_at), que hace de respaldo.
    terms_version: TERMS_VERSION,
    terms_accepted_at: new Date().toISOString(),
    // Una marca por casilla.
    transfer_consent: true,
    ...(role === 'patient' ? { health_data_consent: true } : {}),
  };
}

