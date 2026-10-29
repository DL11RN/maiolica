import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

/** Finestra in vetro sospesa sopra la pagina. */
export function Modal({
  title,
  kicker,
  tone,
  wide,
  onClose,
  children,
  actions,
}: {
  title: ReactNode;
  kicker?: string;
  tone?: 'good' | 'bad';
  wide?: boolean;
  onClose?: () => void;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-layer" onClick={onClose}>
      <div
        className={`modal glass float-in ${wide ? 'wide' : ''} ${tone ?? ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            {kicker && <div className="kicker">{kicker}</div>}
            <h2>{title}</h2>
          </div>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Chiudi">
              <X size={18} />
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
        {actions && <footer className="modal-actions">{actions}</footer>}
      </div>
    </div>
  );
}

/** Conferma in vetro al posto del confirm() del browser. */
export function ConfirmDialog({
  title,
  text,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button className="btn ghost" onClick={onCancel}>
            Annulla
          </button>
          <button className={`btn ${danger ? 'danger-solid' : 'primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{text}</p>
    </Modal>
  );
}
