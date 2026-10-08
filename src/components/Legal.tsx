import { createContext, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowUp, LifeBuoy, Mail, X } from 'lucide-react';
import {
  EMAIL_SENDER,
  GROQ_ZDR,
  LEGAL_ADDRESS,
  LEGAL_COUNTRY,
  LEGAL_CUIT,
  LEGAL_EFFECTIVE,
  LEGAL_EFFECTIVE_ISO,
  LEGAL_EMAIL,
  LEGAL_OWNER,
  LEGAL_RNBD,
  groqRetention,
  type LegalPath,
} from '../lib/legal';
import { canReturn, navigate, navigateWithReturn, replacePath, routeParam } from '../lib/route';
import { Brand } from './common';
import '../legal.css';

// Política de privacidad (#/privacidad) y Términos y condiciones (#/terminos). Se ven con o
// sin sesión, también en la demo y en una invitación. Los textos están acá como datos: el
// índice sale de la misma lista. Lo que cambia con el tiempo (responsable, versión, Groq)
// está en src/lib/legal.ts.
//
// Los saltos a una sección no tocan el hash de la URL (el router lo usa para la ruta):
// desplazan la página y pasan el foco al título. Para llegar a una sección desde otra
// pantalla se usa "#/privacidad?seccion=ia".

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

interface LegalDoc {
  title: string;
  /** Nombre corto para la pestaña entre los dos documentos. */
  short: string;
  intro: ReactNode;
  summary: ReactNode[];
  sections: Section[];
}

// La página legal abierta, para que los links internos salten en vez de navegar.
const CurrentPage = createContext<LegalPath | null>(null);

// Una página legal abierta en otra pestaña desde la app (LegalLink con newTab) lo marca en la
// ruta, y la pestaña lo recuerda aunque se cambie de documento o se recargue.
const NEW_TAB_PARAM = 'pestana';
const NEW_TAB_KEY = 'daily.legal-tab';

/** Si esta pestaña la abrió un link de daily y no tiene historial: "Volver" la cierra y la
 *  persona sigue en la pestaña de antes (un formulario a medio llenar, la demo, el chat). */
function isOwnTab(): boolean {
  try {
    if (routeParam(NEW_TAB_PARAM) === 'nueva') sessionStorage.setItem(NEW_TAB_KEY, '1');
    return sessionStorage.getItem(NEW_TAB_KEY) === '1' && history.length === 1;
  } catch {
    return false;
  }
}

function sectionElement(page: LegalPath, id: string) {
  return document.getElementById(`${page}-${id}`);
}

/** Lleva a una sección (o arriba de todo) y le pasa el foco a su título. */
function jumpTo(page: LegalPath, id: string | null, smooth = true) {
  const behavior: ScrollBehavior =
    smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto';
  const el = id ? sectionElement(page, id) : null;
  if (el) el.scrollIntoView({ behavior, block: 'start' });
  else window.scrollTo({ top: 0, behavior });
  const heading = (el ?? document.querySelector('.legal'))?.querySelector<HTMLElement>('h1, h2');
  heading?.focus({ preventScroll: true });
}

/** Un link a una página legal (o a una sección). Con `newTab`, se abre en otra pestaña
 *  para no perder lo que hay en pantalla (un formulario a medio llenar, la demo, el chat). */
export function LegalLink({
  page,
  section,
  newTab = false,
  className,
  children,
}: {
  page: LegalPath;
  section?: string;
  newTab?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const current = useContext(CurrentPage);
  const path = section ? `${page}?seccion=${section}` : page;
  if (newTab) {
    // La barra antes del "#" deja afuera un "?code=…" de un link de email ya usado.
    // "pestana=nueva": en esa pestaña, "Volver" la cierra (ver ownTab en LegalPage).
    return (
      <a
        className={className}
        href={`/#/${path}${path.includes('?') ? '&' : '?'}${NEW_TAB_PARAM}=nueva`}
        target="_blank"
        rel="noopener"
      >
        {children}
        <span className="sr-only"> (se abre en otra pestaña)</span>
      </a>
    );
  }
  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    // Ctrl/Cmd + clic o el botón del medio abren otra pestaña, como cualquier link.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (current === page) jumpTo(page, section ?? null);
    else if (current) replacePath(path);
    else navigateWithReturn(path);
  }
  return (
    <a className={className} href={`#/${path}`} onClick={onClick}>
      {children}
    </a>
  );
}

const Email = () => <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>;

