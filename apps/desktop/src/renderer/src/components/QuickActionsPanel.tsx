interface QuickActionDefinition {
  id: 'refresh-diagnostics' | 'preview-temp-cleanup' | 'flush-dns' | 'restart-explorer' | 'empty-recycle-bin';
  title: string;
  description: string;
  detail: string;
  tone?: 'neutral' | 'caution';
}

interface QuickActionsPanelProps {
  actions: ReadonlyArray<QuickActionDefinition>;
  disabled: boolean;
  busyActionId: QuickActionDefinition['id'] | null;
  onRun: (actionId: QuickActionDefinition['id']) => void;
}

export const QuickActionsPanel = ({
  actions,
  disabled,
  busyActionId,
  onRun
}: QuickActionsPanelProps) => (
  <section className="panel fixer-panel quick-actions-panel">
    <div className="panel-heading">
      <div>
        <p className="section-kicker">Action hub</p>
        <h2>Quick repair actions</h2>
      </div>
      <p className="panel-meta">
        Common recovery tasks that act immediately and return explicit results.
      </p>
    </div>

    <div className="quick-actions-grid">
      {actions.map((action) => {
        const isBusy = busyActionId === action.id;

        return (
          <article
            key={action.id}
            className={`quick-action-card ${action.tone === 'caution' ? 'caution' : ''}`}
          >
            <div className="quick-action-copy">
              <h3>{action.title}</h3>
              <p>{action.description}</p>
              <span>{action.detail}</span>
            </div>
            <button
              type="button"
              className={action.tone === 'caution' ? 'secondary-button' : 'primary-button'}
              onClick={() => onRun(action.id)}
              disabled={disabled}
            >
              {isBusy ? 'Working...' : action.title}
            </button>
          </article>
        );
      })}
    </div>
  </section>
);
