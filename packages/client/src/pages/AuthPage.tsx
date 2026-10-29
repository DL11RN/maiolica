import { BookOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type User } from '../api';
import { Brand } from '../ui/Brand';
import { Backdrop } from '../ui/Backdrop';

export function AuthPage({ onAuth }: { onAuth: (u: User) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [full, setFull] = useState(false);

  useEffect(() => {
    api
      .config()
      .then((c) => {
        setRegistrationOpen(c.registrationOpen);
        setFull(c.full);
        if (!c.registrationOpen) setMode('login');
      })
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = mode === 'login' ? await api.login(username, password) : await api.register(username, password);
      // Il server ha accettato le credenziali: controlla che il browser abbia davvero salvato la sessione.
      try {
        await api.me();
      } catch {
        setError(
          location.protocol === 'http:'
            ? 'Accesso riuscito, ma il browser ha rifiutato il cookie di sessione: il server lo invia solo per HTTPS. Apri il sito in HTTPS oppure imposta COOKIE_SECURE=auto nel file .env.'
            : 'Accesso riuscito, ma il browser non ha salvato il cookie di sessione. Controlla che i cookie siano consentiti per questo sito.',
        );
        return;
      }
      onAuth(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <Backdrop />
      <div className="auth-wrap">
        <form className="auth-card glass float-in" onSubmit={submit}>
          <Brand size="lg" />
          <p className="auth-tagline">Scegli i colori dalle fornaci e decora il muro della tua bottega, una piastrella alla volta.</p>
          {registrationOpen ? (
            <div className="segmented">
              <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>
                Accedi
              </button>
              <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>
                Nuovo profilo
              </button>
            </div>
          ) : (
            <p className="faint small" style={{ textAlign: 'center', margin: 0 }}>
              {full
                ? 'Posti esauriti: è stato raggiunto il numero massimo di utenti.'
                : 'La registrazione è chiusa: chiedi un profilo a un amministratore.'}
            </p>
          )}
          <label className="field">
            <span className="label">Nome utente</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label className="field">
            <span className="label">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn primary block" disabled={busy}>
            {mode === 'login' ? 'Entra in bottega' : 'Crea il profilo'}
          </button>
          <a className="row center small" href="#/guida">
            <BookOpen size={15} /> Prima volta? Leggi la guida
          </a>
        </form>
      </div>
    </div>
  );
}