export function LegalPage({ page }: { page: LegalPath }) {
  const doc = DOCS[page];
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = `${doc.title} · daily`;
    return () => {
      document.title = previous;
    };
  }, [doc.title]);

  // Arranca arriba con el foco en el título, o en la sección pedida con "?seccion=".
  // Con llaves: en Chrome nuevo scrollTo devuelve una promesa, y un efecto no puede devolverla.
  useEffect(() => {
    const section = routeParam('seccion');
    if (section && sectionElement(page, section)) {
      jumpTo(page, section, false);
    } else {
      window.scrollTo(0, 0);
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [page]);

  const [ownTab] = useState(isOwnTab);

  // Vuelve a la pantalla de daily de donde vino. En una pestaña abierta desde la app, la
  // cierra (si el navegador no lo permite, sigue como abajo). Si se abrió directo, al inicio:
  // la landing o el ingreso sin sesión, la app con sesión.
  function back() {
    if (canReturn()) history.back();
    else if (ownTab) {
      window.close();
      window.setTimeout(() => navigate(''), 300);
    } else navigate('');
  }

  const other: LegalPath = page === 'privacidad' ? 'terminos' : 'privacidad';

  return (
    <CurrentPage.Provider value={page}>
      <div className="legal">
        <header className="legal-bar no-print">
          <div className="legal-bar-inner">
            <Brand />
            <button type="button" className="btn btn-sm legal-back" onClick={back}>
              {ownTab ? <X aria-hidden /> : <ArrowLeft aria-hidden />}
              {ownTab ? 'Cerrar' : 'Volver'}
            </button>
          </div>
        </header>

        <main className="legal-main">
          <div className="legal-head">
            <nav className="legal-switch no-print" aria-label="Documentos legales">
              {(['privacidad', 'terminos'] as const).map((p) => (
                <a
                  key={p}
                  href={`#/${p}`}
                  aria-current={p === page ? 'page' : undefined}
                  onClick={(e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    if (p !== page) replacePath(p);
                  }}
                >
                  {DOCS[p].short}
                </a>
              ))}
            </nav>
            <h1 className="legal-title" ref={titleRef} tabIndex={-1}>
              {doc.title}
            </h1>
            <p className="legal-meta">
              Vigente desde el <time dateTime={LEGAL_EFFECTIVE_ISO}>{LEGAL_EFFECTIVE}</time>
            </p>
            <div className="legal-intro">{doc.intro}</div>
            <section className="tray legal-summary" aria-labelledby={`${page}-resumen`}>
              <div className="tray-card">
                <h2 id={`${page}-resumen`}>En resumen</h2>
                <ul>
                  {doc.summary.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          <nav className="legal-toc no-print" aria-labelledby={`${page}-indice`}>
            <h2 id={`${page}-indice`}>Contenido</h2>
            <ol>
              {doc.sections.map((s) => (
                <li key={s.id}>
                  <LegalLink page={page} section={s.id}>
                    {s.title}
                  </LegalLink>
                </li>
              ))}
            </ol>
          </nav>

          <article className="card legal-doc">
            {doc.sections.map((s, i) => (
              <section key={s.id} id={`${page}-${s.id}`} className="legal-section" aria-labelledby={`${page}-${s.id}-h`}>
                <h2 id={`${page}-${s.id}-h`} tabIndex={-1}>
                  <span className="legal-num">{i + 1}.</span> {s.title}
                </h2>
                {s.body}
              </section>
            ))}

            <aside className="tray legal-contact" aria-label="Contacto">
              <div className="tray-card">
                <span className="legal-contact-icon" aria-hidden>
                  <Mail />
                </span>
                <p>
                  <b>¿Dudas o pedidos?</b> Escribí a <Email />. Responsable: <LegalOwner />.
                </p>
              </div>
            </aside>
          </article>

          <footer className="legal-foot no-print">
            <p>
              También podés leer {other === 'terminos' ? 'los' : 'la'}{' '}
              <LegalLink page={other}>{DOCS[other].title}</LegalLink>.
            </p>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => jumpTo(page, null)}>
              <ArrowUp aria-hidden />
              Volver arriba
            </button>
          </footer>
        </main>
      </div>
    </CurrentPage.Provider>
  );
}

// ─────────────────────────────── piezas de texto ───────────────────────────────

/** El responsable, con el CUIT y el domicilio si ya están cargados en src/lib/legal.ts. */
export function LegalOwner() {
  return (
    <>
      <b>{LEGAL_OWNER}</b> ({LEGAL_COUNTRY}
      {LEGAL_CUIT ? <>; CUIT {LEGAL_CUIT}</> : null}
      {LEGAL_ADDRESS ? <>; domicilio: {LEGAL_ADDRESS}</> : null})
    </>
  );
}

/** «sección N», con el número que tiene en el índice y un link que lleva ahí. */
function SectionRef({ page, id }: { page: LegalPath; id: string }) {
  const n = DOCS[page].sections.findIndex((s) => s.id === id) + 1;
  return (
    <LegalLink page={page} section={id}>
      sección {n}
    </LegalLink>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return <blockquote className="legal-quote">{children}</blockquote>;
}

interface Provider {
  name: string;
  role: string;
  gets: ReactNode;
  where: string;
  why: string;
}

const PROVIDERS: Provider[] = [
  {
    name: 'Supabase',
    role: 'Base de datos y cuentas',
    gets: 'Todo lo que se guarda en daily: tu cuenta, los registros, las notas de sesión y las invitaciones. También la IP y el navegador de cada sesión.',
    where: 'São Paulo, Brasil (es una empresa de EE. UU.)',
    why: 'Guardar los datos, aplicar las reglas de acceso y manejar el ingreso a las cuentas.',
  },
  {
    name: 'Vercel',
    role: 'Alojamiento y servidor',
    gets: (
      <>
        Los pedidos de tu navegador (IP, navegador y página pedida), el texto del chat en camino a la IA y los reportes
        de errores de pantalla. Con cada mensaje del chat recibe también tu token de sesión, para verificar que la sesión
        es válida: incluye tu identificador, tu email y los datos de tu cuenta, como tu nombre. No lo guardamos.
      </>
    ),
    where:
      'El servidor (chat y reportes de errores), en Washington D.C., EE. UU. Los archivos de la app, desde la red global de Vercel, en el punto más cercano a vos. Es una empresa de EE. UU.',
    why: 'Servir la app, pasarle el chat a la IA y registrar errores.',
  },
  {
    name: 'Groq',
    role: 'IA del chat, solo si lo usás',
    gets: (
      <>
        Lo que escribís o dictás en el chat, la conversación de ese día, la fecha, y el horario y el título de las
        actividades ya guardadas ese día. No recibe tu nombre, tu email ni tu IP.
      </>
    ),
    where: 'EE. UU.',
    why: GROQ_ZDR
      ? 'Ordenar tu relato en actividades. Con la retención cero de datos activada, no guarda lo que le mandamos ni sus respuestas.'
      : 'Ordenar tu relato en actividades. Puede guardar registros hasta 30 días para resolver errores o investigar abusos.',
  },
  ...(EMAIL_SENDER
    ? [
        {
          name: EMAIL_SENDER.name,
          role: 'Emails de la cuenta',
          gets: 'Tu email y el contenido del mensaje (por ejemplo, el link para confirmar tu email o elegir una contraseña nueva).',
          where: EMAIL_SENDER.where,
          why: 'Enviar los emails de la cuenta.',
        },
      ]
    : []),
  {
    name: 'Tu navegador',
    role: 'Dictado, solo si tocás «Dictar»',
    gets: 'El audio de lo que dictás, que procesa el servicio de voz de tu navegador (en Chrome, el de Google). No pasa por daily.',
    where: 'Depende del navegador',
    why: 'Convertir tu voz en texto.',
  },
];

function ProviderTable() {
  // Con roles explícitos: en el celular la tabla se muestra como tarjetas y algunos
  // navegadores dejan de anunciarla como tabla al cambiarle el display.
  return (
    <table className="legal-table" role="table">
      <caption className="sr-only">Proveedores: qué reciben, dónde están y para qué</caption>
      <thead role="rowgroup">
        <tr role="row">
          <th role="columnheader" scope="col">
            Quién
          </th>
          <th role="columnheader" scope="col">
            Qué recibe
          </th>
          <th role="columnheader" scope="col">
            Dónde
          </th>
          <th role="columnheader" scope="col">
            Para qué
          </th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {PROVIDERS.map((p) => (
          <tr role="row" key={p.name}>
            <th role="rowheader" scope="row">
              <b>{p.name}</b>
              <small>{p.role}</small>
            </th>
            <td role="cell" data-label="Qué recibe">
              {p.gets}
            </td>
            <td role="cell" data-label="Dónde">
              {p.where}
            </td>
            <td role="cell" data-label="Para qué">
              {p.why}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Emergency() {
  return (
    <div className="legal-emergency" role="note" aria-labelledby="terminos-emergencia">
      <p className="legal-emergency-title" id="terminos-emergencia">
        <LifeBuoy aria-hidden />
        Si estás en peligro o pensás en hacerte daño, pedí ayuda ahora
      </p>
      <ul>
        <li>
          <a href="tel:911">
            <b>911</b>
          </a>{' '}
          · Emergencias, en todo el país (o el número de emergencias de tu localidad).
        </li>
        <li>
          <a href="tel:107">
            <b>107</b>
          </a>{' '}
          · SAME, emergencias médicas en la Ciudad de Buenos Aires.
        </li>
        <li>
          <a href="tel:135">
            <b>135</b>
          </a>{' '}
          · Centro de Asistencia al Suicida, gratis desde la Ciudad y el Gran Buenos Aires. Desde todo el país:{' '}
          <a href="tel:+541152751135">(011) 5275-1135</a> o <a href="tel:08003451435">0800-345-1435</a>. Atiende de 8 a
          24.
        </li>
        <li>
          <a href="tel:08009990091">
            <b>0800-999-0091</b>
          </a>{' '}
          · Línea nacional de salud mental del Ministerio de Salud, gratuita, las 24 horas.
        </li>
        <li>
          <a href="tel:08003331665">
            <b>0800-333-1665</b>
          </a>{' '}
          · Salud Mental Responde, de la Ciudad de Buenos Aires, las 24 horas.
        </li>
      </ul>
      <p>También podés ir a la guardia del hospital más cercano.</p>
    </div>
  );
}

// ─────────────────────────────── Política de privacidad ───────────────────────────────

const PRIVACY: LegalDoc = {
  title: 'Política de privacidad',
  short: 'Privacidad',
  intro: (
    <p>
      Esta política explica qué datos guarda daily, para qué, quién los ve, dónde están y cómo podés pedir que se
      corrijan o se borren. En este texto, «daily», «nosotros» y «nos» se refieren a {LEGAL_OWNER}, el responsable del
      servicio.
    </p>
  ),
  summary: [
    <>
      Guardamos tu registro (actividades, puntajes, ánimo, notas y reflexiones) para que lo veas vos y, si sos paciente,
      el terapeuta con quien lo compartís. Son <b>datos de salud</b> y los tratamos con tu consentimiento.
    </>,
    <>No mostramos publicidad, no vendemos datos, no armamos perfiles y no los usamos para entrenar IA.</>,
    <>
      Los datos se guardan en <b>Brasil</b> (Supabase) y pasan por <b>Estados Unidos</b> (Vercel y, si usás el chat
      con IA, Groq).
    </>,
    <>
      Podés descargar tus registros, dejar de compartirlos y borrar tu cuenta desde la app. Para cualquier otro pedido,
      escribí a <Email />.
    </>,
  ],
  sections: [
    {
      id: 'responsable',
      title: 'Quién es responsable de tus datos',
      body: (
        <>
          <p>
            El responsable de la base de datos «Usuarios y registros de daily», que incluye los registros de los pacientes y
            las notas de sesión que los terapeutas escriben sobre ellos, es <LegalOwner />.
            {LEGAL_RNBD ? <> La base está inscripta en el Registro Nacional de Bases de Datos con el N° {LEGAL_RNBD}.</> : null}{' '}
            Para consultas de privacidad y para ejercer tus derechos, escribí a <Email />.
          </p>
          <p>
            Si sos paciente, tu terapeuta usa lo que compartís con él o ella como profesional de la salud, y tiene el deber
            de guardar secreto profesional.
          </p>
        </>
      ),
    },
    {
      id: 'datos',
      title: 'Qué datos guardamos',
      body: (
        <>
          <h3>De todas las cuentas</h3>
          <ul>
            <li>
              Tu <b>email</b> y tu <b>contraseña</b>. La contraseña la guarda nuestro proveedor de cuentas (Supabase)
              transformada con un algoritmo de un solo sentido (hash): nadie puede leerla, ni siquiera nosotros.
            </li>
            <li>
              Tu <b>nombre</b> (si sos terapeuta, tu nombre profesional) y el tipo de cuenta: paciente o terapeuta.
            </li>
            <li>
              Lo que aceptaste al crear la cuenta: la versión de estos textos, la fecha y hora, y una marca por cada casilla
              que marcaste.
            </li>
            <li>
              Datos técnicos que registra el servicio de cuentas: fecha de alta, último ingreso, y la dirección IP y el
              navegador de cada sesión y de cada ingreso.
            </li>
            <li>
              El nombre con el que creaste la cuenta (y, si sos paciente, el código de invitación) queda también en los
              datos internos de tu cuenta. Si después cambiás tu nombre en Ajustes, ese dato original no se actualiza; se
              borra con la cuenta.
            </li>
          </ul>
          <h3>Si sos paciente</h3>
          <ul>
            <li>
              Las <b>actividades</b> de cada día: horario de inicio (y de fin, si lo cargás), qué hiciste y la categoría,
              por ejemplo «trabajo», «vínculos» o «autocuidado y salud».
            </li>
            <li>
              Los puntajes de <b>placer</b> y <b>control</b> de cada actividad, del 1 al 10.
            </li>
            <li>
              Las <b>notas</b> de cada actividad, el <b>ánimo</b> del día (del 1 al 5) y la <b>reflexión</b> del día. La
              reflexión se guarda sola mientras escribís.
            </li>
            <li>
              Si una actividad la ordenó la IA del chat (queda marcada). Las que ordena el modo básico del chat, sin IA, no
              se marcan, y el ánimo y la reflexión tampoco.
            </li>
            <li>
              La fecha y hora en que guardás y en que cambiás por última vez cada actividad, y en que cambiaste por última vez
              el ánimo o la reflexión de cada día.
            </li>
            <li>
              Si usaste daily antes de tener cuenta, los registros que quedaron en tu navegador solo se suben a tu cuenta
              si elegís «Subir a mi cuenta».
            </li>
          </ul>
          <h3>Si sos terapeuta</h3>
          <ul>
            <li>
              Las <b>notas de sesión</b> que escribís sobre cada paciente, por semana, y la fecha y hora de la última
              edición de cada una. Se guardan solas mientras escribís.
            </li>
            <li>
              Las <b>invitaciones</b> que creás: el código, la fecha, el vencimiento, quién la usó y, si la escribís, una
              etiqueta para acordarte a quién invitaste.
            </li>
            <li>Tus vínculos con cada paciente y desde cuándo.</li>
          </ul>
          <h3>Lo que no pedimos</h3>
          <p>
            No pedimos DNI, fecha de nacimiento, teléfono, domicilio ni datos de pago. daily no usa cookies, herramientas
            de analítica ni publicidad.
          </p>
          <p>
            Si en tus notas o reflexiones nombrás a otras personas, tratá de no incluir datos que las identifiquen si no
            hace falta.
          </p>
        </>
      ),
    },
    {
      id: 'finalidades',
      title: 'Para qué los usamos',
      body: (
        <>
          <ul>
            <li>Llevar tu registro y mostrártelo en la app.</li>
            <li>
              Si sos paciente, compartirlo con el terapeuta que vos aceptaste: el que te invitó al crear la cuenta, o el de
              una invitación nueva que aceptes después.
            </li>
            <li>Si sos terapeuta, mostrarte el informe semanal de tus pacientes y guardar tus notas de sesión.</li>
            <li>Ordenar tu relato con IA, solo si usás el chat.</li>
            <li>Manejar tu cuenta: el ingreso, el cambio de contraseña y los emails de la cuenta, cuando se envían.</li>
            <li>Mantener el servicio seguro y funcionando: detectar errores y abusos con registros técnicos.</li>
          </ul>
          <p>
            <b>No los usamos</b> para publicidad, no los vendemos ni se los damos a nadie con fines comerciales, no armamos
            perfiles, no tomamos decisiones automatizadas sobre vos y no los usamos para entrenar modelos de IA.
          </p>
        </>
      ),
    },
    {
      id: 'consentimiento',
      title: 'Datos de salud y tu consentimiento',
      body: (
        <>
          <p>
            Lo que cargás en tu registro (actividades, puntajes, ánimo, notas y reflexiones) y las notas de sesión que
            escribe un terapeuta son <b>datos de salud</b>. También lo es tener una cuenta de paciente vinculada a un
            terapeuta, porque muestra que estás en tratamiento. La Ley 25.326 de Protección de los Datos Personales los
            considera datos sensibles y les da una protección especial.
          </p>
          <p>
            Los tratamos con tu <b>consentimiento libre, expreso e informado</b>, que das al crear la cuenta marcando las
            casillas correspondientes, cada una por separado. Si sos paciente, ese consentimiento cubre tu cuenta, tu
            registro, las notas de sesión que tu terapeuta escriba sobre vos y compartir tu registro con el terapeuta que te
            invitó; si después aceptás la invitación de otro terapeuta, consentís compartirlo con esa persona. En otra
            casilla consentís que tus datos se guarden y procesen fuera de Argentina (
            <SectionRef page="privacidad" id="transferencias" />
            ).
          </p>
          <p>
            Además, si sos paciente, tu registro se comparte dentro de un tratamiento con un profesional de la salud, que
            tiene el deber de guardar secreto profesional (art. 8 de la Ley 25.326).
          </p>
          <p>
            Nadie puede obligarte a dar datos sensibles. Para tener una cuenta solo son obligatorios el email, la
            contraseña, un nombre y, si sos paciente, el código de invitación: sin ellos no podés usar daily. Todo lo demás
            es optativo: si no cargás algo, el informe semanal muestra menos. Si cargás algo inexacto, el informe lo va a
            mostrar así, y lo podés corregir cuando quieras.
          </p>
          <p>
            Podés <b>retirar tu consentimiento</b> cuando quieras, dejando de compartir tu registro o borrando tu cuenta
            (<SectionRef page="privacidad" id="conservacion" />). El retiro vale desde ese momento: no tiene efecto retroactivo.
          </p>
        </>
      ),
    },
    {
      id: 'acceso',
      title: 'Quién puede ver tus datos',
      body: (
        <>
          <ul>
            <li>
              <b>Vos</b>, todo lo tuyo.
            </li>
            <li>
              <b>Tu terapeuta</b>, si sos paciente: ve todo tu registro (actividades, puntajes, notas, ánimo y
              reflexiones), también lo que cargaste antes de vincularte con él o ella, a medida que lo guardás. Solo puede
              leerlo: no puede cambiarlo ni borrarlo. Ve tu nombre, pero no tu email. Deja de verlo en cuanto termina el
              vínculo.
            </li>
            <li>
              <b>Las notas de sesión</b> las ve solo el terapeuta que las escribe, y solo mientras esté vinculado con ese
              paciente. El paciente no las ve en la app y no salen en el informe impreso, pero puede pedirnos acceso a lo que
              dicen sobre él o ella (<SectionRef page="privacidad" id="derechos" />).
            </li>
            <li>
              <b>Los demás usuarios</b> (otros pacientes y otros terapeutas) no ven nada tuyo. Estas reglas están en la
              base de datos, no solo en la pantalla.
            </li>
            <li>
              Quien tenga un <b>link de invitación</b> puede ver, sin crear una cuenta, el nombre del terapeuta que la creó
              y si sigue vigente.
            </li>
            <li>
              <b>Los proveedores</b> de la <SectionRef page="privacidad" id="proveedores" /> procesan los datos para que daily funcione, con el alcance que se
              describe ahí.
            </li>
            <li>
              <b>Nosotros</b>, como responsables, tenemos acceso técnico a la base de datos. Lo usamos solo para mantener y
              proteger el servicio, atender tus pedidos o cumplir una obligación legal, con deber de confidencialidad.
            </li>
            <li>
              <b>Autoridades</b>, solo si una ley o una orden judicial lo exige.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'proveedores',
      title: 'Proveedores y dónde están tus datos',
      body: (
        <>
          <p>daily funciona con estos servicios externos. Cada uno recibe solo lo que necesita para su tarea:</p>
          <ProviderTable />
          <ul>
            <li>
              Los emails de la cuenta (por ejemplo, para recuperar la contraseña), cuando se envían, los envía{' '}
              {EMAIL_SENDER ? <>{EMAIL_SENDER.name}, el servicio de envío que configuramos en Supabase</> : 'Supabase'}.
            </li>
            <li>
              Si sos terapeuta y compartís una invitación por WhatsApp, por email o con otra app, el mensaje sale por esa
              app, con sus propias reglas. Lleva el link, tu nombre y, si escribiste una etiqueta, la primera palabra de esa
              etiqueta.
            </li>
            <li>No hay otros: no usamos analítica, publicidad ni píxeles de seguimiento.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'transferencias',
      title: 'Transferencias internacionales',
      body: (
        <>
          <p>
            Tus datos se guardan en <b>Brasil</b> (Supabase) y también se procesan en <b>Estados Unidos</b> (Vercel y, si
            usás el chat, Groq{EMAIL_SENDER ? <>; y {EMAIL_SENDER.name}, para los emails de la cuenta</> : null}).
          </p>
          <p>
            La autoridad argentina de protección de datos no incluye a Brasil ni a Estados Unidos entre los países con un
            nivel de protección adecuado. Por eso, la transferencia se hace con tu <b>consentimiento expreso</b>, que das al
            crear la cuenta en una casilla aparte (art. 12 de la Ley 25.326 y art. 12 del Decreto 1558/2001). Además, a cada
            proveedor le damos solo lo necesario y aplicamos las medidas de la{' '}
            <SectionRef page="privacidad" id="seguridad" />.
          </p>
          <p>Todo el servicio depende de estos proveedores: si no aceptás la transferencia, no vas a poder usar daily.</p>
        </>
      ),
    },
    {
      id: 'ia',
      title: 'Inteligencia artificial',
      body: (
        <>
          <p>
            El chat «Contale tu día» es <b>optativo</b>. Siempre podés cargar todo a mano, y así nada pasa por la IA.
          </p>
          <h3>Qué se envía</h3>
          <p>
            Cuando tocás enviar, nuestro servidor (Vercel, EE. UU.) le manda a <b>Groq</b> (EE. UU.): tu mensaje, los
            mensajes anteriores de esa conversación y las propuestas que te hizo la IA, la fecha, y el horario y el título de
            las actividades que ya guardaste ese día, para que no las repita. La IA usa modelos abiertos (gpt-oss) que corren
            en los servidores de Groq: nada se envía a OpenAI.
          </p>
          <p>
            No enviamos tu nombre, tu email, tu identificador de usuario, los puntajes, notas o ánimo que ya guardaste, ni
            quién es tu terapeuta.
          </p>
          <h3>Qué guarda Groq</h3>
          <p>Groq {groqRetention()}</p>
          <h3>Vos decidís qué se guarda</h3>
          <ul>
            <li>
              La IA te propone actividades y, a veces, un ánimo y un resumen del día. Nada se guarda hasta que lo revisás y
              tocás guardar. Las actividades que ordenó la IA quedan marcadas como ordenadas con IA; las del modo básico, el
              ánimo y la reflexión no se marcan.
            </li>
            <li>
              La conversación no se guarda en daily: queda solo en la pantalla abierta y se borra al recargar la página o al
              cerrar sesión.
            </li>
            <li>
              La IA puede equivocarse: revisá horarios, categorías y puntajes antes de guardar. No da consejos clínicos ni
              diagnósticos, no toma decisiones sobre vos y no avisa a nadie. Si mencionás que querés hacerte daño, puede
              mostrarte un mensaje que te anima a pedir ayuda; ese mensaje no se guarda y nadie recibe un aviso.
            </li>
            <li>
              Si la IA no está disponible o se terminó el cupo del día, el chat sigue en un modo básico que ordena el texto en
              tu navegador. Ese cambio puede pasar después de que el texto llegó a nuestro servidor o a Groq.
            </li>
            <li>
              En la demo sin cuenta, el chat usa siempre el modo básico y no envía nada. Si abrís la demo con tu cuenta
              iniciada, el chat usa la IA como en tu registro, aunque la demo no guarde nada.
            </li>
          </ul>
          <h3>Dictado</h3>
          <p>
            Si tocás «Dictar», tu navegador convierte la voz en texto con su propio servicio (en Chrome, el de Google). daily
            no recibe el audio, y el texto solo se envía a la IA cuando tocás enviar.
          </p>
        </>
      ),
    },
    {
      id: 'conservacion',
      title: 'Cuánto tiempo guardamos los datos',
      body: (
        <>
          <p>Mientras tengas tu cuenta, guardamos lo que cargaste. No borramos registros por antigüedad.</p>
          <h3>Si borrás tu cuenta</h3>
          <p>
            Desde <b>Ajustes → Eliminar cuenta</b>. Se borra en el momento:
          </p>
          <ul>
            <li>
              si sos paciente: tu cuenta, tu perfil, todos tus registros, tu vínculo y las notas de sesión que cualquier
              terapeuta tenga sobre vos;
            </li>
            <li>
              si sos terapeuta: tu cuenta, tu perfil, tus notas de sesión, tus invitaciones y tus vínculos. Tus pacientes
              conservan sus registros.
            </li>
          </ul>
          <p>Algunas cosas pueden quedar por un tiempo:</p>
          <ul>
            {/* Supabase guarda hasta 7 copias diarias en los planes Free y Pro (con el plan Team son 14:
                si cambia el plan, cambiar este plazo). */}
            <li>las copias de seguridad diarias de la base de datos, que Supabase conserva hasta 7 días;</li>
            <li>
              los registros técnicos y de seguridad del servicio de cuentas (por ejemplo, fechas e IP de ingresos) y del
              servidor, durante el plazo que fija cada proveedor;
            </li>
            {!GROQ_ZDR && <li>lo que Groq haya conservado del chat, hasta 30 días;</li>}
            <li>
              si sos paciente, la invitación con la que te registraste queda en la cuenta de tu terapeuta, ya sin relación
              con tu cuenta y con la etiqueta que haya escrito, hasta que borre su cuenta;
            </li>
            <li>
              si sos paciente, los informes tuyos que tu terapeuta haya impreso o guardado en PDF, que quedan bajo su
              responsabilidad profesional;
            </li>
            <li>lo que hayas descargado o impreso, que queda en tu dispositivo.</li>
          </ul>
          <h3>Si termina el vínculo</h3>
          <p>
            El paciente (<b>Ajustes → Dejar de compartir</b>) o el terapeuta (<b>⋯ → Desvincular</b>) pueden terminarlo. El
            terapeuta deja de ver el registro en el momento y se borran sus notas de sesión sobre ese paciente. Los registros
            del paciente no se borran.
          </p>
          <h3>Si cambiás de terapeuta</h3>
          <p>
            Si aceptás la invitación de otro terapeuta, el anterior deja de ver tu registro en el momento, pero{' '}
            <b>sus notas de sesión sobre vos no se borran</b>: quedan guardadas sin que nadie las vea en la app, y vuelven a
            estar disponibles para esa persona si te volvés a vincular con ella. Se borran si alguno de los dos borra su
            cuenta, o antes si nos lo pedís por email. El terapeuta nuevo ve todo tu registro, también lo anterior.
          </p>
          <h3>Editar y borrar</h3>
          <p>
            Podés cambiar o borrar cualquier actividad cuando quieras. Borrarla es definitivo (durante unos segundos podés
            deshacerlo). El ánimo y la reflexión del día se pueden vaciar. Los links de invitación vencen a los 14 días de
            creados; el terapeuta puede borrar los que no se usaron.
          </p>
        </>
      ),
    },
    {
      id: 'navegador',
      title: 'Datos que quedan en tu navegador',
      body: (
        <>
          <p>
            daily no usa cookies. Guarda algunos datos en el almacenamiento de tu navegador (localStorage y sessionStorage),
            en tu dispositivo:
          </p>
          <ul>
            <li>
              <b>Tu sesión</b>: las claves de acceso y los datos de tu cuenta (identificador, email, nombre, tipo de cuenta,
              código de invitación si sos paciente, lo que aceptaste al crear la cuenta y las fechas de alta y del último
              ingreso), para que no tengas que ingresar cada vez, y datos temporales de los links de email de la cuenta. Se
              borran al cerrar sesión.
            </li>
            <li>
              <b>Tus preferencias</b>: el tema claro u oscuro.
            </li>
            <li>
              <b>Dos marcas</b>: si ya viste la presentación y si en este navegador ya se usó una cuenta (así te mostramos el
              ingreso en vez de la página de inicio). No se borran al cerrar sesión ni al borrar la cuenta.
            </li>
            <li>
              Si sos terapeuta, <b>el último paciente que abriste</b>, hasta que cerrás la pestaña.
            </li>
            <li>
              Si abriste estas páginas en otra pestaña desde la app, <b>otra marca</b> para que el botón «Cerrar» cierre esa
              pestaña, hasta que la cerrás.
            </li>
            <li>
              Los <b>registros de antes de tener cuenta</b>, si los hay, hasta que los subís o los descartás.
            </li>
          </ul>
          <p>
            La conversación del chat y los datos de la demo viven solo en la memoria de la pestaña. Podés borrar todo desde
            la configuración de tu navegador. En un dispositivo compartido, cerrá sesión al terminar.
          </p>
        </>
      ),
    },
    {
      id: 'seguridad',
      title: 'Seguridad',
      body: (
        <>
          <ul>
            <li>Las conexiones viajan cifradas (HTTPS).</li>
            <li>
              Las reglas de acceso están en la base de datos: aunque alguien modifique la app en su navegador, no puede leer
              lo que no le corresponde.
            </li>
            <li>Las contraseñas se guardan transformadas (hash): nadie puede leerlas.</li>
            <li>
              El servidor solo llama a la IA para usuarios con sesión iniciada, y nuestros registros del servidor no guardan
              lo que escribís en el chat.
            </li>
            <li>
              Si una pantalla falla, el navegador nos manda un reporte técnico (el mensaje de error, el detalle técnico de
              dónde ocurrió en el código, la pantalla, sin códigos de invitación, y el tipo de navegador) que queda en los
              registros de Vercel. Vercel registra además la IP del pedido. No está pensado para incluir datos tuyos.
            </li>
            <li>El acceso de administración se usa solo cuando hace falta.</li>
          </ul>
          <p>
            Ningún sistema es infalible. Si hubiera un incidente de seguridad que afecte tus datos, te vamos a avisar por
            email y, cuando corresponda, a la autoridad de control.
          </p>
          <p>
            De tu lado: usá una contraseña que no uses en otros sitios, cerrá sesión en dispositivos compartidos y cuidá los
            archivos que descargues o imprimas.
          </p>
        </>
      ),
    },
    {
      id: 'derechos',
      title: 'Tus derechos y cómo ejercerlos',
      body: (
        <>
          <p>
            Tenés derecho a <b>acceder</b> a tus datos, a pedir que se <b>corrijan</b>, se <b>actualicen</b> o se{' '}
            <b>borren</b>, y a <b>retirar tu consentimiento</b> (arts. 14 a 16 de la Ley 25.326).
          </p>
          <h3>Desde la app</h3>
          <ul>
            <li>
              <b>Ver y corregir</b>: todo lo que cargaste está en tu registro y lo podés editar. Tu nombre y tu contraseña se
              cambian en Ajustes.
            </li>
            <li>
              <b>Copia</b>, si sos paciente: <b>Ajustes → Respaldo → Descargar mis registros</b> baja un archivo con tus
              actividades, tu ánimo y tus reflexiones.
            </li>
            <li>
              <b>Dejar de compartir</b>, si sos paciente, o <b>desvincular</b> a un paciente, si sos terapeuta.
            </li>
            <li>
              <b>Borrar tu cuenta</b>: Ajustes → Eliminar cuenta.
            </li>
          </ul>
          <h3>Por email</h3>
          <p>
            Para todo lo demás, por ejemplo una copia completa de los datos de tu cuenta, cambiar tu email (no se puede desde
            la app), una copia de tus notas de sesión si sos terapeuta, o borrar notas que quedaron guardadas después de un
            cambio de terapeuta: escribí a <Email />, en lo posible desde el email de tu cuenta. Podemos pedirte que
            confirmes tu identidad antes de responder, para no darle tus datos a otra persona.
          </p>
          <p>
            Si sos paciente, tu derecho de acceso incluye todo lo que daily guarda sobre vos, también las notas de sesión que
            un terapeuta haya escrito sobre vos.
          </p>
          <h3>Plazos y costo</h3>
          <p>
            Respondemos los pedidos de acceso dentro de los <b>10 días corridos</b>, y los de corrección, actualización o
            supresión dentro de los <b>5 días hábiles</b>, como fija la ley. No te cobramos por ejercer tus derechos.
          </p>
          <Quote>
            El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma
            gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto conforme lo
            establecido en el artículo 14, inciso 3 de la Ley Nº 25.326.
          </Quote>
          <p>
            Si no te respondemos a tiempo o la respuesta no te conforma, podés reclamar ante la autoridad de control (
            <SectionRef page="privacidad" id="aaip" />).
          </p>
        </>
      ),
    },
    {
      id: 'aaip',
      title: 'Reclamos ante la AAIP',
      body: (
        <>
          <p>
            La <b>Agencia de Acceso a la Información Pública (AAIP)</b> es la autoridad de control de la Ley 25.326. Si
            vencieron los plazos de la <SectionRef page="privacidad" id="derechos" /> sin respuesta, o no estás de acuerdo con la respuesta, podés hacer una
            denuncia ante su Dirección Nacional de Protección de Datos Personales, con una copia de tu pedido (con la fecha
            en que lo hiciste) y de nuestra respuesta, si la hubo. Los canales para hacerlo están en{' '}
            <a href="https://www.argentina.gob.ar/aaip" target="_blank" rel="noopener noreferrer">
              argentina.gob.ar/aaip
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
            .
          </p>
          <Quote>
            La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la
            atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por
            incumplimiento de las normas vigentes en materia de protección de datos personales.
          </Quote>
        </>
      ),
    },
    {
      id: 'menores',
      title: 'Menores de edad',
      body: (
        <>
          <p>
            daily es para personas de <b>18 años o más</b>. Al crear la cuenta declarás que tenés esa edad. Si sos terapeuta,
            no invites a menores de 18 años.
          </p>
          <p>
            Si nos enteramos de que una cuenta es de una persona menor de 18 años, vamos a contactar a quien la usa y podemos
            borrarla.
          </p>
        </>
      ),
    },
    {
      id: 'cambios',
      title: 'Cambios en esta política',
      body: (
        <>
          <p>
            Si cambiamos esta política, publicamos la versión nueva con su fecha de vigencia y te avisamos en la app o por
            email antes de que empiece a regir.
          </p>
          <p>
            Es un cambio importante cualquier cambio en los datos que guardamos, en para qué los usamos, en quién los recibe
            o en qué países se guardan o procesan. Esos cambios te los avisamos con anticipación y te pedimos que los aceptes
            de forma expresa: seguir usando daily no cuenta como aceptación.
          </p>
          <p>
            Los cambios no son retroactivos. Si no estás de acuerdo, podés descargar tus registros y borrar tu cuenta, sin
            costo.
          </p>
        </>
      ),
    },
    {
      id: 'contacto',
      title: 'Contacto',
      body: (
        <p>
          Responsable: <LegalOwner />. Email: <Email />, para consultas de privacidad y para ejercer tus derechos.
        </p>
      ),
    },
  ],
};

// ─────────────────────────────── Términos y condiciones ───────────────────────────────

const TERMS: LegalDoc = {
  title: 'Términos y condiciones',
  short: 'Términos',
  intro: (
    <p>
      Estas son las reglas para usar daily. Están escritas para leerse rápido: si algo no queda claro, escribinos a{' '}
      <Email />.
    </p>
  ),
  summary: [
    <>
      daily es un registro diario de actividades y ánimo para acompañar la terapia. <b>No es un servicio de salud ni de
      emergencias.</b>
    </>,
    <>
      Nadie mira tus registros en tiempo real. Si estás en peligro, llamá al <a href="tel:911">911</a> o al{' '}
      <a href="tel:135">135</a> (más números en la <SectionRef page="terminos" id="no-es" />).
    </>,
    <>Es gratis por ahora. Si eso cambia, te avisamos antes y podés irte sin costo.</>,
    <>Lo que cargás es tuyo, y podés borrar tu cuenta cuando quieras.</>,
  ],
  sections: [
    {
      id: 'aceptacion',
      title: 'Quién ofrece daily y cómo se aceptan estos términos',
      body: (
        <>
          <p>
            daily lo ofrece <LegalOwner />. Contacto: <Email />. En estos términos, «daily», «nosotros» y «nos» se refieren a él
            como responsable del servicio.
          </p>
          <p>
            Estos términos, junto con la <LegalLink page="privacidad">Política de privacidad</LegalLink>, son el acuerdo
            entre vos y daily. Los aceptás al crear tu cuenta, marcando la casilla correspondiente; guardamos la versión y la
            fecha. Si no estás de acuerdo, no crees una cuenta. Para mirar la página de inicio, la presentación o la demo no
            hace falta aceptar nada.
          </p>
        </>
      ),
    },
    {
      id: 'que-es',
      title: 'Qué es daily',
      body: (
        <>
          <p>daily es una aplicación web para acompañar la terapia de activación conductual:</p>
          <ul>
            <li>
              Si sos <b>paciente</b>, registrás tus actividades de cada día con su horario y su categoría, cuánto placer y
              cuánto control sentiste (del 1 al 10), notas, tu ánimo y una reflexión. Podés cargarlo a mano o contárselo a un
              chat con IA que lo ordena.
            </li>
            <li>
              Si sos <b>terapeuta</b>, invitás a tus pacientes con un link, ves el informe semanal de cada uno y escribís
              notas de sesión privadas.
            </li>
            <li>Cada paciente comparte su registro con un solo terapeuta a la vez, que solo puede leerlo.</li>
            <li>Hay una demo con datos de ejemplo que se puede usar sin cuenta.</li>
          </ul>
          <p>Funciona en el navegador: no hace falta instalar nada.</p>
        </>
      ),
    },
    {
      id: 'no-es',
      title: 'Qué no es daily',
      body: (
        <>
          <ul>
            <li>
              <b>No es un servicio de salud ni un dispositivo médico.</b> No diagnostica, no indica tratamientos y no da
              consejos clínicos.
            </li>
            <li>
              <b>No reemplaza la terapia ni a tu terapeuta</b>: la acompaña. Las decisiones sobre tu tratamiento las tomás con
              tu profesional.
            </li>
            <li>No es telemedicina ni un canal para comunicarte con tu terapeuta.</li>
            <li>
              <b>No se monitorea en tiempo real.</b> Nadie lee tus registros mientras los cargás y nadie recibe avisos: ni
              daily ni tu terapeuta, que ve lo que guardaste cuando abre tu informe. El mensaje de apoyo que puede mostrar la
              IA tampoco avisa a nadie.
            </li>
            <li>
              <b>No es un servicio de emergencias.</b> Acordá con tu terapeuta cómo contactarlo o a quién recurrir si lo
              necesitás.
            </li>
          </ul>
          <Emergency />
        </>
      ),
    },
    {
      id: 'cuentas',
      title: 'Cuentas',
      body: (
        <>
          <ul>
            <li>
              Para crear una cuenta tenés que tener <b>18 años o más</b>.
            </li>
            <li>La cuenta es personal: no la compartas ni crees cuentas para otras personas.</li>
            <li>
              Usá un email que sea tuyo y un nombre con el que te reconozcan (si sos terapeuta, tu nombre profesional).
            </li>
            <li>Cuidá tu contraseña. Si creés que alguien entró a tu cuenta, cambiala y avisanos.</li>
            <li>
              Las cuentas de paciente se crean solo con una invitación de un terapeuta. Si aceptás la invitación de otro
              terapeuta, cambiás de terapeuta: la{' '}
              <LegalLink page="privacidad" section="conservacion">
                Política de privacidad
              </LegalLink>{' '}
              explica qué pasa con los datos.
            </li>
            <li>
              daily no verifica títulos ni matrículas. Si sos paciente, compartí tu registro solo con alguien que sepas que es
              tu terapeuta.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'terapeutas',
      title: 'Si sos terapeuta',
      body: (
        <>
          <p>
            Al crear una cuenta de terapeuta declarás que sos profesional de la salud y que estás habilitado o habilitada
            para ejercer. Además, te comprometés a:
          </p>
          <ul>
            <li>
              Guardar <b>secreto profesional</b> sobre lo que ves en daily (art. 156 del Código Penal, art. 2 de la Ley
              26.529 y las normas y el código de ética de tu profesión).
            </li>
            <li>
              Explicarle a cada paciente qué es daily, qué vas a ver y cómo lo vas a usar, antes de invitarlo. Tu paciente da
              su consentimiento al crear la cuenta, también para que daily guarde las notas de sesión que escribas sobre él
              o ella, pero la decisión de usar daily en el tratamiento es de los dos.
            </li>
            <li>Invitar solo a personas de 18 años o más.</li>
            <li>Acordar con cada paciente cómo contactarte, o a quién recurrir, si lo necesita: daily no te avisa nada.</li>
            <li>
              Cuidar los informes que imprimas, no escribir en tus notas más datos de otras personas de los necesarios y
              cumplir las obligaciones que te correspondan sobre los datos de tus pacientes.
            </li>
          </ul>
          <h3>Las notas de sesión no son una historia clínica</h3>
          <p>
            Las notas de sesión son una herramienta de trabajo del o la profesional. No son una historia clínica ni cumplen
            los requisitos de los arts. 12 a 18 de la Ley 26.529. Se pueden editar, y se borran si vos o tu paciente terminan
            el vínculo desde la app (Desvincular o Dejar de compartir) o si alguno de los dos borra su cuenta. Sos
            responsable de llevar tu historia clínica por los medios que exige la ley.
          </p>
          <p>
            Si tu paciente acepta la invitación de otro terapeuta, el vínculo con vos termina de otra forma: dejás de ver su
            registro y tus notas sobre esa persona, pero <b>las notas no se borran</b>. Quedan guardadas sin que nadie las vea
            y vuelven a aparecer si se vuelve a vincular con vos; se borran si alguno de los dos borra su cuenta o si tu
            paciente nos pide que las borremos. daily no tiene una función para exportar las notas; si necesitás una copia,
            pedila a <Email />.
          </p>
          <p>
            Las notas que escribís sobre un paciente son datos personales de esa persona: puede pedirnos acceso a ellas,
            como explica la{' '}
            <LegalLink page="privacidad" section="derechos">
              Política de privacidad
            </LegalLink>
            .
          </p>
        </>
      ),
    },
    {
      id: 'ia',
      title: 'La IA del chat',
      body: (
        <>
          <ul>
            <li>Es optativa. Siempre podés cargar tus actividades a mano.</li>
            <li>
              Lo que le escribís lo procesa un proveedor externo, Groq, en EE. UU. Qué se envía y qué se guarda está en la{' '}
              <LegalLink page="privacidad" section="ia">
                Política de privacidad
              </LegalLink>
              .
            </li>
            <li>
              La IA puede equivocarse o entender mal. Revisá cada propuesta antes de guardarla: lo que guardás pasa a tu
              registro y tu terapeuta lo ve.
            </li>
            <li>No da consejos clínicos ni diagnósticos, y lo que responde no es una opinión profesional.</li>
            <li>El cupo gratis de la IA es limitado: cuando se termina, el chat sigue en un modo básico, más simple.</li>
            <li>Usá el chat solo para contar tu día.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'uso',
      title: 'Uso aceptable',
      body: (
        <>
          <p>No está permitido:</p>
          <ul>
            <li>entrar o intentar entrar a cuentas o datos de otras personas, o saltear las reglas de acceso;</li>
            <li>atacar, sobrecargar o interferir con el servicio, o usar programas automáticos para usarlo o sacar datos;</li>
            <li>hacerte pasar por otra persona, o por un profesional que no sos;</li>
            <li>cargar contenido ilegal, o datos de otras personas sin necesidad o sin derecho;</li>
            <li>usar daily, la IA o los links de invitación para algo distinto de lo que son.</li>
          </ul>
          <p>
            Si encontrás una falla de seguridad, avisanos a <Email />.
          </p>
        </>
      ),
    },
    {
      id: 'contenido',
      title: 'Tu contenido',
      body: (
        <>
          <p>
            Lo que cargás es tuyo: los registros, de cada paciente; las notas de sesión, de cada terapeuta. Sos responsable de
            lo que cargás.
          </p>
          <p>
            Nos das solo el permiso necesario para guardarlo, mostrártelo, compartirlo con quien corresponde según estos
            términos y procesarlo para prestarte el servicio (con la IA, si la usás). No lo usamos para nada más, y el permiso
            termina cuando lo borrás o borrás tu cuenta, salvo lo que quede un tiempo en copias de seguridad, como explica la
            Política de privacidad.
          </p>
        </>
      ),
    },
    {
      id: 'propiedad',
      title: 'Propiedad intelectual',
      body: (
        <p>
          El software, el diseño, los textos y el nombre daily son de su responsable. Podés usarlos para usar el servicio,
          pero no copiarlos, modificarlos ni distribuirlos sin permiso. Algunas partes son de terceros (por ejemplo, la
          tipografía y los íconos) y tienen sus propias licencias.
        </p>
      ),
    },
    {
      id: 'precio',
      title: 'Precio',
      body: (
        <>
          <p>Por ahora, daily es gratis, para pacientes y para terapeutas.</p>
          <p>
            Si en el futuro queremos cobrar algo, te vamos a avisar con al menos 30 días de anticipación, con el precio y las
            condiciones. No te vamos a cobrar nada sin que lo aceptes de forma expresa, y si no querés pagar, podés irte sin
            costo.
          </p>
        </>
      ),
    },
    {
      id: 'disponibilidad',
      title: 'Disponibilidad del servicio',
      body: (
        <>
          <p>
            Hacemos lo razonable para que daily funcione bien y de forma segura. Igual, es un servicio nuevo y puede tener
            interrupciones o errores: por mantenimiento, por fallas de los proveedores o de internet.
          </p>
          <p>
            Podemos mejorar o cambiar funciones. Si planeamos una interrupción larga, te avisamos antes. Si vamos a quitar una
            función importante, te avisamos con al menos 30 días de anticipación, salvo que haya que hacerlo antes por
            seguridad o por una obligación legal; si no estás de acuerdo, podés descargar tus registros y borrar tu cuenta
            sin costo.
          </p>
          <p>Si sos paciente, te recomendamos descargar de vez en cuando una copia de tus registros.</p>
        </>
      ),
    },
    {
      id: 'responsabilidad',
      title: 'Responsabilidad',
      body: (
        <>
          <p>
            Respondemos por el servicio según la ley argentina, incluida la Ley 24.240 de Defensa del Consumidor. Nada de
            estos términos limita los derechos que te da la ley ni excluye la responsabilidad que la ley no permite excluir.
          </p>
          <p>
            Cada terapeuta responde por su práctica profesional y por las decisiones clínicas que toma: daily no participa del
            tratamiento. Cada persona responde por el uso que hace de su cuenta y por lo que carga.
          </p>
        </>
      ),
    },
    {
      id: 'baja',
      title: 'Baja y suspensión',
      body: (
        <>
          <p>
            Podés dejar de usar daily cuando quieras. Para borrar tu cuenta: <b>Ajustes → Eliminar cuenta</b>. Es gratis,
            inmediato y no hace falta dar explicaciones. Qué se borra está en la{' '}
            <LegalLink page="privacidad" section="conservacion">
              Política de privacidad
            </LegalLink>
            .
          </p>
          <p>
            Podemos suspender o borrar una cuenta si hay un incumplimiento grave de estos términos (por ejemplo, un ataque al
            servicio, hacerse pasar por otra persona o usar daily con alguien menor de edad). Salvo una urgencia para proteger
            a otras personas o al servicio, te avisamos antes por email y podés responder.
          </p>
          <p>
            Si daily deja de funcionar, te avisamos con al menos 30 días de anticipación para que puedas descargar tus
            registros o pedir una copia, y después borramos los datos.
          </p>
        </>
      ),
    },
    {
      id: 'cambios',
      title: 'Cambios en estos términos',
      body: (
        <>
          <p>
            Si cambiamos estos términos, publicamos la versión nueva con su fecha de vigencia y te avisamos en la app o por
            email antes de que empiece a regir.
          </p>
          <p>
            Es un cambio importante cualquier cambio en lo que hace daily con tus datos, en el precio, en la responsabilidad,
            en la baja o la suspensión de cuentas, o en la ley aplicable y los reclamos. Esos cambios te los avisamos con
            anticipación y te pedimos que los aceptes de forma expresa: seguir usando daily no cuenta como aceptación.
          </p>
          <p>Los cambios no son retroactivos. Si no los aceptás, podés borrar tu cuenta sin costo.</p>
        </>
      ),
    },
    {
      id: 'ley',
      title: 'Ley aplicable y reclamos',
      body: (
        <>
          <p>Estos términos se rigen por la ley argentina.</p>
          <p>
            Si sos consumidor o consumidora, podés reclamar ante los tribunales de tu domicilio (art. 1109 del Código Civil y
            Comercial de la Nación) y ante la autoridad de defensa del consumidor de tu jurisdicción. Por temas de datos
            personales, también ante la AAIP (
            <LegalLink page="privacidad" section="aaip">
              Política de privacidad
            </LegalLink>
            ).
          </p>
          <p>Si querés, antes escribinos: vamos a tratar de resolverlo rápido.</p>
        </>
      ),
    },
    {
      id: 'contacto',
      title: 'Contacto',
      body: (
        <p>
          Responsable: <LegalOwner />. Email: <Email />.
        </p>
      ),
    },
  ],
};

const DOCS: Record<LegalPath, LegalDoc> = { privacidad: PRIVACY, terminos: TERMS };
