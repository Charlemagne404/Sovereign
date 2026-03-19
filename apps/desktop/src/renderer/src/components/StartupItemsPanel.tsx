import type { StartupItem, SystemMetricsSnapshot } from '@shared/models';

interface StartupItemsPanelProps {
  items: StartupItem[];
  searchValue: string;
  isLoading: boolean;
  actionsDisabled: boolean;
  platform: SystemMetricsSnapshot['platform'] | null;
  onSearchChange: (value: string) => void;
  onDisable: (item: StartupItem) => void;
}

export const StartupItemsPanel = ({
  items,
  searchValue,
  isLoading,
  actionsDisabled,
  platform,
  onSearchChange,
  onDisable
}: StartupItemsPanelProps) => (
  <section className="panel fixer-panel">
    <div className="panel-heading">
      <div>
        <p className="section-kicker">Repair tool</p>
        <h2>Startup items</h2>
      </div>
      <p className="panel-meta">
        Disable with confirmation. Sovereign records what changed instead of making
        hidden persistence edits.
      </p>
    </div>

    <input
      type="search"
      className="form-input"
      value={searchValue}
      placeholder="Filter startup items"
      onChange={(event) => onSearchChange(event.target.value)}
    />

    {isLoading && items.length === 0 ? (
      <div className="fixer-empty">Reading the current startup inventory.</div>
    ) : items.length > 0 ? (
      <div className="fixer-content">
        <div className="inventory-list">
          {items.map((item) => (
            <div
              key={item.id}
              className="inventory-row"
            >
              <div>
                <p className="inventory-title">{item.name}</p>
                <p className="inventory-copy">
                  {item.location}
                  {item.user ? ` · ${item.user}` : ''}
                </p>
                <p className="inventory-copy">{item.command || 'Command unavailable'}</p>
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => onDisable(item)}
                disabled={actionsDisabled || !item.canDisable}
                title={item.actionSupportReason || 'Disable startup item'}
              >
                Disable
              </button>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="fixer-empty">
        {platform === 'windows'
          ? 'No startup items match the current filter.'
          : 'Startup item control is available when Sovereign runs on Windows.'}
      </div>
    )}
  </section>
);
