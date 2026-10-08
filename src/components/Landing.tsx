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
  Play,
  Printer,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import type { Rating } from '../types';
import { navigate } from '../lib/route';
import { Brand, CategoryAvatar, RatingScale, Scores } from './common';
import '../landing.css';

// La landing pública: lo primero que ve quien entra sin sesión. Le habla al
// terapeuta (quien elige daily) y muestra el producto real con microinteracciones.
// Todo lo que se mueve respeta "reducir movimiento".

const SECTIONS = [
  { id: 'como-funciona', label: 'Cómo funciona' },
  { id: 'funciones', label: 'Funciones' },
  { id: 'privacidad', label: 'Privacidad' },
  { id: 'preguntas', label: 'Preguntas' },
] as const;

export function Landing() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'daily · Registro diario con IA para terapeutas y pacientes';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="lp">
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

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
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
        <button type="button" className="lp-nav-brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="daily, volver al inicio">
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
            <span className="lp-btn-inner">Probar la demo</span>
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
      <div className="lp-hero-glow" aria-hidden />
      <div className="lp-wrap lp-hero-grid">
        <div className="lp-hero-copy">
          <Reveal eager i={0}>
            <span className="lp-eyebrow">
              <span className="lp-pulse" aria-hidden />
              Registro diario con IA para terapia
            </span>
          </Reveal>
          <Reveal eager i={1}>
            <h1 id="lp-hero-title" className="lp-h1">
              Llegá a cada sesión sabiendo <span className="lp-ink">cómo fue su semana.</span>
            </h1>
          </Reveal>
          <Reveal eager i={2}>
            <p className="lp-lead">
              Tus pacientes cuentan su día con sus palabras. daily lo ordena en actividades con placer y control, y vos lo
              ves en un informe semanal listo para la sesión.
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
                <Mic aria-hidden /> Escrito o dictado
              </li>
              <li>
                <Lock aria-hidden /> Solo vos y tu paciente lo ven
              </li>
            </ul>
          </Reveal>
        </div>
        <Reveal eager i={2} className="lp-hero-art">
          <HeroPreview />
        </Reveal>
      </div>
    </section>
  );
}

