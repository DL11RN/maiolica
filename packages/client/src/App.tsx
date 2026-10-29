import { Info } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, type User } from './api';
import { TileDefs } from './game/TileFace';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { GamePage } from './pages/GamePage';
import { GuidePage } from './pages/GuidePage';
import { BottegaPage } from './pages/BottegaPage';
import { useGame } from './store';
import { Backdrop } from './ui/Backdrop';

/** Routing minimale su hash: #/ bottega, #/partita/<id> partita, #/guida guida, #/admin utenti. */
function useHashRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(location.hash);
      scrollTo(0, 0);
    };
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return {
    gameId: /^#\/partita\/([\w-]+)/.exec(hash)?.[1] ?? null,
    guide: hash.startsWith('#/guida'),
    admin: hash.startsWith('#/admin'),
  };
}

/** Avviso sospeso in basso. */
export function Toast() {
  const toast = useGame((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  return (
    <div className="toast glass" role="status" key={toast.id}>
      <Info size={17} />
      {toast.text}
    </div>
  );
}

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const { gameId, guide, admin } = useHashRoute();

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  const openGame = useCallback((id: string) => {
    location.hash = `#/partita/${id}`;
  }, []);
  const leaveGame = useCallback(() => {
    location.hash = '#/';
  }, []);
  const logout = useCallback(() => {
    void api.logout().finally(() => setUser(null));
  }, []);

  let page;
  if (guide) page = <GuidePage user={user ?? null} onLogout={user ? logout : undefined} />;
  else if (user === undefined)
    page = (
      <div className="page">
        <Backdrop />
        <div className="loading">
          <div className="spinner" />
        </div>
      </div>
    );
  else if (!user) page = <AuthPage onAuth={setUser} />;
  else if (gameId) page = <GamePage key={gameId} gameId={gameId} onLeave={leaveGame} />;
  else if (admin) page = <AdminPage user={user} onLogout={logout} />;
  else page = <BottegaPage user={user} onOpen={openGame} onLogout={logout} />;

  return (
    <>
      <TileDefs />
      {page}
      <Toast />
    </>
  );
}
