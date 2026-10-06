# daily · registro

Dashboard para registrar las actividades de cada día y compartirlas con tu terapeuta. El registro se organiza en **semanas → días (lunes a domingo) → actividades**. Hay cuentas de **terapeuta** y de **paciente**, siempre vinculadas:

- **Paciente**: carga lo que hace durante el día, con hora exacta (inicio y fin) o solo la hora de inicio, categoría, **placer** y **control** (1 a 10) y notas. Cada día tiene además un ánimo general y una reflexión. También ve su informe semanal tal como lo ve su terapeuta.
- **Terapeuta**: lista de pacientes, informe semanal de cada uno (placer y control por día, actividades destacadas, tiempo por categoría, detalle día por día) y notas de sesión privadas. Se puede imprimir o guardar como PDF.

Extra: **"Contale tu día"**, un chat donde el paciente cuenta (o dicta por voz) cómo fue su día y la IA lo ordena en actividades. Revisa la propuesta, destilda lo que no va y la agrega al día.

## Cuentas y vínculo terapeuta–paciente

1. El terapeuta crea su cuenta desde **Creá una → Soy terapeuta**.
2. Desde **Crear invitación** genera un link (`/#/invitacion/CÓDIGO`) y se lo manda al paciente por WhatsApp, email o como quiera. Cada link sirve para **una sola cuenta** y vence a los **14 días**; los pendientes se pueden borrar.
3. El paciente abre el link, ve quién lo invitó, crea su cuenta y acepta que su terapeuta vea sus registros. Queda vinculado en el mismo momento.

No se puede crear una cuenta de paciente sin invitación. Un paciente tiene un solo terapeuta; si abre la invitación de otro terapeuta con la sesión iniciada, puede aceptarla y cambia de terapeuta. Cualquiera de los dos puede terminar el vínculo (**Ajustes → Dejar de compartir** o **⋯ → Desvincular**), y cada persona puede eliminar su cuenta y sus datos desde **Ajustes**.

Si el paciente tenía registros guardados en el navegador de antes de tener cuenta, la app le ofrece subirlos a su cuenta.

## Base de datos (Supabase)

Los datos viven en Supabase (Postgres + Auth). El esquema está en `supabase/migrations/`:

| Tabla | Qué guarda |
|---|---|
| `profiles` | Rol (`patient` / `therapist`) y nombre de cada cuenta |
| `invitations` | Links de invitación del terapeuta (código, vencimiento, quién lo usó) |
| `care_links` | Vínculo paciente → terapeuta (uno por paciente) |
| `day_logs` | Ánimo y reflexión de cada día |
| `entries` | Actividades: horario, categoría, placer, control, notas |
| `therapist_notes` | Notas de sesión por semana (solo las ve el terapeuta) |

La seguridad está en la base, con **reglas de acceso por fila (RLS)**: el paciente solo lee y escribe lo suyo; el terapeuta solo **lee** los registros de sus pacientes vinculados y no puede modificarlos; las notas de sesión solo las ve quien las escribió. El alta de un paciente pasa por un trigger que exige una invitación válida. La URL y la clave publicable de Supabase que están en el código son públicas por diseño.

### Configuración de Supabase (una vez)

En el panel del proyecto:

1. **Authentication → Sign In / Providers → Email**: desactivá **Confirm email**. El envío de mails que trae Supabase solo llega a los miembros del equipo, así que con la confirmación activada las cuentas nuevas no se pueden crear. Si preferís confirmar emails, configurá un SMTP propio (por ejemplo Resend) en **Authentication → Emails → SMTP Settings** y volvé a activarla.
2. **Authentication → URL Configuration**: en **Site URL** poné el dominio de producción (`https://daily-nine-ruddy.vercel.app`) y agregalo también en **Redirect URLs**. Lo usan los links de "Olvidé mi contraseña".
3. Recuperar la contraseña por mail necesita el SMTP propio del punto 1. Sin eso, la persona puede cambiar su contraseña desde **Ajustes** con la sesión iniciada.
4. Opcional: **Authentication → Attack Protection → Leaked password protection** (si tu plan la tiene).

Para usar otro proyecto de Supabase, aplicá las migraciones de `supabase/migrations/` y definí `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` (y `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` para la función de la IA).

## Cómo correrlo

Necesitás Node 20 o más nuevo.

```bash
npm install
npm run dev
```

Abrí http://localhost:5173.

### Activar la IA

Sin configurar nada, el chat funciona en **modo básico**: reconoce horarios ("a las 9", "de 10 a 13", "a la tarde") y adivina la categoría por palabras clave. Para que lo ordene la IA (Claude), creá un archivo `.env.local` en la raíz:

