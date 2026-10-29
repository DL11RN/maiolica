import { Ban, Copy, KeyRound, Search, Shield, ShieldOff, Trash2, Unlock, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, type AccessInfo, type AdminUser, type User } from '../api';
import { useGame } from '../store';
import { ConfirmDialog, Modal } from '../ui/Modal';
import { Backdrop } from '../ui/Backdrop';
import { TopNav } from '../ui/TopNav';

const fmtDate = (t: number | null) =>
  t ? new Date(t).toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'mai';

type Pending =
  | { kind: 'delete'; user: AdminUser }
  | { kind: 'block'; user: AdminUser }
  | { kind: 'reset'; user: AdminUser }
  | { kind: 'admin'; user: AdminUser };

export function AdminPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [access, setAccess] = useState<AccessInfo>({ registrationOpen: true, full: false, maxUsers: null, userCount: 0 });
  const registrationOpen = access.registrationOpen;
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [secret, setSecret] = useState<{ username: string; password: string; created: boolean } | null>(null);
  const showToast = useGame((s) => s.showToast);
  const fail = (e: Error) => showToast(e.message);

  const refresh = useCallback(() => {
    api.admin.users().then(setUsers).catch(fail);
    api.admin.settings().then(setAccess).catch(fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  if (!user.isAdmin)
    return (
      <div className="page">
        <Backdrop />
        <TopNav active="admin" user={user} onLogout={onLogout} />
        <main className="page-body">
          <div className="empty glass">Questa pagina è riservata agli amministratori.</div>
        </main>
      </div>
    );

  const visible = users.filter((u) => u.username.toLowerCase().includes(query.trim().toLowerCase()));

  const run = async () => {
    if (!pending) return;
    const { kind, user: u } = pending;
    setPending(null);
    try {
      if (kind === 'delete') {
        await api.admin.deleteUser(u.id);
        showToast(`${u.username} eliminato.`);
      } else if (kind === 'block') {
        await api.admin.block(u.id, !u.blocked);
        showToast(u.blocked ? `${u.username} sbloccato.` : `${u.username} bloccato e disconnesso.`);
      } else if (kind === 'admin') {
        await api.admin.setAdmin(u.id, !u.isAdmin);
      } else {
        const { password } = await api.admin.resetPassword(u.id);
        setSecret({ username: u.username, password, created: false });
      }
      refresh();
    } catch (e) {
      fail(e as Error);
    }
  };

  const confirmText: Record<Pending['kind'], (u: AdminUser) => [string, string, string]> = {
    delete: (u) => [
      `Eliminare ${u.username}?`,
      'Le partite che ha creato verranno cancellate, in quelle degli altri il suo posto torna libero. Anche i suoi scenari spariscono. Non si può annullare.',
      'Elimina',
    ],
    block: (u) =>
      u.blocked
        ? [`Sbloccare ${u.username}?`, 'Potrà di nuovo accedere con la sua password.', 'Sblocca']
        : [`Bloccare ${u.username}?`, 'Verrà disconnesso subito e non potrà più accedere finché non lo sblocchi. Le sue partite restano.', 'Blocca'],
    reset: (u) => [
      `Nuova password per ${u.username}?`,
      'Verrà generata una password temporanea da comunicargli; le sue sessioni aperte verranno chiuse.',
      'Genera password',
    ],
    admin: (u) =>
      u.isAdmin
        ? [`Togliere i permessi a ${u.username}?`, 'Non potrà più gestire utenti e impostazioni.', 'Togli admin']
        : [`Rendere ${u.username} amministratore?`, 'Potrà gestire tutti gli utenti, compreso te.', 'Rendi admin'],
  };

  return (
    <div className="page">
      <Backdrop />
      <TopNav active="admin" user={user} onLogout={onLogout} />
      <main className="page-body stack">
        <div>
          <div className="kicker">Amministrazione</div>
          <h1>Utenti</h1>
        </div>
        <div className="admin-grid">
          <section className="panel glass float-in">
            <div className="kicker">Accesso</div>
            <label className="switch-row">
              <span>
                <b>Registrazione libera</b>
                <small className="faint">
                  {access.full
                    ? 'Limite di utenti raggiunto: nessuno può registrarsi.'
                    : registrationOpen
                      ? 'Chiunque raggiunga il sito può creare un profilo.'
                      : 'Solo gli amministratori possono creare nuovi profili.'}
                </small>
              </span>
              <button
                className={`switch ${registrationOpen ? 'on' : ''}`}
                role="switch"
                aria-checked={registrationOpen}
                onClick={() =>
                  api.admin
                    .saveSettings({ registrationOpen: !registrationOpen })
                    .then(setAccess)
                    .catch(fail)
                }
              >
                <i />
              </button>
            </label>

            <div className="kicker">Nuovo utente</div>
            <form
              className="code-form"
              onSubmit={(e) => {
                e.preventDefault();
                api.admin
                  .createUser(newName.trim())
                  .then(({ user: u, password }) => {
                    setSecret({ username: u.username, password, created: true });
                    setNewName('');
                    refresh();
                  })
                  .catch(fail);
              }}
            >
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="nome utente" aria-label="Nome del nuovo utente" />
              <button className="btn primary" disabled={newName.trim().length < 3 || access.full}>
                <UserPlus size={16} /> Crea
              </button>
            </form>
            <p className="faint small">
              Viene generata una password temporanea da comunicare all’utente, che potrà cambiarla dall’icona a forma di
              chiave in alto.
            </p>
            <p className="faint small">
              {access.maxUsers
                ? `Limite di utenti: ${access.userCount} su ${access.maxUsers} (variabile MAX_USERS).`
                : 'Nessun limite al numero di utenti: puoi impostarlo con la variabile MAX_USERS.'}
            </p>
            <p className="faint small">
              Gli amministratori fissi si indicano con la variabile <span className="mono">ADMIN_USERS</span> (nomi
              utente separati da virgola) nel file <span className="mono">.env</span>.
            </p>
          </section>

          <section className="panel glass float-in" style={{ animationDelay: '60ms' }}>
            <div className="row spread">
              <div className={`kicker ${access.full ? 'full' : ''}`}>
                {users.length}
                {access.maxUsers ? ` / ${access.maxUsers}` : ''} {users.length === 1 ? 'utente' : 'utenti'}
                {access.full ? ' · limite raggiunto' : ''}
              </div>
              <label className="search">
                <Search size={15} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca" aria-label="Cerca utente" />
              </label>
            </div>
            <div className="user-list">
              {visible.map((u) => {
                const me = u.id === user.id;
                return (
                  <div key={u.id} className={`user-row ${u.blocked ? 'blocked' : ''}`}>
                    <span className="avatar">{u.username.slice(0, 1)}</span>
                    <div className="user-main">
                      <div className="row" style={{ gap: '0.4rem' }}>
                        <b>{u.username}</b>
                        {me && <span className="tag">tu</span>}
                        {u.isAdmin && <span className="tag admin">admin</span>}
                        {u.blocked && <span className="tag bad">bloccato</span>}
                      </div>
                      <small className="faint">
                        iscritto {fmtDate(u.createdAt)} · ultimo accesso {fmtDate(u.lastLogin)} · {u.games}{' '}
                        {u.games === 1 ? 'partita' : 'partite'}
                      </small>
                    </div>
                    <div className="user-actions">
                      <button className="icon-btn sm" title="Reimposta password" onClick={() => setPending({ kind: 'reset', user: u })}>
                        <KeyRound size={15} />
                      </button>
                      <button
                        className="icon-btn sm"
                        title={u.isAdmin ? (u.fixedAdmin ? 'Admin da configurazione' : 'Togli admin') : 'Rendi admin'}
                        disabled={me || u.fixedAdmin}
                        onClick={() => setPending({ kind: 'admin', user: u })}
                      >
                        {u.isAdmin ? <ShieldOff size={15} /> : <Shield size={15} />}
                      </button>
                      <button
                        className="icon-btn sm"
                        title={u.blocked ? 'Sblocca' : 'Blocca'}
                        disabled={me}
                        onClick={() => setPending({ kind: 'block', user: u })}
                      >
                        {u.blocked ? <Unlock size={15} /> : <Ban size={15} />}
                      </button>
                      <button
                        className="icon-btn sm danger"
                        title="Elimina"
                        disabled={me}
                        onClick={() => setPending({ kind: 'delete', user: u })}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
              {visible.length === 0 && <div className="empty">Nessun utente trovato.</div>}
            </div>
          </section>
        </div>
      </main>

      {pending &&
        (() => {
          const [title, text, label] = confirmText[pending.kind](pending.user);
          return (
            <ConfirmDialog
              title={title}
              text={text}
              confirmLabel={label}
              danger={pending.kind === 'delete' || (pending.kind === 'block' && !pending.user.blocked)}
              onCancel={() => setPending(null)}
              onConfirm={() => void run()}
            />
          );
        })()}

      {secret && (
        <Modal
          kicker={secret.created ? 'Utente creato' : 'Password reimpostata'}
          title={secret.username}
          onClose={() => setSecret(null)}
          actions={
            <button className="btn primary" onClick={() => setSecret(null)}>
              Fatto
            </button>
          }
        >
          <p>Password temporanea: comunicala all’utente. Non verrà mostrata di nuovo.</p>
          <div className="secret well">
            <span className="mono">{secret.password}</span>
            <button
              className="icon-btn sm"
              title="Copia"
              onClick={() => {
                void navigator.clipboard?.writeText(secret.password);
                showToast('Password copiata.');
              }}
            >
              <Copy size={15} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
