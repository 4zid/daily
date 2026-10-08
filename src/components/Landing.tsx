import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  ChartColumn,
  Check,
  ChevronDown,
  Link2,
  Lock,
  Mic,
  NotebookPen,
  Pause,
  Play,
  Printer,
  ShieldCheck,
  Smartphone,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Rating } from '../types';
import { LEGAL_EMAIL, groqRetentionShort } from '../lib/legal';
import { navigate, returnScroll } from '../lib/route';
import { Brand, CategoryAvatar, RatingScale, Scores } from './common';
import { LegalLink } from './Legal';
import '../landing.css';

// La landing pública: lo primero que ve quien entra sin sesión. Le habla al
// terapeuta (quien elige daily) y muestra el producto real con microinteracciones.
// Todo lo que se mueve respeta "reducir movimiento".

// El video del hero (H.264 1600×900, con efectos de sonido) y su póster, en public/video.
const VIDEO_SRC = '/video/daily-demo.mp4';
const VIDEO_POSTER = '/video/daily-demo-poster.jpg';

// Capítulos del video, en segundos desde el inicio. Si cambia el corte, se ajustan acá:
// cada capítulo dura hasta que empieza el siguiente, y el último hasta el final.
const VIDEO_CHAPTERS = [
  { t: 0, label: 'Registro' },
  { t: 15.5, label: 'Con IA' },
  { t: 22.5, label: 'Su semana' },
  { t: 28.7, label: 'Informe' },
  { t: 39.3, label: 'Invitación' },
];

const SECTIONS = [
  { id: 'como-funciona', label: 'Cómo funciona' },
  { id: 'funciones', label: 'Funciones' },
  { id: 'privacidad', label: 'Privacidad' },
  { id: 'preguntas', label: 'Preguntas' },
] as const;

export function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = 'daily · Registro diario de actividades para terapia';
    return () => {
      document.title = previous;
    };
  }, []);

  // Al llegar desde otra pantalla (salir de la demo) la landing arranca arriba, y al irse
  // (demo, alta, ingreso) la pantalla nueva también. Al volver de una página legal abierta
  // desde acá, vuelve a donde estaba.
  useEffect(() => {
    window.scrollTo(0, returnScroll() ?? 0);
    return () => window.scrollTo(0, 0);
  }, []);

  // Las animaciones en bucle de una sección se pausan mientras está fuera de pantalla.
  // Se marca lo que está afuera (no lo que está adentro): sin IntersectionObserver, todo sigue animando.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.classList.toggle('is-offscreen', !entry.isIntersecting);
    });
    root.querySelectorAll('.lp-hero, .lp-section, .lp-final').forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp" ref={rootRef}>
      <Nav />
      <main>
        <Hero />
        <Basis />
        <HowItWorks />
        <Features />
        <TwoViews />
        <Privacy />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

// ─────────────────────────────── utilidades ───────────────────────────────

function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/** true desde que el elemento entra en pantalla (una sola vez) o mientras está visible. */
function useInView<T extends Element>(once = true, rootMargin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin]);
  return [ref, inView] as const;
}

