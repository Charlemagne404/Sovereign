import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type PlatformKey
} from '@shared/models';

interface SettingsViewProps {
  settings: AppSettings | null;
  platform: PlatformKey | null;
  isLoading: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  saveMessage: string | null;
  saveError: string | null;
  onChange: (settings: AppSettings) => void;
  onSave: () => void;
  onReset: () => void;
}

const PLATFORM_NOTES: Record<PlatformKey, string> = {
  windows:
    'Windows-only providers stay inside user-space PowerShell and OS command surfaces. Sovereign does not install drivers, persistence, or hidden background agents.',
  macos:
    'This build runs in a fallback profile on macOS. Windows-only monitors and fixer actions stay visible as unsupported rather than pretending they are active.',
  linux:
    'This build runs in a fallback profile on Linux. Windows service, startup, Defender, and firewall controls remain unavailable by design.',
  unknown:
    'Some monitors and controls depend on explicit Windows APIs. Sovereign surfaces those limits instead of inventing unsupported coverage.'
};

const bytesPerSecondToMegabytes = (value: number): string =>
  (value / (1024 * 1024)).toFixed(1);

export const SettingsView = ({
  settings,
  platform,
  isLoading,
  isSaving,
  hasUnsavedChanges,
  saveMessage,
  saveError,
  onChange,
  onSave,
  onReset
}: SettingsViewProps) => {
  if (isLoading && !settings) {
    return (
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Settings</p>
            <h2>Loading configuration</h2>
          </div>
        </div>
        <div className="state-block">
          Reading current thresholds, timeline limits, and watchdog coverage toggles.
        </div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Settings</p>
            <h2>Configuration unavailable</h2>
          </div>
        </div>
        <div className="state-block state-block-error">
          Sovereign could not load the current local settings file.
        </div>
      </section>
    );
  }

  const updatePercentThreshold = (
    resource: 'cpu' | 'memory' | 'disk',
    field: 'elevated' | 'stressed',
    value: number
  ): void => {
    onChange({
      ...settings,
      thresholds: {
        ...settings.thresholds,
        [resource]: {
          ...settings.thresholds[resource],
          [field]: value
        }
      }
    });
  };

  const updateNetworkThreshold = (
    field: 'elevatedBytesPerSec' | 'stressedBytesPerSec',
    valueInMegabytes: number
  ): void => {
    onChange({
      ...settings,
      thresholds: {
        ...settings.thresholds,
        network: {
          ...settings.thresholds.network,
          [field]: Math.round(valueInMegabytes * 1024 * 1024)
        }
      }
    });
  };

  const updateMonitorToggle = (
    key: keyof AppSettings['monitors'],
    value: boolean
  ): void => {
    onChange({
      ...settings,
      monitors: {
        ...settings.monitors,
        [key]: value
      }
    });
  };

  return (
    <section className="settings-grid">
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Thresholds</p>
            <h2>Severity guidance</h2>
          </div>
          <p className="panel-meta">
            These values only affect Sovereign&apos;s labels and summaries. They do not
            change OS behavior or apply hidden enforcement.
          </p>
        </div>

        <div className="settings-section-grid">
          {(['cpu', 'memory', 'disk'] as const).map((resource) => (
            <article
              key={resource}
              className="settings-card"
            >
              <h3>{resource.toUpperCase()}</h3>
              <label className="settings-field">
                <span>Elevated at</span>
                <input
                  type="number"
                  min={1}
                  max={98}
                  value={settings.thresholds[resource].elevated}
                  onChange={(event) =>
                    updatePercentThreshold(
                      resource,
                      'elevated',
                      Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className="settings-field">
                <span>Stressed at</span>
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={settings.thresholds[resource].stressed}
                  onChange={(event) =>
                    updatePercentThreshold(
                      resource,
                      'stressed',
                      Number(event.target.value)
                    )
                  }
                />
              </label>
            </article>
          ))}

          <article className="settings-card">
            <h3>Network</h3>
            <label className="settings-field">
              <span>Elevated at</span>
              <input
                type="number"
                min={0.1}
                max={500}
                step={0.1}
                value={bytesPerSecondToMegabytes(
                  settings.thresholds.network.elevatedBytesPerSec
                )}
                onChange={(event) =>
                  updateNetworkThreshold(
                    'elevatedBytesPerSec',
                    Number(event.target.value)
                  )
                }
              />
              <small>MB/s combined throughput</small>
            </label>
            <label className="settings-field">
              <span>Stressed at</span>
              <input
                type="number"
                min={0.2}
                max={500}
                step={0.1}
                value={bytesPerSecondToMegabytes(
                  settings.thresholds.network.stressedBytesPerSec
                )}
                onChange={(event) =>
                  updateNetworkThreshold(
                    'stressedBytesPerSec',
                    Number(event.target.value)
                  )
                }
              />
              <small>MB/s combined throughput</small>
            </label>
          </article>
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Watchdog coverage</p>
            <h2>Polling toggles</h2>
          </div>
          <p className="panel-meta">
            Turning a monitor off stops that in-app polling flow. Sovereign does not
            keep background persistence when the app is closed.
          </p>
        </div>

        <div className="toggle-list">
          {(
            [
              [
                'processLaunchMonitoring',
                'Process launches',
                'Compare the live process table to detect newly observed launches.'
              ],
              [
                'startupMonitoring',
                'Startup items',
                'Read visible Windows startup entries and log additions or command changes.'
              ],
              [
                'scheduledTaskMonitoring',
                'Scheduled tasks',
                'Read scheduled task summaries when Windows exposes them to the current user.'
              ],
              [
                'securityStatusMonitoring',
                'Defender and firewall',
                'Re-check Microsoft Defender and Windows Firewall status through standard command surfaces.'
              ]
            ] as const
          ).map(([key, title, description]) => (
            <label
              key={key}
              className="toggle-card"
            >
              <div>
                <p className="inventory-title">{title}</p>
                <p className="inventory-copy">{description}</p>
              </div>
              <input
                type="checkbox"
                checked={settings.monitors[key]}
                onChange={(event) => updateMonitorToggle(key, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Experience</p>
            <h2>Operator defaults</h2>
          </div>
        </div>

        <div className="settings-section-grid compact">
          <article className="settings-card">
            <label className="settings-field">
              <span>Recent events limit</span>
              <input
                type="number"
                min={5}
                max={50}
                value={settings.timelineEventLimit}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    timelineEventLimit: Number(event.target.value)
                  })
                }
              />
              <small>Controls how many timeline items render at once.</small>
            </label>
          </article>

          <article className="settings-card">
            <label className="toggle-card stacked">
              <div>
                <p className="inventory-title">Telemetry summaries</p>
                <p className="inventory-copy">
                  Keep advice text visible on metric cards and health summaries.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableTelemetrySummaries}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    enableTelemetrySummaries: event.target.checked
                  })
                }
              />
            </label>
          </article>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onReset}
            disabled={isSaving}
          >
            Restore defaults
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? 'Saving settings…' : 'Save settings'}
          </button>
        </div>

        <div className="settings-status-row">
          <p className="panel-meta-inline">
            Default preset: CPU {DEFAULT_APP_SETTINGS.thresholds.cpu.elevated}% /{' '}
            {DEFAULT_APP_SETTINGS.thresholds.cpu.stressed}% and timeline limit{' '}
            {DEFAULT_APP_SETTINGS.timelineEventLimit}.
          </p>
          {saveMessage ? <p className="status-copy success">{saveMessage}</p> : null}
          {saveError ? <p className="status-copy failure">{saveError}</p> : null}
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Platform note</p>
            <h2>Honest limits</h2>
          </div>
        </div>
        <div className="detail-callout">
          <p>{PLATFORM_NOTES[platform || 'unknown']}</p>
        </div>
      </section>
    </section>
  );
};
