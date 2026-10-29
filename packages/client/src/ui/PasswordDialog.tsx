import { useState } from 'react';
import { api } from '../api';
import { useGame } from '../store';
import { Modal } from './Modal';

/** Cambio della propria password (serve anche dopo un reset da parte di un amministratore). */
export function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const showToast = useGame((s) => s.showToast);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== repeat) return setError('Le due password nuove non coincidono.');
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      showToast('Password aggiornata. Le altre sessioni sono state chiuse.');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal kicker="Profilo" title="Cambia password" onClose={onClose}>
      <form className="stack" onSubmit={submit} id="password-form">
        <label className="field">
          <span className="label">Password attuale</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          <span className="label">Nuova password</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
        </label>
        <label className="field">
          <span className="label">Ripeti la nuova password</span>
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Annulla
          </button>
          <button className="btn primary" disabled={busy}>
            Salva
          </button>
        </div>
      </form>
    </Modal>
  );
}