/** Aparece al entrar en pantalla: sube y se asienta. `i` escalona varios. */
function Reveal({
  children,
  i = 0,
  className = '',
  as: Tag = 'div',
  eager = false,
}: {
  children: ReactNode;
  i?: number;
  className?: string;
  as?: 'div' | 'li' | 'section';
  /** Aparece al cargar la página, sin esperar al scroll (el hero). */
  eager?: boolean;
}) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!eager) return;
    const id = requestAnimationFrame(() => setLoaded(true));
    return () => cancelAnimationFrame(id);
  }, [eager]);
  const inView = seen || loaded;
  return (
    <Tag ref={ref as never} className={`lp-reveal${inView ? ' is-in' : ''} ${className}`} style={{ ['--i' as string]: i } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Cuenta hasta `target` cuando `active`. */
function useCountUp(target: number, active: boolean, duration = 1100, decimals = 0): string {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      setValue(target * (1 - Math.pow(1 - k, 4)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration, reduced]);
  return value.toLocaleString('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Un botón que se acerca apenas al puntero (solo con mouse y con movimiento). */
function useMagnetic<T extends HTMLElement>(strength = 0.22) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<T>) => {
      const el = ref.current;
      if (!el || reduced || e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * strength;
      const dy = (e.clientY - (r.top + r.height / 2)) * strength;
      el.style.setProperty('--mx', `${Math.max(-8, Math.min(8, dx)).toFixed(1)}px`);
      el.style.setProperty('--my', `${Math.max(-6, Math.min(6, dy)).toFixed(1)}px`);
    },
    [reduced, strength],
  );
  const onPointerLeave = useCallback(() => {
    ref.current?.style.setProperty('--mx', '0px');
    ref.current?.style.setProperty('--my', '0px');
  }, []);
  return { ref, onPointerMove, onPointerLeave };
}

function CtaButton({ children, onClick, variant = 'primary', icon }: { children: ReactNode; onClick: () => void; variant?: 'primary' | 'ghost' | 'light'; icon?: ReactNode }) {
  const magnetic = useMagnetic<HTMLButtonElement>();
  return (
    <button type="button" className={`lp-btn lp-btn-${variant}`} onClick={onClick} {...magnetic}>
      <span className="lp-btn-inner">
        {icon}
        {children}
        {variant !== 'ghost' && <ArrowRight className="lp-btn-arrow" aria-hidden />}
      </span>
    </button>
  );
}

/** La luz que sigue al puntero sobre una card. */
function spotlight(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--sx', `${e.clientX - r.left}px`);
  el.style.setProperty('--sy', `${e.clientY - r.top}px`);
}

/** Lleva a una sección y le pasa el foco a su título, así el teclado sigue desde ahí. */
function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const behavior: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  if (id === 'inicio') window.scrollTo({ top: 0, behavior });
  else el.scrollIntoView({ behavior, block: 'start' });
  const heading = el.querySelector<HTMLElement>('h1, h2');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

// ─────────────────────────────── navegación ───────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // La sección que ocupa el centro de la pantalla marca el link activo.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    const hero = document.getElementById('inicio');
    if (hero) io.observe(hero);
    return () => io.disconnect();
  }, []);

  useLayoutEffect(() => {
    const btn = active ? linksRef.current?.querySelector<HTMLElement>(`[data-id="${active}"]`) : null;
    setPill(btn ? { x: btn.offsetLeft, w: btn.offsetWidth } : null);
  }, [active]);

  return (
    <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}`}>
      <div className="lp-nav-inner">
        <button type="button" className="lp-nav-brand" onClick={() => scrollToSection('inicio')} aria-label="daily, volver al inicio">
          <Brand />
        </button>
        <nav className="lp-nav-links" ref={linksRef} aria-label="Secciones">
          {pill && <span className="lp-nav-pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} aria-hidden />}
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" data-id={s.id} className={active === s.id ? 'is-active' : ''} aria-current={active === s.id ? 'true' : undefined} onClick={() => scrollToSection(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="lp-nav-actions">
          <button type="button" className="lp-link" onClick={() => navigate('ingresar')}>
            Ingresar
          </button>
          <button type="button" className="lp-btn lp-btn-primary lp-btn-sm" onClick={() => navigate('demo/terapeuta')}>
            {/* En el celular el nombre corto deja lugar a "Ingresar". */}
            <span className="lp-btn-inner">
              <span className="lp-nav-demo-full">Probar la demo</span>
              <span className="lp-nav-demo-short">Demo</span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

// ─────────────────────────────── hero ───────────────────────────────

function Hero() {
  return (
    <section className="lp-hero" id="inicio" aria-labelledby="lp-hero-title">
      <div className="lp-hero-bg" aria-hidden>
        <span className="lp-hero-glow" />
        <span className="lp-hero-rings" />
      </div>
      <div className="lp-wrap lp-hero-copy">
        <Reveal eager i={0}>
          <span className="lp-eyebrow">
            <span className="lp-pulse" aria-hidden />
            Registro diario de actividades para terapia
          </span>
        </Reveal>
        <Reveal eager i={1}>
          <h1 id="lp-hero-title" className="lp-h1">
            Llegá a cada sesión sabiendo cómo fue <span className="lp-ink">la semana de tu paciente.</span>
          </h1>
        </Reveal>
        <Reveal eager i={2}>
          <p className="lp-lead">
            Tu paciente registra cada día qué hizo, cuánto lo disfrutó y cuánto control sintió. Vos lo ves en un informe
            semanal, listo para la sesión.
          </p>
        </Reveal>
        <Reveal eager i={3} className="lp-hero-ctas">
          <CtaButton onClick={() => navigate('crear-cuenta')} icon={<UserPlus aria-hidden />}>
            Crear cuenta de terapeuta
          </CtaButton>
          <CtaButton variant="ghost" onClick={() => navigate('demo/terapeuta')} icon={<Play aria-hidden />}>
            Ver la demo
          </CtaButton>
        </Reveal>
        <Reveal eager i={4}>
          <ul className="lp-trust">
            <li>
              <Smartphone aria-hidden /> Sin instalar nada
            </li>
            <li>
              <Check aria-hidden /> Gratis
            </li>
            <li>
              <Lock aria-hidden /> Registros privados: los ven tu paciente y vos
            </li>
          </ul>
        </Reveal>
      </div>
      <HeroVideo />
    </section>
  );
}

// El video del producto: arranca solo (sin sonido) mientras se ve y se pausa al salir de
// pantalla o al cambiar de pestaña. Con "reducir movimiento" o ahorro de datos no arranca
// solo: queda el póster con un botón grande. Siempre hay botones para pausar y para el sonido.

/** 'auto': se reproduce mientras se ve. 'play' / 'pause': lo eligió quien mira. */
type VideoIntent = 'auto' | 'play' | 'pause';

const saveData = () =>
  typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

/** El capítulo que corresponde al segundo `t` (el último que ya empezó). */
function chapterAt(t: number): number {
  let i = 0;
  VIDEO_CHAPTERS.forEach((c, j) => {
    if (t >= c.t) i = j;
  });
  return i;
}

function HeroVideo() {
  const reduced = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const chapterRef = useRef(0);
  const [intent, setIntent] = useState<VideoIntent>(() => (reduced || saveData() ? 'pause' : 'auto'));
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(true);
  const [duration, setDuration] = useState(0);
  const [chapter, setChapter] = useState(0);
  const [failed, setFailed] = useState(false);

  // Si "reducir movimiento" se activa con la página abierta, deja de arrancar solo.
  useEffect(() => {
    if (reduced) setIntent((v) => (v === 'auto' ? 'pause' : v));
  }, [reduced]);

  const wantsPlay = intent === 'play' || (intent === 'auto' && !reduced);
  const shouldPlay = wantsPlay && inView && pageVisible && !failed;

  // Se reproduce solo mientras se ve (al menos un cuarto) y la pestaña está a la vista.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.25), {
      threshold: [0, 0.25, 0.5],
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!shouldPlay) {
      if (!video.paused) video.pause();
      return;
    }
    video.play().catch((err: unknown) => {
      // El navegador no lo deja arrancar (ahorro de batería, por ejemplo): queda el póster con el botón.
      if (err instanceof DOMException && err.name === 'NotAllowedError') setIntent('pause');
    });
  }, [shouldPlay]);

  // Mientras está en pausa por elección, el resto del hero también se queda quieto.
  useEffect(() => {
    stageRef.current?.closest('.lp-hero')?.classList.toggle('is-still', !wantsPlay);
  }, [wantsPlay]);

  // El capítulo activo y su barra de avance salen del tiempo del video.
  const paint = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const d = Number.isFinite(video.duration) ? video.duration : 0;
    const i = chapterAt(video.currentTime);
    if (i !== chapterRef.current) {
      chapterRef.current = i;
      setChapter(i);
    }
    const from = VIDEO_CHAPTERS[i].t;
    const to = Math.min(VIDEO_CHAPTERS[i + 1]?.t ?? d, d || Infinity);
    const k = to > from ? clamp01((video.currentTime - from) / (to - from)) : 0;
    chipRefs.current.forEach((chip, j) => chip?.style.setProperty('--p', j === i ? k.toFixed(4) : '0'));
  }, []);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const step = () => {
      paint();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, paint]);

  // Al entrar, el marco viene apenas inclinado hacia atrás y se endereza con el primer
  // 40 % de pantalla de scroll.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (reduced) {
      stage.style.removeProperty('--k');
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      stage.style.setProperty('--k', clamp01(window.scrollY / (window.innerHeight * 0.4)).toFixed(3));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  // Las tarjetas flotantes siguen apenas al mouse (paralaje).
  useEffect(() => {
    const stage = stageRef.current;
    const hero = stage?.closest<HTMLElement>('.lp-hero');
    if (!stage || !hero || reduced) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      const r = stage.getBoundingClientRect();
      const px = Math.max(-1, Math.min(1, (x - (r.left + r.width / 2)) / (r.width / 2)));
      const py = Math.max(-1, Math.min(1, (y - (r.top + r.height / 2)) / (r.height / 2)));
      stage.style.setProperty('--px', px.toFixed(3));
      stage.style.setProperty('--py', py.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      stage.style.setProperty('--px', '0');
      stage.style.setProperty('--py', '0');
    };
    hero.addEventListener('pointermove', onMove);
    hero.addEventListener('pointerleave', onLeave);
    return () => {
      hero.removeEventListener('pointermove', onMove);
      hero.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const togglePlay = () => setIntent(wantsPlay ? 'pause' : 'play');
  const toggleSound = () => {
    // Quien pide sonido quiere ver el video: si estaba en pausa, arranca.
    if (muted && !wantsPlay) setIntent('play');
    setMuted((m) => !m);
  };
  const seek = (i: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = VIDEO_CHAPTERS[i].t;
    setIntent('play');
    paint();
  };

  const showPoster = !failed && !started && !wantsPlay;

  return (
    <div className="lp-stage" ref={stageRef}>
      <div className="lp-stage-main" ref={mainRef}>
        <div className="lp-frame-wrap">
          <div className="lp-frame">
            <div className={`lp-screen${showPoster ? ' is-idle' : ''}`}>
              <video
                ref={videoRef}
                className="lp-video"
                src={VIDEO_SRC}
                poster={VIDEO_POSTER}
                muted
                playsInline
                loop
                preload="metadata"
                aria-label="Video de daily: del registro del paciente al informe del terapeuta"
                aria-describedby="lp-video-desc"
                onClick={failed ? undefined : togglePlay}
                onPlaying={() => {
                  setPlaying(true);
                  setStarted(true);
                }}
                onPause={() => setPlaying(false)}
                onLoadedMetadata={(e) => {
                  setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0);
                  paint();
                }}
                onSeeked={paint}
                onError={() => setFailed(true)}
              />
              {showPoster && (
                <button type="button" className="lp-vplay" onClick={() => setIntent('play')}>
                  <span className="lp-vplay-icon">
                    <Play aria-hidden />
                  </span>
                  Ver el video
                </button>
              )}
              {!failed && (
                <div className="lp-vctrl">
                  <button type="button" className="lp-vbtn" onClick={togglePlay} aria-label={wantsPlay ? 'Pausar el video' : 'Reproducir el video'} title={wantsPlay ? 'Pausar' : 'Reproducir'}>
                    {wantsPlay ? <Pause aria-hidden /> : <Play aria-hidden />}
                  </button>
                  <button type="button" className="lp-vbtn" onClick={toggleSound} aria-label="Sonido del video" aria-pressed={!muted} title={muted ? 'Activar el sonido' : 'Silenciar'}>
                    {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="lp-float is-left" aria-hidden>
            <div className="lp-float-in">
              <span className="lp-float-entry">
                <CategoryAvatar id="movimiento" />
                <span>
                  <b>Caminata por el parque</b>
                  <small>18:30 · Actividad física</small>
                </span>
              </span>
              <Scores pleasure={9} control={8} />
            </div>
          </div>
          <div className="lp-float is-right" aria-hidden>
            <div className="lp-float-in">
              <small>Constancia</small>
              <span className="lp-float-cons">
                <b>86%</b>
                <span>6 de 7 días</span>
              </span>
              <span className="lp-segs">
                {WEEK.map(([d, p]) => (
                  <i key={d} className={p == null ? 'is-off' : ''} />
                ))}
              </span>
            </div>
          </div>
        </div>
        {!failed && (
          <div className="lp-chapters" role="group" aria-label="Capítulos del video">
            {VIDEO_CHAPTERS.map((c, i) => (
              <button
                key={c.label}
                type="button"
                ref={(el) => {
                  chipRefs.current[i] = el;
                }}
                className={`lp-chapter${i === chapter ? ' is-active' : ''}`}
                aria-current={i === chapter ? 'true' : undefined}
                disabled={duration > 0 && c.t >= duration}
                onClick={() => seek(i)}
              >
                <span className="lp-chapter-fill" aria-hidden />
                <span className="lp-chapter-label">{c.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="sr-only" id="lp-video-desc">
        El video muestra daily en uso: una paciente carga una actividad con horario, categoría y puntajes de placer y
        control; repasa su semana; cuenta un día a la IA, que lo ordena para que lo revise antes de guardar; su terapeuta
        abre el informe semanal con promedios, constancia y un gráfico por día; y crea un link para invitar a un paciente.
        No tiene narración.
      </p>
    </div>
  );
}

// La semana de ejemplo (placer y control promedio por día; null = sin registros).
const WEEK: [string, number | null, number | null][] = [
  ['Lun', 5.3, 6.4],
  ['Mar', null, null],
  ['Mié', 4.7, 5.3],
  ['Jue', 5.9, 6],
  ['Vie', 3.3, 5.3],
  ['Sáb', 7.3, 6.3],
  ['Dom', 6.8, 6.5],
];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const fmt1 = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ─────────────────────────────── base clínica ───────────────────────────────

function Basis() {
  return (
    <section className="lp-basis" aria-label="En qué se basa">
      <Reveal className="lp-wrap lp-basis-inner">
        <span className="lp-basis-dots" aria-hidden>
          <i style={{ background: 'var(--pleasure)' }} />
          <i style={{ background: 'var(--control)' }} />
        </span>
        <p>
          Basado en el <b>registro de actividades con placer y dominio</b> que se usa en terapia cognitivo-conductual y
          activación conductual: qué hizo, cuánto lo disfrutó y cuánto control sintió.
        </p>
      </Reveal>
    </section>
  );
}

// ─────────────────────────────── cómo funciona ───────────────────────────────

function SectionHead({ kicker, title, sub }: { kicker: string; title: ReactNode; sub?: string }) {
  return (
    <div className="lp-head">
      <Reveal i={0}>
        <span className="lp-kicker">{kicker}</span>
      </Reveal>
      <Reveal i={1}>
        <h2 className="lp-h2">{title}</h2>
      </Reveal>
      {sub && (
        <Reveal i={2}>
          <p className="lp-sub">{sub}</p>
        </Reveal>
      )}
    </div>
  );
}

function HowItWorks() {
  const [lineRef, lineIn] = useInView<HTMLOListElement>(true, '0px 0px -25% 0px');
  return (
    <section className="lp-section" id="como-funciona" aria-labelledby="lp-how-title">
      <div className="lp-wrap">
        <SectionHead kicker="Cómo funciona" title={<span id="lp-how-title">Tres pasos, ninguna planilla.</span>} />
        <ol className={`lp-steps${lineIn ? ' is-in' : ''}`} ref={lineRef}>
          <Reveal as="li" i={0} className="lp-step">
            <span className="lp-step-n">1</span>
            <InviteArt />
            <h3>Invitás a tu paciente</h3>
            <p>Creás un link de invitación y se lo mandás por WhatsApp o email. Su cuenta queda vinculada a la tuya.</p>
          </Reveal>
          <Reveal as="li" i={1} className="lp-step">
            <span className="lp-step-n">2</span>
            <EntryArt />
            <h3>Tu paciente registra su día</h3>
            <p>
              Carga cada actividad con horario, qué hizo, categoría y puntajes de placer y control, y cómo se sintió en el día.
              Si prefiere, se lo cuenta a la IA y revisa antes de guardar.
            </p>
          </Reveal>
          <Reveal as="li" i={2} className="lp-step">
            <span className="lp-step-n">3</span>
            <BarsArt />
            <h3>Vos lo ves en el informe</h3>
            <p>Promedios de placer y control, constancia y un gráfico por día. Lo abrís en la sesión o lo imprimís.</p>
          </Reveal>
        </ol>
      </div>
    </section>
  );
}

function InviteArt() {
  const [ref, inView] = useInView<HTMLDivElement>(true, '0px 0px -20% 0px');
  return (
    <div className={`lp-art lp-art-invite${inView ? ' is-in' : ''}`} ref={ref} aria-hidden>
      <span className="lp-invite-link">
        <Link2 />
        <span>invitacion/K7Q2</span>
      </span>
      <span className="lp-invite-copy">
        <span className="a">Copiar</span>
        <span className="b">
          <Check /> Copiado
        </span>
      </span>
    </div>
  );
}

/** Una actividad cargada a mano: aparece y se marca como guardada. */
function EntryArt() {
  const [ref, inView] = useInView<HTMLDivElement>(true, '0px 0px -20% 0px');
  return (
    <div className={`lp-art lp-art-entry${inView ? ' is-in' : ''}`} ref={ref} aria-hidden>
      <span className="lp-entry">
        <span className="lp-entry-row">
          <CategoryAvatar id="movimiento" />
          <span className="lp-entry-text">
            <b>Caminata por el parque</b>
            <small>18:30 · Actividad física</small>
          </span>
          <span className="lp-entry-check">
            <Check />
          </span>
        </span>
        <Scores pleasure={9} control={8} />
      </span>
    </div>
  );
}

function BarsArt() {
  const [ref, inView] = useInView<HTMLDivElement>(true, '0px 0px -20% 0px');
  return (
    <div className={`lp-art lp-art-bars${inView ? ' is-in' : ''}`} ref={ref} aria-hidden>
      {WEEK.map(([d, p, c], i) => (
        <span key={d} className="lp-mini-day" style={{ ['--i' as string]: i } as CSSProperties}>
          <i style={{ ['--h' as string]: `${(p ?? 0.4) * 10}%`, background: p == null ? 'var(--line)' : 'var(--pleasure)' } as CSSProperties} />
          <i style={{ ['--h' as string]: `${(c ?? 0.4) * 10}%`, background: c == null ? 'var(--line)' : 'var(--control)' } as CSSProperties} />
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────── funciones (bento) ───────────────────────────────

function Features() {
  return (
    <section className="lp-section lp-section-alt" id="funciones" aria-labelledby="lp-feat-title">
      <div className="lp-wrap">
        <SectionHead
          kicker="Funciones"
          title={<span id="lp-feat-title">Todo lo que necesitás para seguir la semana.</span>}
          sub="Lo que carga tu paciente cada día y lo que ves vos antes de la sesión."
        />
        <div className="lp-bento">
          <Reveal i={0} className="lp-card lp-card-wide">
            <div onPointerMove={spotlight} className="lp-card-in">
              <RatingCard />
            </div>
          </Reveal>
          <Reveal i={1} className="lp-card">
            <div onPointerMove={spotlight} className="lp-card-in">
              <ReportCard />
            </div>
          </Reveal>
          <Reveal i={2} className="lp-card">
            <div onPointerMove={spotlight} className="lp-card-in">
              <ConsCard />
            </div>
          </Reveal>
          <Reveal i={3} className="lp-card">
            <div onPointerMove={spotlight} className="lp-card-in">
              <SessionCard />
            </div>
          </Reveal>
          <Reveal i={4} className="lp-card">
            <div onPointerMove={spotlight} className="lp-card-in">
              <ChatCard />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const pleasureWord = (v: number) => (v <= 3 ? 'poco' : v <= 6 ? 'algo' : v <= 8 ? 'bastante' : 'muchísimo');
const controlWord = (v: number) => (v <= 3 ? 'poco control' : v <= 6 ? 'un control intermedio' : v <= 8 ? 'bastante control' : 'mucho control');

function RatingCard() {
  const [pleasure, setPleasure] = useState<Rating | undefined>(7);
  const [control, setControl] = useState<Rating | undefined>(5);
  return (
    <>
      <div className="lp-card-copy">
        <span className="lp-card-icon">
          <ChartColumn aria-hidden />
        </span>
        <h3>Placer y control, del 1 al 10</h3>
        <p>
          Tu paciente carga cada actividad con horario, categoría y estos dos puntajes, y puede sumar notas y cómo se
          sintió en el día. Probalo: tocá la escala.
        </p>
      </div>
      <div className="lp-rating-demo">
        <RatingScale scale="pleasure" value={pleasure} onChange={setPleasure} />
        <RatingScale scale="control" value={control} onChange={setControl} />
        <p className="lp-rating-read" aria-live="polite">
          {pleasure || control ? (
            <>
              {pleasure ? <>Lo disfrutó <b>{pleasureWord(pleasure)}</b></> : 'Sin placer marcado'}
              {control ? <> y sintió <b>{controlWord(control)}</b>.</> : '.'}
            </>
          ) : (
            'Elegí un puntaje.'
          )}
        </p>
      </div>
    </>
  );
}

const CHAT_TEXT = 'Dormí mal y me levanté tarde, tipo 11. A la tarde salí a caminar y me ayudó un poco.';

// Escribe el ejemplo una sola vez al verse por primera vez, y queda quieto.
function ChatCard() {
  const reduced = useReducedMotion();
  const [ref, visible] = useInView<HTMLDivElement>(false, '0px');
  const [n, setN] = useState(reduced ? CHAT_TEXT.length : 0);
  const done = reduced || n >= CHAT_TEXT.length;
  useEffect(() => {
    if (done || !visible) return;
    const id = window.setInterval(() => setN((v) => Math.min(v + 1, CHAT_TEXT.length)), 42);
    return () => window.clearInterval(id);
  }, [done, visible]);
  return (
    <div ref={ref} className="lp-fill">
      <div className="lp-card-copy">
        <span className="lp-card-icon is-green">
          <Mic aria-hidden />
        </span>
        <h3>Si prefiere, se lo cuenta a la IA</h3>
        <p>Escrito o dictado, como le salga. La IA lo ordena en actividades y tu paciente revisa antes de guardar. Es opcional.</p>
      </div>
      <div className="lp-mini-chat" aria-hidden>
        <span className="lp-mini-mic">
          <Mic />
        </span>
        <span className="lp-mini-text">
          {done ? CHAT_TEXT : CHAT_TEXT.slice(0, n)}
          {!done && <i className="lp-caret" />}
        </span>
      </div>
    </div>
  );
}

function ReportCard() {
  const [ref, inView] = useInView<HTMLDivElement>(true, '0px 0px -15% 0px');
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div ref={ref} className="lp-fill">
      <div className="lp-card-copy">
        <span className="lp-card-icon is-blue">
          <ChartColumn aria-hidden />
        </span>
        <h3>Informe semanal</h3>
        <p>Placer y control por día, para ver de un vistazo cómo vino la semana.</p>
      </div>
      <div className={`lp-chart${inView ? ' is-in' : ''}`} onPointerLeave={() => setHover(null)}>
        {WEEK.map(([d, p, c], i) => (
          <button
            key={d}
            type="button"
            className={`lp-chart-day${hover === i ? ' is-hover' : ''}`}
            style={{ ['--i' as string]: i } as CSSProperties}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            aria-label={p == null ? `${d}: sin registros` : `${d}: placer ${fmt1(p)}, control ${fmt1(c ?? 0)}`}
          >
            <span className="lp-chart-bars">
              {p == null ? (
                <span className="lp-rep-empty" />
              ) : (
                <>
                  <i style={{ ['--h' as string]: `${p * 10}%`, background: 'var(--pleasure)' } as CSSProperties} />
                  <i style={{ ['--h' as string]: `${(c ?? 0) * 10}%`, background: 'var(--control)' } as CSSProperties} />
                </>
              )}
              {hover === i && p != null && (
                <span className="lp-tip">
                  {fmt1(p)} · {fmt1(c ?? 0)}
                </span>
              )}
            </span>
            <small>{d}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function ConsCard() {
  const [ref, inView] = useInView<HTMLDivElement>(true, '0px 0px -15% 0px');
  const value = useCountUp(86, inView, 1300);
  return (
    <div ref={ref} className="lp-fill">
      <div className="lp-card-copy">
        <span className="lp-card-icon is-blue">
          <Check aria-hidden />
        </span>
        <h3>Constancia</h3>
        <p>Cuántos días de la semana registró, para hablarlo sin adivinar.</p>
      </div>
      <div className={`lp-cons${inView ? ' is-in' : ''}`}>
        <b>{value}%</b>
        <span className="lp-cons-pill">6 de 7 días</span>
        <div className="lp-segs is-big">
          {WEEK.map(([d, p], i) => (
            <span key={d}>
              <i className={p == null ? 'is-off' : ''} style={{ ['--i' as string]: i } as CSSProperties} />
              <small>{d}</small>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SessionCard() {
  const [open, setOpen] = useState(false);
  return (
    <div className="lp-fill">
      <div className="lp-card-copy">
        <span className="lp-card-icon">
          <NotebookPen aria-hidden />
        </span>
        <h3>Listo para la sesión</h3>
        <p>Imprimí el informe o guardalo en PDF, y anotá lo que quieras trabajar: tus notas no se imprimen.</p>
      </div>
      <div className="lp-session">
        <span className="lp-chip-btn">
          <Printer aria-hidden /> Imprimir / PDF
        </span>
        <button type="button" className={`lp-note${open ? ' is-open' : ''}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="lp-note-head">
            <NotebookPen aria-hidden /> Notas de sesión <Lock className="lp-note-lock" aria-hidden />
            <ChevronDown className="lp-note-chev" aria-hidden />
          </span>
          <span className="lp-note-body">
            <span>
              Preguntar por la caminata del miércoles: subió el ánimo. <em>Solo las ves vos.</em>
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────── las dos vistas ───────────────────────────────

