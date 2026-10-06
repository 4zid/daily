# daily · registro

Dashboard para registrar las actividades de cada día y compartirlas con tu terapeuta. El registro se organiza en **semanas → días (lunes a domingo) → actividades**, y tiene dos vistas:

- **Paciente**: cargás lo que hacés durante el día, con hora exacta (inicio y fin) o solo la hora de inicio, categoría, cómo te sentiste y notas. Cada día tiene además un ánimo general y una reflexión.
- **Terapeuta**: informe semanal con resumen (días con registro, actividades, tiempo registrado, ánimo promedio), gráfico de ánimo por día, tiempo por categoría, el detalle día por día y un espacio para notas de sesión. Se puede imprimir o guardar como PDF.

Extra: **"Contale tu día"**, un chat donde contás (o dictás por voz) cómo fue tu día con tus palabras y la IA lo ordena en actividades. Vos revisás la propuesta, destildás lo que no va y la agregás al día. Si corregís algo en el chat ("no, el almuerzo fue a las 14"), devuelve la lista actualizada.

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
APP_ACCESS_CODE=un-codigo         # opcional, ver abajo
```

y reiniciá `npm run dev`. La clave queda del lado del servidor: nunca llega al navegador.

## Publicarlo (Vercel)

1. Importá este repositorio en Vercel (detecta Vite solo).
2. En **Settings → Environment Variables** agregá `ANTHROPIC_API_KEY` y, recomendado, `APP_ACCESS_CODE`.
3. Deploy. La carpeta `api/` se publica como función serverless (`/api/organize`).

`APP_ACCESS_CODE` evita que cualquiera que encuentre la URL use tu clave: si está definido, la IA solo responde a quien cargue ese código en **Ajustes → Código de acceso a la IA**.

## Dónde quedan los datos

- Los registros se guardan **solo en el navegador** (localStorage). No hay base de datos ni cuentas.
- **Ajustes → Descargar respaldo** baja un `.json` con todo; **Importar respaldo** lo restaura en otro dispositivo.
- **Compartir con mi terapeuta** genera un link que abre la vista de terapeuta con esa semana. Los datos van comprimidos dentro del link (en el `#`, que el navegador nunca envía al servidor), así que cualquiera que tenga el link puede verlos: compartilo solo con tu terapeuta.
- El terapeuta también puede abrir el archivo de respaldo desde **Abrir archivo del paciente**.
- Las notas de sesión del terapeuta se guardan en su dispositivo y no se incluyen al compartir ni al imprimir.
- Lo que escribís en el chat se envía a la API de Anthropic para ordenarlo (solo si la IA está configurada).

## Duraciones

Si una actividad tiene hora de fin, se usa esa. Si solo tiene hora de inicio, cuenta hasta que empieza la siguiente, siempre que sea dentro de las 4 h (`MAX_INFERRED_MINUTES` en `src/lib/stats.ts`); si no, se toma como duración desconocida para no inflar el tiempo registrado. Si el fin es menor que el inicio (dormir 23:30–07:00), se asume que cruza la medianoche.

## Estructura

```
api/organize.ts            Función serverless: ordena el relato con Claude (salida estructurada)
vite.config.ts             Sirve /api/organize en desarrollo con el mismo handler
src/App.tsx                Layout, vistas, navegación por semanas, links compartidos
src/components/
  PatientView.tsx          Semana, tira de días, línea de tiempo y reflexión
  EntryForm.tsx            Alta y edición de actividades
  AssistantChat.tsx        Chat "Contale tu día" (propuestas, dictado por voz)
  TherapistView.tsx        Informe semanal y notas de sesión
  Charts.tsx               Ánimo por día y tiempo por categoría
  Dialogs.tsx              Ajustes y compartir
src/lib/
  store.ts                 Estado + persistencia en localStorage, respaldo
  stats.ts                 Duraciones y estadísticas semanales
  share.ts                 Codificación del link para compartir
  basicParser.ts           Modo básico sin IA
  organize.ts              Cliente del endpoint de IA (con modo básico de respaldo)
  categories.ts            Categorías y escala de ánimo
src/styles.css             Tokens de diseño (claro/oscuro) y estilos
```

### Diseño

Todos los colores, radios y sombras son variables CSS en `:root` (`src/styles.css`), con sus valores de modo oscuro debajo; se pueden mapear 1:1 a variables de Figma. Cada vista tiene su acento: verde salvia para paciente (`--patient`) e índigo para terapeuta (`--therapist`). Los colores de categoría (`--cat-1` … `--cat-8`) siguen una paleta validada para daltonismo; el nombre de la categoría siempre se muestra junto al color.

Para cambiar las categorías, editá `src/lib/categories.ts` y la lista `CATEGORY_IDS` en `api/organize.ts` (tienen que coincidir).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con la API incluida |
| `npm run build` | Chequeo de tipos y build de producción en `dist/` |
| `npm run typecheck` | Solo el chequeo de tipos |

> Esta app es una herramienta de registro personal, no reemplaza la atención profesional. Si estás en riesgo, comunicate con tu terapeuta o con un servicio de emergencias.
