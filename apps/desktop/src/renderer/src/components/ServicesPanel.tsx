import type { ServiceSummary, SystemMetricsSnapshot } from '@shared/models';

interface ServicesPanelProps {
  services: ServiceSummary[];
  searchValue: string;
  isLoading: boolean;
  actionsDisabled: boolean;
  platform: SystemMetricsSnapshot['platform'] | null;
  onSearchChange: (value: string) => void;
  onStart: (service: ServiceSummary) => void;
  onStop: (service: ServiceSummary) => void;
  onRestart: (service: ServiceSummary) => void;
}

export const ServicesPanel = ({
  services,
  searchValue,
  isLoading,
  actionsDisabled,
  platform,
  onSearchChange,
  onStart,
  onStop,
  onRestart
}: ServicesPanelProps) => (
  <section className="panel fixer-panel">
    <div className="panel-heading">
      <div>
        <p className="section-kicker">Repair tool</p>
        <h2>Service controls</h2>
      </div>
      <p className="panel-meta">
        Start, stop, or restart individual services with explicit confirmation and failure reporting.
      </p>
    </div>

    <input
      type="search"
      className="form-input"
      value={searchValue}
      placeholder="Filter services"
      onChange={(event) => onSearchChange(event.target.value)}
    />

    {isLoading && services.length === 0 ? (
      <div className="fixer-empty">Reading the current Windows service inventory.</div>
    ) : services.length > 0 ? (
      <div className="fixer-content">
        <div className="inventory-list">
          {services.map((service) => (
            <div key={service.name} className="inventory-row">
              <div>
                <p className="inventory-title">{service.displayName}</p>
                <p className="inventory-copy">
                  {service.name} · {service.state} · {service.startMode}
                </p>
              </div>
              <div className="table-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onStart(service)}
                  disabled={actionsDisabled || !service.canStart}
                  title={service.startSupportReason || 'Start service'}
                >
                  Start
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onStop(service)}
                  disabled={actionsDisabled || !service.canStop}
                  title={service.stopSupportReason || 'Stop service'}
                >
                  Stop
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onRestart(service)}
                  disabled={actionsDisabled || !service.canRestart}
                  title={service.restartSupportReason || 'Restart service'}
                >
                  Restart
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="fixer-empty">
        {platform === 'windows'
          ? 'No services match the current filter.'
          : 'Service control is available when Sovereign runs on Windows.'}
      </div>
    )}
  </section>
);
