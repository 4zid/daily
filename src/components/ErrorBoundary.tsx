import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { Brand } from './common';

// Si algo falla al dibujar una pantalla, en vez de quedar en blanco se muestra un
// aviso para reintentar, y se manda un reporte mínimo (sin datos de la persona).

interface Props {
  children: ReactNode;
  /** Al cambiar (por ejemplo, la ruta), se vuelve a intentar sola. */
  resetKey: string;
}

interface State {
  error: Error | null;
  detail: string;
}

/** Ruta sin códigos de invitación ni otros datos. */
function safeRoute(): string {
  const path = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return path.replace(/^invitacion\/.*/, 'invitacion/…').slice(0, 60);
}

function report(error: Error, componentStack: string) {
  try {
    const body = JSON.stringify({
      message: String(error?.message ?? error).slice(0, 500),
      stack: String(error?.stack ?? '').slice(0, 2000),
      componentStack: componentStack.slice(0, 2000),
      route: safeRoute(),
    });
    if (!navigator.sendBeacon?.('/api/client-error', new Blob([body], { type: 'application/json' }))) {
      void fetch('/api/client-error', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } });
    }
  } catch {
    // El reporte es opcional.
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, detail: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const componentStack = (info.componentStack ?? '').trim();
    console.error('daily: falló una pantalla', error, componentStack);
    this.setState({
      detail: [String(error?.message ?? error), ...componentStack.split('\n').slice(0, 6).map((l) => l.trim())].join('\n'),
    });
    report(error, componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, detail: '' });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="splash" role="alert">
        <Brand />
        <div className="tray splash-card">
          <div className="tray-card auth-form">
            <header className="auth-head">
              <h1>Algo falló al mostrar esta pantalla</h1>
              <p className="sub">Tus datos están a salvo. Probá de nuevo; si vuelve a pasar, recargá la página.</p>
            </header>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null, detail: '' })}>
                <RotateCcw />
                Reintentar
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => window.location.reload()}>
                Recargar la página
              </button>
            </div>
            {this.state.detail && (
              <details className="error-detail">
                <summary>Detalle técnico</summary>
                <pre>{this.state.detail}</pre>
              </details>
            )}
          </div>
        </div>
      </div>
    );
  }
}