// El producto en vivo: una vuelta de 10 s que es función del tiempo (como un video),
// con pestañas que saltan a cada vista y pausa al pasar el mouse.
const LOOP = 10;
const SWITCH = 5.6;
const SENTENCE = 'A las 18:30 salí a caminar por el parque. Placer\u00a09, control\u00a08.';
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
const easeOut = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);
const fmt1 = (v: number) => v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function HeroPreview() {
  const reduced = useReducedMotion();
  const [stageRef, visible] = useInView<HTMLDivElement>(false, '0px');
  const [t, setT] = useState(reduced ? 4.9 : 0);
  const [paused, setPaused] = useState(false);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced || paused || !visible) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setT((v) => (v + dt) % LOOP);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [reduced, paused, visible]);

  const view = t < SWITCH ? 'patient' : 'therapist';
  const go = (v: 'patient' | 'therapist') => setT(v === 'patient' ? (reduced ? 4.9 : 0) : reduced ? 9.4 : SWITCH);

  function onTilt(e: ReactPointerEvent<HTMLDivElement>) {
    const el = tiltRef.current;
    if (!el || reduced || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-py * 5).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(px * 6).toFixed(2)}deg`);
    spotlight(e);
  }
  function endTilt() {
    tiltRef.current?.style.setProperty('--rx', '0deg');
    tiltRef.current?.style.setProperty('--ry', '0deg');
  }

  const tabsRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const btn = tabsRef.current?.querySelector<HTMLElement>(`button[data-view="${view}"]`);
    if (btn) setThumb({ x: btn.offsetLeft, w: btn.offsetWidth });
  }, [view]);

  return (
    <div
      className="lp-preview"
      ref={stageRef}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => {
        setPaused(false);
        endTilt();
      }}
      onPointerMove={onTilt}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="lp-preview-tabs" ref={tabsRef} role="tablist" aria-label="Vista del ejemplo">
        <span className="lp-preview-thumb" style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }} aria-hidden />
        <button type="button" role="tab" data-view="patient" aria-selected={view === 'patient'} onClick={() => go('patient')}>
          Paciente
        </button>
        <button type="button" role="tab" data-view="therapist" aria-selected={view === 'therapist'} onClick={() => go('therapist')}>
          Terapeuta
        </button>
      </div>
      <div className="lp-device" ref={tiltRef}>
        <div className="lp-device-bar" aria-hidden>
          <i />
          <i />
          <i />
          <span>daily-nine-ruddy.vercel.app</span>
        </div>
        <div className="lp-device-screen" aria-hidden>
          {view === 'patient' ? <PatientScene t={t} /> : <TherapistScene t={t - SWITCH} />}
        </div>
        <span className={`lp-preview-state${paused && !reduced ? ' is-on' : ''}`} aria-hidden>
          Pausado
        </span>
        <div className="lp-progress" aria-hidden>
          <i style={{ transform: `scaleX(${(t / LOOP).toFixed(4)})` }} />
        </div>
      </div>
      <p className="sr-only">
        Ejemplo: la paciente escribe "{SENTENCE}" La IA lo ordena en la actividad Caminata por el parque, 18:30, actividad
        física, placer 9 y control 8. En el informe semanal, la terapeuta ve placer 5,3, control 5,9 y constancia 86 %.
      </p>
    </div>
  );
}

function PatientScene({ t }: { t: number }) {
  const typed = SENTENCE.slice(0, Math.floor(clamp01((t - 0.3) / 1.75) * SENTENCE.length));
  const sent = t >= 2.25;
  const thinking = t >= 2.6 && t < 3.3;
  const card = easeOut((t - 3.3) / 0.45);
  const saved = t >= 4.55;
  return (
    <div className="lp-scene lp-scene-patient">
      <div className="lp-chat-head">
        <span className="lp-chat-av">
          <Sparkles />
        </span>
        <div>
          <b>Contale tu día</b>
          <small>Lo ordeno en actividades y vos revisás antes de guardar.</small>
        </div>
      </div>
      <div className="lp-chat-body">
        {sent && <div className="lp-bubble is-user lp-pop">{SENTENCE}</div>}
        {thinking && (
          <div className="lp-bubble is-ai lp-pop">
            Ordenando tu día<span className="lp-dots"><i /><i /><i /></span>
          </div>
        )}
        {card > 0 && (
          <div className="lp-proposal" style={{ opacity: card, transform: `translateY(${((1 - card) * 14).toFixed(1)}px) scale(${(0.97 + 0.03 * card).toFixed(3)})` }}>
            <div className="lp-proposal-row">
              <CategoryAvatar id="movimiento" />
              <div className="lp-proposal-text">
                <b>Caminata por el parque</b>
                <small>18:30 · Actividad física</small>
              </div>
              <span className={`lp-check${saved ? ' is-on' : ''}`}>
                <Check />
              </span>
            </div>
            <div className="lp-proposal-foot">
              <Scores pleasure={9} control={8} compact />
              <span className={`lp-add${saved ? ' is-saved' : ''}`}>{saved ? 'Guardado en tu día' : 'Agregar al día'}</span>
            </div>
          </div>
        )}
      </div>
      <div className="lp-composer">
        <span className={typed && !sent ? '' : 'is-ph'}>
          {sent ? '¿Cómo fue tu miércoles?' : typed || '¿Cómo fue tu miércoles?'}
          {!sent && t >= 0.3 && <i className="lp-caret" />}
        </span>
        <span className={`lp-send${t >= 2.15 && t < 2.45 ? ' is-pressed' : ''}`}>
          <ArrowRight />
        </span>
      </div>
    </div>
  );
}

function TherapistScene({ t }: { t: number }) {
  const k = easeOut((t - 0.15) / 1.1);
  return (
    <div className="lp-scene lp-scene-therapist">
      <div className="lp-rep-head">
        <small>Informe semanal</small>
        <b>Martina Ruiz</b>
      </div>
      <div className="lp-rep-stats">
        <div className="lp-rep-hero">
          <span>Placer</span>
          <b>{fmt1(5.3 * k)}</b>
          <span>Control</span>
          <b>{fmt1(5.9 * k)}</b>
        </div>
        <div className="lp-rep-cons">
          <span>Constancia</span>
          <b>{Math.round(86 * k)}%</b>
          <div className="lp-segs">
            {WEEK.map(([d, p], i) => (
              <i key={d} className={p == null ? 'is-off' : ''} style={{ transform: `scaleX(${p == null ? 1 : easeOut((t - 0.3 - i * 0.07) / 0.5).toFixed(3)})` }} />
            ))}
          </div>
        </div>
      </div>
      <div className="lp-rep-chart">
        {WEEK.map(([d, p, c], i) => {
          const g = Math.max(0, easeOut((t - 0.4 - i * 0.09) / 0.6));
          const focus = d === 'Sáb' && t > 2.1 && t < 4.2;
          return (
            <div key={d} className={`lp-rep-day${focus ? ' is-focus' : ''}`}>
              <div className="lp-rep-bars">
                {p == null ? (
                  <span className="lp-rep-empty" />
                ) : (
                  <>
                    <i style={{ height: `${(p * 10 * g).toFixed(1)}%`, background: 'var(--pleasure)' }} />
                    <i style={{ height: `${((c ?? 0) * 10 * g).toFixed(1)}%`, background: 'var(--control)' }} />
                  </>
                )}
                {focus && (
                  <span className="lp-tip">
                    Placer {fmt1(p ?? 0)} · Control {fmt1(c ?? 0)}
                  </span>
                )}
              </div>
              <small>{d}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
            <DictateArt />
            <h3>Tu paciente cuenta su día</h3>
            <p>Lo escribe o lo dicta. La IA lo ordena en actividades con horario y puntajes, y tu paciente revisa antes de guardar.</p>
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
        <span>daily…/invitacion/K7Q2</span>
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

function DictateArt() {
  return (
    <div className="lp-art lp-art-dictate" aria-hidden>
      <span className="lp-mic">
        <i />
        <i />
        <Mic />
      </span>
      <span className="lp-wave">
        {Array.from({ length: 14 }, (_, i) => (
          <i key={i} style={{ ['--i' as string]: i } as CSSProperties} />
        ))}
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
          sub="Lo mismo que usan tus pacientes y vos, sin pasos de más."
        />
        <div className="lp-bento">
          <Reveal i={0} className="lp-card lp-card-wide">
            <div onPointerMove={spotlight} className="lp-card-in">
              <RatingCard />
            </div>
          </Reveal>
          <Reveal i={1} className="lp-card">
            <div onPointerMove={spotlight} className="lp-card-in">
              <ChatCard />
            </div>
          </Reveal>
          <Reveal i={2} className="lp-card">
            <div onPointerMove={spotlight} className="lp-card-in">
              <ReportCard />
            </div>
          </Reveal>
          <Reveal i={3} className="lp-card">
            <div onPointerMove={spotlight} className="lp-card-in">
              <ConsCard />
            </div>
          </Reveal>
          <Reveal i={4} className="lp-card">
            <div onPointerMove={spotlight} className="lp-card-in">
              <SessionCard />
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
        <p>Los dos puntajes de cada actividad. Probalo: tocá la escala.</p>
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

function ChatCard() {
  const reduced = useReducedMotion();
  const [ref, visible] = useInView<HTMLDivElement>(false, '0px');
  const [n, setN] = useState(reduced ? CHAT_TEXT.length : 0);
  useEffect(() => {
    if (reduced || !visible) return;
    const id = window.setInterval(() => setN((v) => (v >= CHAT_TEXT.length + 40 ? 0 : v + 1)), 42);
    return () => window.clearInterval(id);
  }, [reduced, visible]);
  const shown = CHAT_TEXT.slice(0, Math.min(n, CHAT_TEXT.length));
  return (
    <div ref={ref} className="lp-fill">
      <div className="lp-card-copy">
        <span className="lp-card-icon is-green">
          <Mic aria-hidden />
        </span>
        <h3>Contale tu día</h3>
        <p>Escrito o dictado, como le salga. La IA lo ordena y tu paciente revisa antes de guardar.</p>
      </div>
      <div className="lp-mini-chat" aria-hidden>
        <span className="lp-mini-mic">
          <Mic />
        </span>
        <span className="lp-mini-text">
          {shown}
          <i className="lp-caret" />
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
    title: 'Registrar el día deja de ser una tarea.',
    points: [
      'Cuentan su día con sus palabras, escrito o dictado.',
      'La IA lo ordena; ellos revisan y guardan.',
      'También pueden cargar cada actividad a mano.',
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
            <div className="lp-switch" ref={tabsRef} role="tablist" aria-label="Elegí una vista">
              <span className="lp-switch-thumb" data-view={view} style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }} aria-hidden />
              {(['therapist', 'patient'] as const).map((v) => (
                <button key={v} type="button" role="tab" data-view={v} aria-selected={view === v} aria-controls="lp-views-panel" onClick={() => setView(v)}>
                  {VIEWS[v].label}
                </button>
              ))}
            </div>
          </Reveal>
        </div>
        <Reveal i={3}>
          <div className={`lp-views-panel is-${view}`} id="lp-views-panel" role="tabpanel" key={view}>
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
    ['Cada registro lo ven solo tu paciente y vos.', 'Las reglas de acceso están en la base de datos, no solo en la pantalla.'],
    ['Tu paciente decide sobre sus datos.', 'Puede descargar sus registros o borrar su cuenta cuando quiera.'],
    ['Podés desvincular a un paciente.', 'Dejás de ver sus registros y se borran tus notas sobre esa persona.'],
    ['La IA solo ordena el texto.', 'No da consejos ni diagnósticos, y nada se guarda sin que tu paciente lo revise.'],
  ] as const;
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
          <small>Nadie más</small>
        </span>
      </span>
    </div>
  );
}

// ─────────────────────────────── preguntas ───────────────────────────────

const FAQS = [
  ['¿Mis pacientes tienen que instalar algo?', 'No. daily funciona en el navegador, en el celular o en la compu. Entran con el link de invitación que les mandás.'],
  [
    '¿Qué hace exactamente la IA?',
    'Ordena lo que tu paciente cuenta en actividades con horario, categoría y, si los dijo, puntajes de placer y control. No inventa datos ni da consejos clínicos, y tu paciente revisa todo antes de guardarlo.',
  ],
  ['¿Y si mi paciente no quiere usar la IA?', 'Puede cargar cada actividad a mano, con horario, categoría y puntajes.'],
  ['¿Quién puede ver los registros?', 'Solo tu paciente y vos. Si desvinculás a un paciente, dejás de ver sus registros.'],
  ['¿Puedo tener varios pacientes?', 'Sí. Cada paciente tiene su informe semanal y su historial de semanas.'],
  ['¿Lo puedo probar sin crear una cuenta?', 'Sí. La demo te muestra la vista del paciente y la del terapeuta con datos de ejemplo, sin registrarte.'],
] as const;

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
          <p>Creás tu cuenta, invitás a tu paciente y la semana que viene ya tenés su informe.</p>
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
        </nav>
        <small>© 2026 daily · Registro diario de actividades para terapia</small>
      </div>
    </footer>
  );
}
