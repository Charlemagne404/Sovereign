interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ConfirmDialog = ({
  title,
  description,
  confirmLabel,
  busy,
  onCancel,
  onConfirm
}: ConfirmDialogProps) => (
  <div className="dialog-overlay">
    <div className="dialog-card">
      <p className="section-kicker">Confirm action</p>
      <h2>{title}</h2>
      <p className="dialog-copy">{description}</p>
      <div className="dialog-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </div>
  </div>
);