```bash
ANTHROPIC_API_KEY=tu-clave        # https://console.anthropic.com
```

y reiniciá `npm run dev`. La clave queda del lado del servidor: nunca llega al navegador. La función solo responde a usuarios con sesión iniciada, así que nadie de afuera puede gastar tu clave.

## Publicarlo (Vercel)

1. Importá este repositorio en Vercel (detecta Vite solo).
2. En **Settings → Environment Variables** agregá `ANTHROPIC_API_KEY`.
3. Deploy (o **Redeploy** si agregaste la variable después: Vercel las toma al construir). La carpeta `api/` se publica como función serverless (`/api/organize`).

Compartí siempre el dominio de producción del proyecto (el `.vercel.app` corto que figura en **Domains**): las URLs de cada despliegue quedan detrás del login de Vercel, y los links de invitación usan el dominio desde el que se crearon.

## Privacidad

- Los registros y las notas se guardan en Supabase, protegidos por las reglas de acceso de arriba.
- **Ajustes → Descargar mis registros** baja un `.json` con todo lo del paciente.
- Lo que se escribe en el chat se envía a la API de Anthropic para ordenarlo (solo si la IA está configurada).
- Las notas de sesión no se imprimen en el informe.

## Duraciones

Si una actividad tiene hora de fin, se usa esa. Si solo tiene hora de inicio, cuenta hasta que empieza la siguiente, siempre que sea dentro de las 4 h (`MAX_INFERRED_MINUTES` en `src/lib/stats.ts`); si no, se toma como duración desconocida para no inflar el tiempo registrado. Si el fin es menor que el inicio (dormir 23:30–07:00), se asume que cruza la medianoche.

## Estructura

```
api/organize.ts            Función serverless: verifica la sesión y ordena el relato con Claude
supabase/migrations/       Esquema, reglas de acceso y funciones de la base
vite.config.ts             Sirve /api/organize en desarrollo con el mismo handler
src/App.tsx                Sesión: ingreso, app de paciente o de terapeuta
src/components/
  AuthScreen.tsx           Ingreso, alta (terapeuta / paciente con invitación), recuperar contraseña
  PatientApp.tsx           Layout del paciente: semanas, registro, informe, chat, invitaciones
  TherapistApp.tsx         Layout del terapeuta: pacientes, semanas, informe, invitar
  PatientView.tsx          Semana, tira de días, actividades y reflexión
  EntryForm.tsx            Alta y edición de actividades
  TimeSelect.tsx           Selector de hora de 24 h
  AssistantChat.tsx        Chat "Contale tu día" (propuestas, dictado por voz)
  TherapistView.tsx        Informe semanal y notas de sesión
  Charts.tsx               Placer y control por día, tiempo por categoría
  Dialogs.tsx              Ajustes e invitaciones
src/lib/
  supabase.ts              Cliente de Supabase y mensajes de error
  auth.tsx                 Sesión, perfil y acciones de cuenta
  cloud.ts                 Lectura/escritura de registros, notas, vínculos e invitaciones
  route.ts                 Rutas con hash (#/registro, #/informe, #/invitacion/…)
  store.ts                 Preferencias locales y registros de antes de tener cuenta
  stats.ts                 Duraciones y estadísticas semanales
  basicParser.ts           Modo básico sin IA
  organize.ts              Cliente del endpoint de IA (con modo básico de respaldo)
  categories.ts            Categorías, ánimo y escalas de placer y control
src/styles.css             Tokens de diseño (claro/oscuro) y estilos
```

### Diseño

Todos los colores, radios y sombras son variables CSS en `:root` (`src/styles.css`), con sus valores de modo oscuro debajo; se pueden mapear 1:1 a variables de Figma. Cada rol tiene su acento: verde salvia para paciente (`--patient`) e índigo para terapeuta (`--therapist`). Los colores de categoría (`--cat-1` … `--cat-8`) siguen una paleta validada para daltonismo; el nombre de la categoría siempre se muestra junto al color.

Para cambiar las categorías, editá `src/lib/categories.ts`, la lista `CATEGORY_IDS` en `api/organize.ts` y el `check` de `entries.category` en la base (tienen que coincidir).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con la API incluida |
| `npm run build` | Chequeo de tipos y build de producción en `dist/` |
| `npm run typecheck` | Solo el chequeo de tipos |

> Esta app es una herramienta de registro personal, no reemplaza la atención profesional. Si estás en riesgo, comunicate con tu terapeuta o con un servicio de emergencias.
