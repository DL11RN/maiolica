import type { User } from '../api';
import { GuideContent, GuideToc } from '../guide/Guide';
import { Backdrop } from '../ui/Backdrop';
import { TopNav } from '../ui/TopNav';

export function GuidePage({ user, onLogout }: { user: User | null; onLogout?: () => void }) {
  return (
    <div className="page">
      <Backdrop />
      <TopNav active="guida" user={user} onLogout={onLogout} />
      <main className="page-body stack">
        <div>
          <div className="kicker">Regole della bottega</div>
          <h1>Come si gioca a Maiolica</h1>
          <p className="muted">Le regole in breve, con esempi. Durante una partita le trovi anche dal pulsante con il libro.</p>
        </div>
        <div className="guide-layout">
          <nav className="guide-toc glass float-in" aria-label="Indice della guida">
            <GuideToc />
          </nav>
          <article className="glass float-in" style={{ animationDelay: '60ms' }}>
            <GuideContent />
          </article>
        </div>
      </main>
    </div>
  );
}
