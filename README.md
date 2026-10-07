# daily · registro

Dashboard para registrar las actividades de cada día y compartirlas con tu terapeuta. El registro se organiza en **semanas → días (lunes a domingo) → actividades**. Hay cuentas de **terapeuta** y de **paciente**, siempre vinculadas:

- **Paciente**: carga lo que hace durante el día, con hora exacta (inicio y fin) o solo la hora de inicio, categoría, **placer** y **control** (1 a 10) y notas. Cada día tiene además un ánimo general y una reflexión. También ve su informe semanal tal como lo ve su terapeuta.
- **Terapeuta**: lista de pacientes, informe semanal de cada uno (placer y control por día, actividades destacadas, tiempo por categoría, detalle día por día) y notas de sesión privadas. Se puede imprimir o guardar como PDF.

Extra: **"Contale tu día"**, un chat donde el paciente cuenta (o dicta por voz) cómo fue su día y la IA lo ordena en actividades. Revisa la propuesta, destilda lo que no va y la agrega al día.

## Presentación y demo

- **Presentación** (`#/bienvenida`): cinco pasos con ilustraciones animadas que muestran el registro, el chat y el informe. Aparece sola la primera vez que alguien abre la app sin sesión; después queda a mano desde la pantalla de ingreso (**Ver la presentación**). Se maneja con las flechas del teclado o deslizando en el celular, y respeta la opción del sistema de reducir movimiento.
- **Demo como invitado** (`#/demo`): la app completa con datos de ejemplo, sin cuenta. Una barra flotante arriba permite pasar de **Paciente** a **Terapeuta** en cualquier momento: lo que se carga como paciente aparece en el informe del terapeuta. Links directos para mandar: `#/demo/paciente` y `#/demo/terapeuta`.
  - Los datos viven solo en memoria (`src/lib/demo.ts`): la demo no lee ni escribe en Supabase. Al recargar la página o tocar **Reiniciar** vuelve al inicio.
  - Sin sesión, el chat de la demo usa el modo básico (sin IA), porque la IA solo responde a usuarios con sesión. Si abrís la demo con tu cuenta iniciada, el chat usa la IA.

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

Sin configurar nada, el chat funciona en **modo básico**: reconoce horarios ("a las 9", "de 10 a 13", "a la tarde") y adivina la categoría por palabras clave. Para que lo ordene la IA, usá [Groq](https://console.groq.com), que tiene un plan gratis (sin tarjeta):

1. Creá una cuenta en https://console.groq.com y generá una clave en **API Keys**.
2. Creá un archivo `.env.local` en la raíz:

   ```bash
   GROQ_API_KEY=tu-clave
   ```

3. Reiniciá `npm run dev`.

La clave queda del lado del servidor: nunca llega al navegador. La función solo responde a usuarios con sesión iniciada, así que nadie de afuera puede gastar tu cupo. Por defecto usa `openai/gpt-oss-120b`, y si ese modelo llega a su límite gratis pasa a `openai/gpt-oss-20b` (cada modelo tiene su propio cupo).

**Cuánto alcanza el plan gratis.** Groq limita por modelo y por minuto (unos 8000 tokens) y por día (unos 200.000 tokens). Para entrar en el límite por minuto, la función manda solo la parte más reciente de la conversación. En la práctica rinde unos 30 a 50 mensajes por día por modelo, o sea entre 60 y 100 con los dos. Los números exactos de tu cuenta están en **Settings → Limits** de la consola de Groq.

**Privacidad en Groq.** Groq no usa lo que se le manda para entrenar modelos. Igual conviene:

- Activar **Zero Data Retention** en **Settings → Data Controls**, si aparece en tu cuenta, para que tampoco guarde registros temporales.
- No usar la opción de feedback de la consola con textos de pacientes: eso sí lo revisan personas.

**Otro proveedor.** La función habla con cualquier API compatible con OpenAI que admita salida con esquema JSON (`response_format: json_schema`). Para cambiar de proveedor o de modelo:

```bash
AI_BASE_URL=https://api.otro-proveedor.com/v1   # por defecto, Groq
AI_API_KEY=tu-clave                             # si está, se usa en vez de GROQ_API_KEY
AI_MODEL=modelo-principal,modelo-de-respaldo    # se prueban en orden
```

## Publicarlo (Vercel)

1. Importá este repositorio en Vercel (detecta Vite solo).
2. En **Settings → Environment Variables** agregá `GROQ_API_KEY`.
3. Deploy (o **Redeploy** si agregaste la variable después: Vercel las toma al construir). La carpeta `api/` se publica como función serverless (`/api/organize`).

Compartí siempre el dominio de producción del proyecto (el `.vercel.app` corto que figura en **Domains**): las URLs de cada despliegue quedan detrás del login de Vercel, y los links de invitación usan el dominio desde el que se crearon.

## Privacidad

- Los registros y las notas se guardan en Supabase, protegidos por las reglas de acceso de arriba.
- **Ajustes → Descargar mis registros** baja un `.json` con todo lo del paciente.
- Lo que se escribe en el chat se envía a la API de Groq (o al proveedor que configures) para ordenarlo, solo si la IA está configurada. Revisá las condiciones de privacidad del proveedor antes de usarlo con pacientes.
- Las notas de sesión no se imprimen en el informe.

## Duraciones

Si una actividad tiene hora de fin, se usa esa. Si solo tiene hora de inicio, cuenta hasta que empieza la siguiente, siempre que sea dentro de las 4 h (`MAX_INFERRED_MINUTES` en `src/lib/stats.ts`); si no, se toma como duración desconocida para no inflar el tiempo registrado. Si el fin es menor que el inicio (dormir 23:30–07:00), se asume que cruza la medianoche.

## Estructura

```
api/organize.ts            Función serverless: verifica la sesión y ordena el relato con la IA (Groq)
supabase/migrations/       Esquema, reglas de acceso y funciones de la base
vite.config.ts             Sirve /api/organize en desarrollo con el mismo handler
src/App.tsx                Rutas y sesión: presentación, demo, ingreso, app de paciente o de terapeuta
src/components/
  Onboarding.tsx           Presentación en pasos con ilustraciones animadas
  DemoApp.tsx              Demo como invitado: barra para cambiar de rol, reiniciar y salir
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
  backend.ts               Acceso a Supabase (lecturas y escrituras), con la misma forma que la demo
  cloud.ts                 Caché de semanas, guardado optimista, notas, vínculos e invitaciones
  demo.ts                  Datos de ejemplo y base en memoria de la demo
  route.ts                 Rutas con hash (#/registro, #/informe, #/invitacion/…, #/demo/…)
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
