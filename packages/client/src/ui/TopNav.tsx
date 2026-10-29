import { BookOpen, KeyRound, Store, LogOut, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { User } from '../api';
import { Brand } from './Brand';
import { PasswordDialog } from './PasswordDialog';

export type NavKey = 'bottega' | 'guida' | 'admin';

/** Barra di navigazione sospesa in alto, comune a bottega, guida e amministrazione. */
export function TopNav({ active, user, onLogout }: { active: NavKey; user?: User | null; onLogout?: () => void }) {
  const [password, setPassword] = useState(false);
  const link = (key: NavKey, href: string, label: string, Icon: typeof BookOpen) => (
    <a href={href} className={active === key ? 'active' : ''}>
      <Icon size={16} />
      {label}
    </a>
  );
  return (
    <>
      <header className="topnav glass">
        <a href="#/" className="brand-link" aria-label="Maiolica, torna alla bottega">
          <Brand size="sm" />
        </a>
        <nav>
          {link('bottega', '#/', 'Bottega', Store)}
          {link('guida', '#/guida', 'Guida', BookOpen)}
          {user?.isAdmin && link('admin', '#/admin', 'Utenti', ShieldCheck)}
        </nav>
        {user && (
          <div className="user">
            <span className="avatar" title={user.username}>
              {user.username.slice(0, 1)}
            </span>
            <span className="muted small user-name">{user.username}</span>
            <button className="icon-btn sm" onClick={() => setPassword(true)} title="Cambia password" aria-label="Cambia password">
              <KeyRound size={15} />
            </button>
            {onLogout && (
              <button className="icon-btn sm" onClick={onLogout} title="Esci" aria-label="Esci">
                <LogOut size={15} />
              </button>
            )}
          </div>
        )}
      </header>
      {password && <PasswordDialog onClose={() => setPassword(false)} />}
    </>
  );
}
