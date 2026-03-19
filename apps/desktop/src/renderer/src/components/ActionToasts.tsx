import type { FixActionResult } from '@shared/models';

export interface ActionToastItem {
  id: string;
  result: FixActionResult;
}

interface ActionToastsProps {
  toasts: ActionToastItem[];
  onDismiss: (id: string) => void;
}

export const ActionToasts = ({ toasts, onDismiss }: ActionToastsProps) => (
  <div className="toast-stack">
    {toasts.map((toast) => (
      <article key={toast.id} className={`toast ${toast.result.success ? 'success' : 'failure'}`}>
        <div>
          <p className="toast-kicker">{toast.result.kind}</p>
          <h3>{toast.result.summary}</h3>
          <p>{toast.result.details[0]}</p>
        </div>
        <button
          type="button"
          className="toast-dismiss"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss action result"
        >
          x
        </button>
      </article>
    ))}
  </div>
);
