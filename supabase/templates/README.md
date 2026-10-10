# Emails de la cuenta: cómo dejarlos andando

Esta carpeta tiene los emails que manda daily cuando alguien crea su cuenta, cambia su contraseña o su email. Con estos pasos:

- el botón del email lleva a daily (y no a `localhost:3000`, como pasa hoy);
- el link funciona **en cualquier dispositivo**: la cuenta se crea en la compu y se confirma desde el celular;
- los emails llegan a cualquier persona (hoy Supabase solo se los manda a los miembros de tu equipo, y como mucho unos pocos por hora);
- salen con la marca de daily, desde `daily.pantufla.design`: un subdominio solo para daily, así su reputación no depende de otros envíos de `pantufla.design` (si esos envíos reciben quejas, los de daily no caen en Spam por eso).

Todo se hace desde los paneles de Supabase y Resend, sin tocar código. Son unos 20 minutos.

| Archivo | Template de Supabase | Asunto |
|---|---|---|
| `confirmation.html` | **Confirm signup** | `Confirmá tu email para empezar en daily` |
| `recovery.html` | **Reset password** | `Elegí una contraseña nueva para daily` |
| `email_change.html` | **Change email address** | `Confirmá tu nuevo email en daily` |
| `magic_link.html` | **Magic link** | `Tu link para ingresar a daily` |

> **El orden importa.** Los emails nuevos llevan a una dirección que solo entiende la versión nueva de daily. Primero tiene que estar publicada esta versión en Vercel (paso 0) y recién después se pegan los templates (paso 4). Si los pegás antes, el botón abre daily pero la cuenta no se confirma.

Los links de abajo abren directo la página de tu proyecto en Supabase (`kiifochsbrbuhyrrmwsv`). Si alguno no abre, el camino en el menú está al lado.

---

## Paso 0. Publicar esta versión de daily

Publicá estos cambios en Vercel como siempre (cuando se suben a la rama de producción, Vercel los publica solo). Para saber si ya está:

- abrí https://daily.pantufla.design/email/daily-mark.png: tiene que verse el círculo verde de daily. Es el logo que usan los emails (los emails lo toman de la Site URL del paso 1).

## Paso 1. Que los links vuelvan a daily (URL Configuration)

