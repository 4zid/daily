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
import { flushSync } from 'react-dom';
import {
  ArrowRight,
  ChartColumn,
  ChevronLeft,
  NotebookPen,
  Sparkles,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import type { CategoryId } from '../types';
import { CATEGORIES, categoryColorVar } from '../lib/categories';
import { navigate, useHashPath } from '../lib/route';
import { markOnboardingSeen } from '../lib/store';
import { Brand, CategoryAvatar, RoundCheck, Scores } from './common';

// Presentación en pasos para quien llega por primera vez. Las ilustraciones se
// arman con piezas reales de la app y se animan al entrar a cada paso.

type Tint = 'patient' | 'therapist';

interface Step {
  id: string;
  kicker: string;
  title: ReactNode;
  text: string;
  /** Tonos del escenario: abajo a la derecha y arriba a la izquierda. */
  tint: [Tint, Tint];
  Art: () => ReactNode;
}

const STEPS: Step[] = [
  {
    id: 'bienvenida',
    kicker: 'Bienvenida',
    title: (
      <>
        Tu día, ordenado.
        <br />
        <b>Tu terapeuta, al tanto.</b>
      </>
    ),
    text: 'daily es un registro diario para acompañar la terapia: anotás lo que hacés y cómo te hizo sentir, y tu terapeuta lo ve ordenado por semana.',
    tint: ['patient', 'patient'],
    Art: WelcomeArt,
  },
  {
    id: 'registro',
    kicker: 'Tu registro',
    title: (
      <>
        Anotá lo que hacés,
        <br />
        <b>cuando lo hacés.</b>
      </>
    ),
    text: 'Cada actividad con su horario. Puntuá cuánto la disfrutaste (placer) y cuánto dominio sentiste (control), del 1 al 10.',
    tint: ['patient', 'patient'],
    Art: EntryArt,
  },
  {
    id: 'ia',
    kicker: 'Contale tu día',
    title: (
      <>
        O contáselo
        <br />
        <b>con tus palabras.</b>
      </>
    ),
    text: 'Escribí o dictá cómo fue tu día. La IA lo ordena en actividades y vos revisás todo antes de guardarlo.',
    tint: ['patient', 'patient'],
    Art: ChatArt,
  },
  {
    id: 'informe',
    kicker: 'Informe semanal',
    title: (
      <>
        Tu terapeuta lo ve
        <br />
        <b>claro y a tiempo.</b>
      </>
    ),
    text: 'Cada semana se arma un informe con placer, control, ánimo y tus reflexiones. Solo vos y tu terapeuta pueden verlo.',
    tint: ['therapist', 'therapist'],
    Art: ReportArt,
  },
  {
    id: 'empezar',
    kicker: 'Empezá',
    title: (
      <>
        ¿Cómo querés <b>seguir?</b>
      </>
    ),
    text: 'Probá la app con datos de ejemplo, sin crear una cuenta, o creá la tuya. Esta presentación queda a mano desde la pantalla de ingreso.',
    tint: ['therapist', 'patient'],
    Art: ChooseArt,
  },
];

const LAST = STEPS.length - 1;

/** Retraso de entrada de un elemento (en milisegundos). */
function delay(ms: number, extra?: CSSProperties): CSSProperties {
  return { ['--d' as string]: `${ms}ms`, ...extra };
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function Onboarding({ signedIn = false }: { signedIn?: boolean }) {
  const path = useHashPath();
  const [step, setStep] = useState(0);
  // La animación larga de entrada se ve una sola vez, al abrir.
  const [intro, setIntro] = useState(true);
  const sceneRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  // El paso de destino, para que varios clics o teclas seguidos se sumen bien.
  const stepRef = useRef(0);
  const transition = useRef<ViewTransition | null>(null);
  const current = STEPS[step];

  // La presentación tiene su ruta: así "atrás" desde la demo o el ingreso vuelve acá.
  useEffect(() => {
    if (path !== 'bienvenida') navigate('bienvenida', true);
  }, [path]);

  const go = useCallback((next: number) => {
    const from = stepRef.current;
    if (next === from || next < 0 || next > LAST) return;
    stepRef.current = next;
    const update = () => {
      setStep(next);
      setIntro(false);
    };
    document.documentElement.dataset.obDir = next > from ? 'next' : 'prev';
    if (next === LAST) markOnboardingSeen();
    // Si había una transición en curso, se completa ya y arranca la nueva.
    transition.current?.skipTransition();
    // Transición entre pasos donde el navegador la soporta; si no, el paso nuevo entra animado igual.
    if (document.startViewTransition && !prefersReducedMotion()) {
      const vt = document.startViewTransition(() => flushSync(update));
      transition.current = vt;
      void vt.finished.finally(() => {
        if (transition.current === vt) transition.current = null;
      });
    } else {
      update();
    }
  }, []);

  // Si el botón que tenía el foco desaparece o se deshabilita, el foco pasa al título.
  useEffect(() => {
    if (intro) return;
    const active = document.activeElement as HTMLButtonElement | null;
    if (!active || active === document.body || active.disabled || !active.isConnected) {
      titleRef.current?.focus({ preventScroll: true });
    }
  }, [step, intro]);

  // Flechas del teclado para avanzar y volver.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [role="menu"]')) return;
      if (e.key === 'ArrowRight') go(stepRef.current + 1);
      if (e.key === 'ArrowLeft') go(stepRef.current - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // La ilustración tiene un tamaño fijo y se escala para entrar en el escenario.
  // Se mide sin transformaciones (la entrada anima la escala del escenario).
  useLayoutEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const fit = () => {
      const scale = Math.min(el.clientWidth / 600, el.clientHeight / 600, 1.15);
      el.style.setProperty('--scene-scale', String(Math.max(0.3, scale)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => void delete document.documentElement.dataset.obDir, []);

  function onPointerDown(e: ReactPointerEvent) {
    swipe.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e: ReactPointerEvent) {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(stepRef.current + (dx < 0 ? 1 : -1));
  }

  function finish(path: string) {
    markOnboardingSeen();
    navigate(path);
  }

  const { Art } = current;
  const isLast = step === LAST;

  return (
    <div
      className={`ob${intro ? ' is-intro' : ''}`}
      data-step={current.id}
      data-tint-a={current.tint[0]}
      data-tint-b={current.tint[1]}
    >
      <section
        className="ob-stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        <svg className="ob-rings" viewBox="0 0 600 700" aria-hidden preserveAspectRatio="xMidYMid slice">
          <circle cx="560" cy="660" r="300" pathLength={1} />
          <circle cx="560" cy="660" r="210" pathLength={1} />
          <circle cx="40" cy="40" r="170" pathLength={1} />
          <circle className="dot" cx="470" cy="150" r="3" />
          <circle className="dot" cx="120" cy="560" r="3" />
        </svg>
        <div className="ob-stage-top">
          <Brand />
          {!isLast && (
            <button type="button" className="pill-outline ob-skip" onClick={() => go(LAST)}>
              Saltar
            </button>
          )}
        </div>
        <div className="ob-scene-wrap" ref={sceneRef} aria-hidden>
          <div className="ob-scene" key={current.id}>
            <Art />
          </div>
        </div>
      </section>

      <main className="ob-panel">
        <p className="sr-only" aria-live="polite">
          Paso {step + 1} de {STEPS.length}: {current.kicker}
        </p>
        <div className="ob-copy" key={current.id}>
          <p className="kicker ob-in" style={delay(intro ? 520 : 60)}>
            Paso {step + 1} de {STEPS.length} · <b>{current.kicker}</b>
          </p>
          <h1 className="ob-title ob-in" style={delay(intro ? 620 : 120)} ref={titleRef} tabIndex={-1}>
            {current.title}
          </h1>
          <p className="ob-text ob-in" style={delay(intro ? 760 : 200)}>
            {current.text}
          </p>
          {isLast && <Choices signedIn={signedIn} onChoose={finish} />}
        </div>

        <footer className="ob-foot ob-in" style={delay(intro ? 900 : 0)}>
          <div className="ob-progress" role="group" aria-label="Pasos">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className={`ob-dot${i < step ? ' is-done' : ''}`}
                aria-label={`Paso ${i + 1}: ${s.kicker}`}
                aria-current={i === step ? 'step' : undefined}
                onClick={() => go(i)}
              >
                <span />
              </button>
            ))}
          </div>
          <div className="ob-nav">
            <button
              type="button"
              className="circle-btn"
              onClick={() => go(stepRef.current - 1)}
              aria-label="Paso anterior"
              aria-disabled={step === 0}
            >
              <ChevronLeft />
            </button>
            {!isLast && (
              <button type="button" className="btn btn-primary ob-next" onClick={() => go(stepRef.current + 1)}>
                {step === 0 ? 'Empezar' : 'Siguiente'}
                <ArrowRight aria-hidden />
              </button>
            )}
          </div>
        </footer>
      </main>
    </div>
  );
}

function Choices({ signedIn, onChoose }: { signedIn: boolean; onChoose: (path: string) => void }) {
  return (
    <div className="tray ob-choices ob-in" style={delay(300)}>
      <div className="tray-card ob-demo-card">
        <div className="ob-demo-head">
          <span className="ob-badge">
            <span className="live-dot" aria-hidden /> Demo
          </span>
          <p className="h3">Probala como invitado</p>
          <p className="sub">Datos de ejemplo. Lo que cargues no se guarda.</p>
        </div>
        <div className="ob-roles">
          <button type="button" className="ob-role" data-role="patient" onClick={() => onChoose('demo/paciente')}>
            <span className="ob-role-icon">
              <UserRound aria-hidden />
            </span>
            <span className="ob-role-text">
              <b>Como paciente</b>
              <small>Cargá un día y probá el chat</small>
            </span>
            <ArrowRight aria-hidden />
          </button>
          <button type="button" className="ob-role" data-role="therapist" onClick={() => onChoose('demo/terapeuta')}>
            <span className="ob-role-icon">
              <Stethoscope aria-hidden />
            </span>
            <span className="ob-role-text">
              <b>Como terapeuta</b>
              <small>Mirá pacientes e informes</small>
            </span>
            <ArrowRight aria-hidden />
          </button>
        </div>
      </div>
      <div className="tray-foot ob-account">
        {signedIn ? (
          <button type="button" className="btn btn-primary" onClick={() => onChoose('')}>
            Volver a mi cuenta
          </button>
        ) : (
          <>
            <button type="button" className="btn btn-primary" onClick={() => onChoose('crear-cuenta')}>
              Crear cuenta
            </button>
            <button type="button" className="link-btn" onClick={() => onChoose('ingresar')}>
              Ya tengo cuenta
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────── Animaciones con JavaScript (números y escritura) ───────────

function useCountUp(target: number, startMs: number, duration = 1100): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(target);
      return;
    }
    let frame = 0;
    let begin = 0;
    const timer = window.setTimeout(() => {
      const tick = (now: number) => {
        begin ||= now;
        const p = Math.min(1, (now - begin) / duration);
        setValue(target * (1 - (1 - p) ** 4));
        if (p < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, startMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, startMs, duration]);
  return value;
}

function useTyping(text: string, startMs: number, speed = 42): { shown: string; done: boolean } {
  const [count, setCount] = useState(() => (prefersReducedMotion() ? text.length : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      setCount(text.length);
      return;
    }
    let interval = 0;
    const timer = window.setTimeout(() => {
      let i = 0;
      interval = window.setInterval(() => {
        i += 1;
        setCount(i);
        if (i >= text.length) window.clearInterval(interval);
      }, speed);
    }, startMs);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [text, startMs, speed]);
  return { shown: text.slice(0, count), done: count >= text.length };
}

const fmt1 = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// ─────────── Ilustraciones ───────────

const WEEK = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function WelcomeArt() {
  const pleasure = useCountUp(7.4, 1300);
  const control = useCountUp(6.8, 1400);
  return (
    <>
      <div className="ob-abs" style={{ left: 36, top: 70, width: 360 }}>
        <div className="ob-float" style={{ ['--fd' as string]: '-1s' }}>
          <div className="ob-card ob-in" style={delay(420)}>
            <p className="ob-card-label">Esta semana</p>
            <div className="ob-days">
              {WEEK.map((d, i) => (
                <span key={i} className={`ob-day${i === 2 ? ' is-on' : ''}`}>
                  <small>{d}</small>
                  <b>{6 + i}</b>
                  <i className={i < 3 ? 'is-full' : ''} />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="ob-abs" style={{ left: 92, top: 232, width: 480 }}>
        <div className="ob-float" style={{ ['--fd' as string]: '-3s' }}>
          <div className="ob-card ob-list ob-in" style={delay(560)}>
            <ArtItem id="vinculos" title="Desayuno con mi hermana" time="08:00 – 09:00" pleasure={8} control={6} />
            <ArtItem id="movimiento" title="Caminata por el parque" time="18:30 – 19:30" pleasure={9} control={7} />
          </div>
        </div>
      </div>

      <div className="ob-abs" style={{ left: 200, top: 420, width: 340 }}>
        <div className="ob-float" style={{ ['--fd' as string]: '-5s' }}>
          <div className="ob-hero ob-in" style={delay(720)}>
            <span className="pill-outline">Resumen</span>
            <div className="ob-hero-scores">
              <span>
                <small>Placer</small>
                <b>
                  {fmt1(pleasure)}
                  <i>/10</i>
                </b>
              </span>
              <span>
                <small>Control</small>
                <b>
                  {fmt1(control)}
                  <i>/10</i>
                </b>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="ob-abs" style={{ left: 28, top: 470 }}>
        <span className="ob-fab ob-pop" style={delay(1000)}>
          <Sparkles aria-hidden /> Contale tu día
        </span>
      </div>
    </>
  );
}

function ArtItem({
  id,
  title,
  time,
  pleasure,
  control,
  style,
}: {
  id: CategoryId;
  title: string;
  time: string;
  pleasure: number;
  control: number;
  style?: CSSProperties;
}) {
  return (
    <div className="ob-item" style={style}>
      <CategoryAvatar id={id} />
      <span className="ob-item-main">
        <b>{title}</b>
        <small>{time}</small>
      </span>
      <Scores pleasure={pleasure} control={control} compact />
    </div>
  );
}

function RatingBars({ label, value, tone, start }: { label: string; value: number; tone: string; start: number }) {
  const shown = useCountUp(value, start + 120, 700);
  return (
    <div className="ob-rating" style={{ ['--tone' as string]: tone }}>
      <div className="ob-rating-head">
        <span>
          <i className="dot" /> {label}
        </span>
        <b>
          {Math.round(shown)}
          <small>/10</small>
        </b>
      </div>
      <div className="ob-segments">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={i < value ? 'is-on' : ''} style={delay(start + i * 60)} />
        ))}
      </div>
    </div>
  );
}

function EntryArt() {
  const typed = useTyping('Caminata por el parque', 700);
  return (
    <div className="ob-abs" style={{ left: 40, top: 60, width: 520 }}>
      <div className="tray ob-tray ob-in" style={delay(80)}>
        <div className="tray-card ob-entry">
          <div className="ob-times">
            <span className="ob-in" style={delay(240)}>
              <small>Inicio</small>
              <b>18:30</b>
            </span>
            <span className="ob-duration ob-pop" style={delay(520)}>
              1 h
            </span>
            <span className="ob-in is-end" style={delay(380)}>
              <small>Fin</small>
              <b>19:30</b>
            </span>
          </div>
          <div className="ob-field">
            <small>¿Qué hiciste?</small>
            <p className="ob-typed">
              {typed.shown}
              {!typed.done && <span className="ob-caret" />}
            </p>
          </div>
          <div className="ob-chips">
            {(['comidas', 'movimiento', 'vinculos', 'ocio'] as CategoryId[]).map((id, i) => {
              const cat = CATEGORIES.find((c) => c.id === id)!;
              const chosen = id === 'movimiento';
              return (
                <span
                  key={id}
                  className={`chip ob-in${chosen ? ' ob-chosen' : ''}`}
                  style={delay(1500 + i * 70, chosen ? { ['--pick' as string]: '1950ms' } : undefined)}
                >
                  <span className="dot" style={{ background: categoryColorVar(id) }} />
                  {cat.label}
                </span>
              );
            })}
          </div>
          <div className="ob-ratings">
            <RatingBars label="Placer" value={9} tone="var(--pleasure)" start={2200} />
            <RatingBars label="Control" value={7} tone="var(--control)" start={2600} />
          </div>
        </div>
        <div className="tray-foot ob-entry-foot">
          <span className="lbl">Del 1 (nada) al 10 (muchísimo)</span>
          <span className="go-btn ob-press" style={delay(3500)}>
            Agregar <ArrowRight aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatArt() {
  return (
    <div className="ob-abs" style={{ left: 50, top: 40, width: 500 }}>
      <div className="ob-card ob-chat ob-in" style={delay(60)}>
        <div className="ob-chat-head">
          <span className="assistant-icon">
            <Sparkles aria-hidden />
          </span>
          <span>
            <b>Contale tu día</b>
            <small>Lo ordeno y vos revisás</small>
          </span>
        </div>
        <div className="ob-chat-body">
          <div className="msg msg-user ob-in" style={delay(350)}>
            A las 8 desayuné con mi hermana, de 9 a 13 trabajé y a la tarde fui a caminar. ¡Lo disfruté mucho!
          </div>
          <div className="typing ob-blip" style={delay(900)}>
            <span />
            <span />
            <span />
          </div>
          <div className="msg msg-assistant ob-in" style={delay(1900)}>
            <div className="msg-bubble">Encontré 3 actividades. Revisalas antes de agregarlas.</div>
          </div>
          <div className="proposal ob-in" style={delay(2150)}>
            <ul className="proposal-list">
              {(
                [
                  ['vinculos', 'Desayuno con mi hermana', '08:00'],
                  ['trabajo', 'Trabajo', '09:00 – 13:00'],
                  ['movimiento', 'Caminata', '17:00 · Placer 9'],
                ] as [CategoryId, string, string][]
              ).map(([id, title, time], i) => (
                <li key={title} className="ob-in" style={delay(2300 + i * 160)}>
                  <span className="proposal-item">
                    <CategoryAvatar id={id} />
                    <span className="what">
                      <span className="what-title">{title}</span>
                      <small>{time}</small>
                    </span>
                    <RoundCheck checked />
                  </span>
                </li>
              ))}
            </ul>
            <div className="ob-proposal-foot">
              <span className="btn btn-primary btn-sm ob-press" style={delay(3200)}>
                Agregar 3 al día
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CHART: [number, number][] = [
  [6, 7],
  [4, 6],
  [3, 5],
  [7, 6],
  [8, 7],
  [9, 6],
  [7, 5],
];

function ReportArt() {
  const pleasure = useCountUp(6.3, 500);
  const control = useCountUp(6.0, 620);
  return (
    <>
      <div className="ob-abs" style={{ left: 24, top: 40, width: 320 }}>
        <div className="ob-float" style={{ ['--fd' as string]: '-2s' }}>
          <div className="ob-hero is-tall ob-in" style={delay(100)}>
            <span className="pill-outline">Resumen</span>
            <div className="ob-hero-scores">
              <span>
                <small>Placer</small>
                <b>
                  {fmt1(pleasure)}
                  <i>/10</i>
                </b>
              </span>
              <span>
                <small>Control</small>
                <b>
                  {fmt1(control)}
                  <i>/10</i>
                </b>
              </span>
            </div>
            <small className="ob-hero-sub">23 actividades en 6 días · Ánimo: bien</small>
          </div>
        </div>
      </div>

      <div className="ob-abs" style={{ left: 120, top: 300, width: 440 }}>
        <div className="ob-float" style={{ ['--fd' as string]: '-4s' }}>
          <div className="ob-card ob-chart ob-in" style={delay(300)}>
            <p className="ob-card-label">Placer y control por día</p>
            <div className="ob-bars">
              {CHART.map(([p, c], i) => (
                <span key={i} className="ob-bar-day">
                  <span className="ob-bar-pair">
                    <i className="is-p" style={delay(600 + i * 90, { height: `${p * 10}%` })} />
                    <i className="is-c" style={delay(660 + i * 90, { height: `${c * 10}%` })} />
                  </span>
                  <small>{WEEK[i]}</small>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="ob-abs" style={{ left: 318, top: 118, width: 250 }}>
        <div className="ob-float" style={{ ['--fd' as string]: '-6s' }}>
          <div className="ob-card ob-note ob-in" style={delay(900)}>
            <p className="ob-card-label">
              <NotebookPen aria-hidden /> Notas de sesión
            </p>
            <p className="ob-note-text">Retomar lo del miércoles: qué pasó antes de la reunión.</p>
            <small>Solo para vos</small>
          </div>
        </div>
      </div>
    </>
  );
}

function ChooseArt() {
  return (
    <>
      <div className="ob-abs" style={{ left: 26, top: 120, width: 262 }}>
        <div className="ob-float" style={{ ['--fd' as string]: '-1s' }}>
          <div className="ob-device ob-in" data-role="patient" style={delay(80, { rotate: '-5deg' })}>
            <div className="ob-device-head">
              <NotebookPen aria-hidden /> Paciente
            </div>
            <div className="ob-days is-mini">
              {WEEK.map((d, i) => (
                <span key={i} className={`ob-day${i === 3 ? ' is-on' : ''}`}>
                  <small>{d}</small>
                  <i className={i < 4 ? 'is-full' : ''} />
                </span>
              ))}
            </div>
            <ArtItem id="comidas" title="Desayuno" time="08:00" pleasure={7} control={6} />
            <ArtItem id="movimiento" title="Yoga" time="18:30" pleasure={9} control={8} />
            <span className="ob-fab is-small">
              <Sparkles aria-hidden /> Contale tu día
            </span>
          </div>
        </div>
      </div>
      <div className="ob-abs" style={{ left: 312, top: 165, width: 262 }}>
        <div className="ob-float" style={{ ['--fd' as string]: '-4s' }}>
          <div className="ob-device ob-in" data-role="therapist" style={delay(220, { rotate: '4deg' })}>
            <div className="ob-device-head">
              <ChartColumn aria-hidden /> Terapeuta
            </div>
            <div className="ob-hero is-mini">
              <div className="ob-hero-scores">
                <span>
                  <small>Placer</small>
                  <b>
                    7,1<i>/10</i>
                  </b>
                </span>
                <span>
                  <small>Control</small>
                  <b>
                    6,4<i>/10</i>
                  </b>
                </span>
              </div>
            </div>
            <div className="ob-bars is-mini">
              {CHART.map(([p, c], i) => (
                <span key={i} className="ob-bar-day">
                  <span className="ob-bar-pair">
                    <i className="is-p" style={delay(500 + i * 70, { height: `${p * 10}%` })} />
                    <i className="is-c" style={delay(540 + i * 70, { height: `${c * 10}%` })} />
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