const VIEWS = {
  therapist: {
    label: 'Para vos',
    title: 'Sabés cómo vino la semana antes de empezar.',
    points: [
      'Un informe semanal por paciente: promedios, constancia y gráfico por día.',
      'Todas las semanas a mano para comparar.',
      'Varios pacientes, cada uno con su historial.',
      'Notas de sesión privadas que no se imprimen.',
    ],
  },
  patient: {
    label: 'Para tus pacientes',
    title: 'Registrar el día se vuelve simple.',
    points: [
      'Cargan cada actividad con horario, qué hicieron, categoría y puntajes.',
      'Suman notas y cómo se sintieron en el día.',
      'Si prefieren, se lo cuentan a la IA, escrito o dictado, y revisan antes de guardar.',
      'Funciona en el celular, sin instalar nada.',
    ],
  },
} as const;

function TwoViews() {
  const [view, setView] = useState<'therapist' | 'patient'>('therapist');
  const tabsRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const btn = tabsRef.current?.querySelector<HTMLElement>(`button[data-view="${view}"]`);
    if (btn) setThumb({ x: btn.offsetLeft, w: btn.offsetWidth });
  }, [view]);
  const data = VIEWS[view];
  return (
    <section className="lp-section" aria-labelledby="lp-views-title">
      <div className="lp-wrap lp-views">
        <div>
          <SectionHead kicker="Dos vistas" title={<span id="lp-views-title">Una herramienta, dos lados de la terapia.</span>} />
          <Reveal i={2}>
            {/* Botones de un grupo (como el selector de la app), no pestañas. */}
            <div className="lp-switch" ref={tabsRef} role="group" aria-label="Elegí una vista">
              <span className="lp-switch-thumb" data-view={view} style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }} aria-hidden />
              {(['therapist', 'patient'] as const).map((v) => (
                <button key={v} type="button" data-view={v} aria-pressed={view === v} aria-controls="lp-views-panel" onClick={() => setView(v)}>
                  {VIEWS[v].label}
                </button>
              ))}
            </div>
          </Reveal>
        </div>
        <Reveal i={3}>
          <div className={`lp-views-panel is-${view}`} id="lp-views-panel" key={view}>
            <span className="lp-views-icon">{view === 'therapist' ? <Users aria-hidden /> : <Smartphone aria-hidden />}</span>
            <h3>{data.title}</h3>
            <ul>
              {data.points.map((p, i) => (
                <li key={p} style={{ ['--i' as string]: i } as CSSProperties}>
                  <Check aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
            <button type="button" className="lp-link lp-link-arrow" onClick={() => navigate(view === 'therapist' ? 'demo/terapeuta' : 'demo/paciente')}>
              Ver la demo {view === 'therapist' ? 'del terapeuta' : 'del paciente'} <ArrowRight aria-hidden />
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ─────────────────────────────── privacidad ───────────────────────────────

function Privacy() {
  const points = [
    [
      'Entre los usuarios de daily, los registros guardados los ven solo tu paciente y vos.',
      'Las reglas de acceso están en la base de datos, no solo en la pantalla. Los proveedores que alojan el servicio y su responsable tienen acceso técnico solo para operarlo.',
    ],
    ['Tu paciente decide sobre sus datos.', 'Puede descargar sus registros o borrar su cuenta cuando quiera.'],
    [
      'Cualquiera de los dos puede terminar el vínculo.',
      'Si vos o tu paciente lo terminan, o tu paciente borra su cuenta, dejás de ver sus registros y se borran tus notas sobre esa persona. Si tu paciente se cambia a otro terapeuta, dejás de ver sus registros y tus notas, pero las notas quedan guardadas sin que nadie las vea.',
    ],
    [
      'La IA es opcional y solo ordena el texto.',
      'No da consejos clínicos ni diagnósticos, y nada queda en los registros sin que tu paciente lo revise.',
    ],
    [
      'Qué pasa por servicios externos.',
      `Si tu paciente usa el chat, el texto pasa por nuestro servidor (Vercel, EE. UU.) y se envía a Groq (EE. UU.) para ordenarlo; Groq ${groqRetentionShort()}. El dictado usa el reconocimiento de voz del navegador (en Chrome, el de Google). Si carga todo a mano, no pasa por ninguno de los dos.`,
    ],
  ];
  return (
    <section className="lp-section lp-section-dark" id="privacidad" aria-labelledby="lp-priv-title">
      <div className="lp-wrap lp-privacy">
        <div>
          <SectionHead kicker="Privacidad" title={<span id="lp-priv-title">Datos sensibles, tratados como tales.</span>} />
          <ul className="lp-priv-list">
            {points.map(([title, text], i) => (
              <Reveal as="li" key={title} i={i + 2}>
                <ShieldCheck aria-hidden />
                <span>
                  <b>{title}</b> {text}
                </span>
              </Reveal>
            ))}
          </ul>
          <Reveal i={points.length + 2} className="lp-priv-more">
            <LegalLink page="privacidad" className="lp-link lp-link-arrow">
              Leé la política de privacidad completa <ArrowRight aria-hidden />
            </LegalLink>
          </Reveal>
        </div>
        <Reveal i={2} className="lp-priv-art">
          <AccessArt />
        </Reveal>
      </div>
    </section>
  );
}

function AccessArt() {
  return (
    <div className="lp-access" aria-hidden>
      <span className="lp-access-node is-patient">
        <b>MR</b>
        <small>Paciente</small>
      </span>
      <span className="lp-access-line">
        <i />
        <span className="lp-access-lock">
          <Lock />
        </span>
      </span>
      <span className="lp-access-node is-therapist">
        <b>JR</b>
        <small>Terapeuta</small>
      </span>
      <span className="lp-access-out">
        <span className="lp-access-node is-other">
          <b>?</b>
          <small>Otros usuarios</small>
        </span>
      </span>
    </div>
  );
}

// ─────────────────────────────── preguntas ───────────────────────────────

// La primera pregunta abre sola: cómo carga su día el paciente (lo central de daily).
const FAQS: [string, ReactNode][] = [
  [
    '¿Cómo carga su día mi paciente?',
    'Desde el celular o la compu, suma cada actividad con horario, qué hizo, categoría y puntajes de placer y control del 1 al 10. También puede anotar comentarios y cómo se sintió en el día. Si prefiere, se lo cuenta a la IA, escrito o dictado, y revisa antes de guardar.',
  ],
  ['¿Cuánto cuesta?', 'Por ahora es gratis, para vos y para tus pacientes.'],
  ['¿Mis pacientes tienen que instalar algo?', 'No. daily funciona en el navegador, en el celular o en la compu. Entran con el link de invitación que les mandás.'],
  [
    '¿Qué hace la IA? ¿Es obligatoria?',
    <>
      Es opcional. Si tu paciente prefiere contar su día con sus palabras, la IA lo ordena en actividades con horario,
      categoría y, si los dijo, puntajes de placer y control. No da consejos clínicos ni diagnósticos, y tu paciente revisa
      todo antes de guardarlo. Si la IA no está disponible, el chat sigue en un modo básico que reconoce horarios y
      categorías, y siempre se puede cargar a mano. Qué se envía y a quién:{' '}
      <LegalLink page="privacidad" section="ia">
        política de privacidad
      </LegalLink>
      .
    </>,
  ],
  [
    '¿Quién puede ver los registros?',
    <>
      Entre los usuarios de daily, los registros guardados los ven solo tu paciente y vos; los proveedores que alojan el
      servicio y su responsable tienen acceso técnico solo para operarlo. El texto del chat pasa por el proveedor de IA
      para ordenarse, sin quedar guardado en daily. Si vos o tu paciente terminan el vínculo, dejás de ver sus registros y
      se borran tus notas de sesión. Si tu paciente se cambia a otro terapeuta, dejás de ver todo, pero tus notas quedan
      guardadas sin que nadie las vea. Más detalles en la{' '}
      <LegalLink page="privacidad" section="acceso">
        política de privacidad
      </LegalLink>
      .
    </>,
  ],
  [
    '¿Me avisa si mi paciente escribe algo de riesgo?',
    'No. daily no es un canal de urgencias ni se revisa en tiempo real: ves lo que tu paciente guarda cuando abrís su informe. Acordá con cada paciente cómo contactarte, o a quién recurrir, si lo necesita.',
  ],
  ['¿Puedo tener varios pacientes?', 'Sí. Cada paciente tiene su informe semanal y su historial de semanas.'],
  [
    '¿Lo puedo probar sin crear una cuenta?',
    'Sí. La demo te muestra la vista del paciente y la del terapeuta con datos de ejemplo, sin registrarte. Sin cuenta, el chat de la demo usa el modo básico, sin IA.',
  ],
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="lp-section" id="preguntas" aria-labelledby="lp-faq-title">
      <div className="lp-wrap lp-faq">
        <SectionHead kicker="Preguntas" title={<span id="lp-faq-title">Lo que suelen preguntar.</span>} />
        <div className="lp-faq-list">
          {FAQS.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <Reveal key={q} i={i} className={`lp-faq-item${isOpen ? ' is-open' : ''}`}>
                <h3>
                  <button type="button" aria-expanded={isOpen} aria-controls={`lp-faq-${i}`} id={`lp-faq-q-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                    {q}
                    <span className="lp-faq-icon" aria-hidden />
                  </button>
                </h3>
                <div className="lp-faq-a" id={`lp-faq-${i}`} role="region" aria-labelledby={`lp-faq-q-${i}`}>
                  <div>
                    <p>{a}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────── cierre ───────────────────────────────

function FinalCta() {
  return (
    <section className="lp-final" aria-labelledby="lp-final-title">
      <Reveal className="lp-wrap">
        <div className="lp-final-card" onPointerMove={spotlight}>
          <span className="lp-final-orbit" aria-hidden />
          <span className="lp-final-orbit is-2" aria-hidden />
          <h2 id="lp-final-title">Empezá con tu próximo paciente.</h2>
          <p>Creás tu cuenta gratis, invitás a tu paciente y la semana que viene ya tenés su informe.</p>
          <div className="lp-final-ctas">
            <CtaButton variant="light" onClick={() => navigate('crear-cuenta')}>
              Crear cuenta de terapeuta
            </CtaButton>
            <button type="button" className="lp-link lp-link-light" onClick={() => navigate('demo/terapeuta')}>
              O probá la demo sin registrarte
            </button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-wrap lp-footer-inner">
        <Brand />
        <nav aria-label="Enlaces">
          <button type="button" className="lp-link" onClick={() => navigate('ingresar')}>
            Ingresar
          </button>
          <button type="button" className="lp-link" onClick={() => navigate('crear-cuenta')}>
            Crear cuenta
          </button>
          <button type="button" className="lp-link" onClick={() => navigate('demo/paciente')}>
            Demo
          </button>
          <button type="button" className="lp-link" onClick={() => navigate('bienvenida')}>
            Presentación
          </button>
          <LegalLink page="privacidad" className="lp-link">
            Privacidad
          </LegalLink>
          <LegalLink page="terminos" className="lp-link">
            Términos
          </LegalLink>
          <a className="lp-link" href={`mailto:${LEGAL_EMAIL}`}>
            Contacto
          </a>
        </nav>
        <small>© 2026 daily · Registro diario de actividades para terapia</small>
      </div>
    </footer>
  );
}