Abrí **[Authentication → URL Configuration](https://supabase.com/dashboard/project/kiifochsbrbuhyrrmwsv/auth/url-configuration)**.

1. En **Site URL** borrá `http://localhost:3000` y escribí, **sin barra al final**:

   ```
   https://daily.pantufla.design
   ```

   Tocá **Save**. Esta es la causa de que hoy el botón del email lleve a `localhost:3000`: Supabase manda ahí cuando no conoce la dirección de la app.

2. En **Redirect URLs** tocá **Add URL** y agregá estas cuatro (una por vez; si alguna ya está, dejala):

   ```
   https://daily.pantufla.design/**
   https://daily-nine-ruddy.vercel.app/**
   http://localhost:5173/**
   http://localhost:4173/**
   ```

   La primera es la dirección de la app. La segunda es la dirección vieja de Vercel, que sigue andando. Las otras dos sirven para probar daily en una compu (`npm run dev` y `npm run preview`); no abren nada para nadie más. Los `/**` del final dejan pasar cualquier página de esa dirección.

Solo con este paso los emails de siempre de Supabase ya llevan a daily, pero inician sesión únicamente en el mismo navegador donde se creó la cuenta: abiertos en otro (por ejemplo, en el celular), la cuenta queda confirmada y la persona tiene que ingresar con su contraseña. Eso lo arregla el paso 4.

## Paso 2. Mandar los emails con Resend (SMTP)

El envío que trae Supabase es de prueba: solo le llega a quien es miembro de tu equipo en Supabase y manda muy pocos por hora. Para el lanzamiento hace falta un servicio de envío propio. Usamos **Resend**, con el subdominio `daily.pantufla.design` (región Irlanda, `eu-west-1`).

### 2.0. Los registros DNS del subdominio (ya cargados en Namecheap)

Para referencia, por si algún día hay que revisarlos. Van en **Namecheap → pantufla.design → Advanced DNS → Host Records**; el portfolio en `pantufla.design` y el reenvío de `hola@pantufla.design` no se tocan.

| Tipo | Host | Valor | Para qué |
|---|---|---|---|
| CNAME | `daily` | `6981050be13d72b8.vercel-dns-017.com` | la app (Vercel) |
| TXT | `resend._domainkey.daily` | la clave DKIM que muestra Resend (empieza con `p=MIGf…`) | firma de los emails |
| CNAME | `send.daily` | `send.forge.rmta.net` | rebotes y SPF |
| CNAME | `rsend.daily` | `send.forge.rmta.net` | rebotes y SPF |
| TXT | `_dmarc.daily` | `v=DMARC1; p=none;` | política DMARC |

Resend muestra además un **MX** y un **TXT** para `send.daily`. No se cargan: con **Mail Settings → Email Forwarding**, Namecheap no deja agregar MX (y cambiar ese modo corta el reenvío de `hola@pantufla.design`). El CNAME de `send.daily` los reemplaza: Resend publica el MX y el SPF del otro lado, igual que en `pantufla.design`.

### 2.1. Crear la clave en Resend

1. Entrá a [resend.com](https://resend.com) → **API Keys** → **Create API Key**.
2. Nombre: `supabase-daily`. **Permission**: **Sending access**. **Domain**: `daily.pantufla.design` (así la clave solo puede mandar emails desde ese subdominio y no puede leer ni cambiar nada de tu cuenta).

   Si ya habías creado una clave limitada a `pantufla.design`, creá esta nueva y reemplazala en Supabase (paso 2.2): una clave limitada a un dominio no puede mandar desde otro. Después borrá la vieja en Resend.
3. Copiá la clave (empieza con `re_`). Resend la muestra **una sola vez**.

> La clave es como una contraseña: pegala directo en Supabase (paso siguiente) y no se la pases a nadie, tampoco por chat. Si alguna vez se filtra, borrala en Resend y creá otra.

### 2.2. Cargarla en Supabase

Abrí **[Authentication → Emails → SMTP Settings](https://supabase.com/dashboard/project/kiifochsbrbuhyrrmwsv/auth/smtp)** (en el menú: **Authentication**, en la sección de notificaciones **Emails**, pestaña **SMTP Settings**).

1. Activá **Enable custom SMTP**.
2. Completá:

   | Campo | Valor |
   |---|---|
   | **Sender email** | `no-responder@daily.pantufla.design` |
   | **Sender name** | `daily` |
   | **Host** | `smtp.resend.com` |
   | **Port number** | `465` |
   | **Username** | `resend` |
   | **Password** | la clave de Resend (`re_…`) |

   Si aparece un campo de **intervalo mínimo entre emails** a la misma persona, dejalo en **60 segundos**: la app espera lo mismo antes de ofrecer «Reenviar el email».

3. Tocá **Save**.

Sobre la dirección: tiene que ser de `daily.pantufla.design`, el subdominio verificado en Resend. Ese subdominio no recibe emails, así que una respuesta a `no-responder@` no llega a ningún lado; por eso el pie de cada email dice que escriban a `hola@pantufla.design`.

### 2.3. Revisar que Resend no cambie los links

En Resend → **Domains** → `daily.pantufla.design` → **Configuration**, fijate que el seguimiento de clics y de aperturas (**click tracking** / **open tracking**) esté **apagado**. Viene apagado. Si se prende, Resend reemplaza los links del email por los suyos y Supabase avisa que así los links de confirmación dejan de funcionar.

## Paso 3. Cuántos emails por hora (Rate Limits)

Abrí **[Authentication → Rate Limits](https://supabase.com/dashboard/project/kiifochsbrbuhyrrmwsv/auth/rate-limits)**.

- **Rate limit for sending emails** (emails por hora): al activar el SMTP propio, Supabase lo pone en **30 por hora**. Es el total del proyecto, sumando todo: altas, reenvíos y «Olvidé mi contraseña».
- Para el lanzamiento, **30 alcanza**: son hasta 30 emails por hora entre altas, reenvíos y contraseñas (menos de 30 cuentas nuevas si muchos piden reenviar). Si vas a anunciarlo y esperás muchas altas juntas, subilo a **60**. No tiene sentido subirlo mucho más con el plan gratis de Resend, que manda hasta **100 emails por día**.
- ¿Por qué no sacarle el límite? Lo cuida de bots que crean cuentas con emails ajenos: sin tope, podrían mandar cientos de emails desde `pantufla.design` y arruinar su reputación (después tus emails caen en Spam).
- Si se llega al tope, la app le dice a la persona: «Se mandaron muchos emails en poco tiempo. Probá de nuevo en un rato».

Lo demás de esta página dejalo como está.

## Paso 4. Pegar los templates

Abrí **[Authentication → Emails → Templates](https://supabase.com/dashboard/project/kiifochsbrbuhyrrmwsv/auth/templates)** (en el menú: **Authentication** → **Emails**, pestaña **Templates**). Para cada fila de la tabla de arriba:

1. Elegí el template (por ejemplo, **Confirm signup**).
2. En **Subject** borrá lo que hay y pegá el asunto de la tabla.
3. En el editor del mensaje pasá a la pestaña **Source**, seleccioná todo (Ctrl+A o Cmd+A), borralo y pegá **el archivo entero** (desde `<!--` hasta `</html>`). Para copiarlo: abrí el archivo en GitHub, tocá **Raw**, seleccioná todo y copiá.
4. Tocá **Save**.
5. Repetí con los otros tres.

Cosas a tener en cuenta:

- No cambies lo que está entre `{{ … }}`: Supabase lo reemplaza por el nombre, el email y el link de cada persona. El bloque `<!-- … -->` del principio es una nota para vos; no aparece en el email.
- En la vista previa de Supabase los datos de la persona pueden aparecer vacíos o de ejemplo. Es normal.
- **Invite user** y **Reauthentication** quedan como están: daily no los usa.

Además, en **[Authentication → Sign In / Providers → Email](https://supabase.com/dashboard/project/kiifochsbrbuhyrrmwsv/auth/providers)** dejá **Confirm email** prendido.

## Paso 5. Probarlo

Usá un email tuyo que no tenga cuenta en daily. Con Gmail podés inventar uno nuevo agregando `+` y algo antes de la arroba: `tunombre+prueba1@gmail.com` llega a `tunombre@gmail.com`.

- [ ] En la compu, en una ventana privada, abrí https://daily.pantufla.design y creá una cuenta de **terapeuta**.
- [ ] Aparece «Confirmá tu email» con tu dirección.
- [ ] En el **celular**, abrí el email. Llega de **daily** (`no-responder@daily.pantufla.design`), con el asunto nuevo, el logo y tu nombre. Si no está en la bandeja de entrada, buscá en Spam o Promociones.
- [ ] Tocá **Confirmar mi email**: se abre daily en el celular con «¡Listo, confirmaste tu email!». Tocá **Ir a mi panel** y entrás.
- [ ] Tocá el mismo botón del email otra vez: tiene que decir «Este link ya no sirve» (cada link sirve una vez).
- [ ] En la compu, tocá **Ya lo confirmé · Ingresar** e ingresá con la contraseña.
- [ ] Probá **¿Olvidaste tu contraseña?**: llega el email, el botón **Elegir una contraseña nueva** abre daily para elegirla y después entrás con la nueva.
- [ ] Desde tu panel creá una invitación. Abrila en el celular en una **ventana privada** (o cerrá sesión antes: con la sesión de terapeuta abierta, el link te lleva a tu panel) y creá una cuenta de **paciente** con otro email. El email dice «empezar tu registro diario» y el botón termina en «Empezar mi registro».
- [ ] Al terminar, borrá las cuentas de prueba en **[Authentication → Users](https://supabase.com/dashboard/project/kiifochsbrbuhyrrmwsv/auth/users)**.

Si un email no llega: en Resend → **Emails** ves cada envío y si lo entregó o rebotó. Si ahí no aparece, revisá los datos del paso 2.2 (lo más común: la clave mal pegada o el usuario distinto de `resend`).

---

## La Política de privacidad

Resend ya figura como proveedor de los emails de la cuenta (`EMAIL_SENDER` en `src/lib/legal.ts`): EE. UU. (la empresa) e Irlanda (desde donde se envían). Si algún día cambiás de servicio de envío o de región, hay que actualizar ese dato y la versión de los textos.

## Qué no se pudo comprobar

- Los nombres exactos de los menús y campos de los paneles de Supabase y Resend salen de su documentación oficial, no de verlos en pantalla. Los links directos de arriba son los que usa la documentación de Supabase, así que deberían abrir la página correcta aunque el menú cambie de nombre.
- El tope del plan gratis de Resend (100 por día, 3.000 por mes) sale de guías de precios de terceros; confirmalo en resend.com/pricing.
- Los emails se probaron dibujándolos en un navegador, en tamaño compu y celular, no en cada programa de correo. En Outlook de escritorio el botón se ve con esquinas rectas.
- Algunos correos de empresas (por ejemplo, Outlook con «Safe Links») abren los links antes que la persona para revisarlos. Si eso pasa, al tocar el botón puede aparecer «Este link ya no sirve», pero la cuenta igual queda confirmada: la pantalla explica que puede ingresar con su contraseña o pedir otro email.
