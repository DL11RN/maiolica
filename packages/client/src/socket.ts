import type { GameAction, GameView } from '@maiolica/shared';
import { io, type Socket } from 'socket.io-client';
import type { GameSummary } from './api';
import { useGame, type ChatMessage } from './store';

type Ack = { ok: boolean; error?: string };

let socket: Socket | null = null;

export function connectGame(gameId: string, onClosed: () => void) {
  disconnectGame();
  // Prima il WebSocket; se un proxy non lo inoltra (per esempio NPM senza "Websockets Support")
  // si ripiega sul long-polling HTTP invece di restare bloccati sul ricollegamento.
  const s = io({ withCredentials: true, transports: ['websocket', 'polling'], tryAllTransports: true });
  socket = s;
  const store = useGame.getState();
  s.on('connect', () => {
    s.emit('join', gameId, (res: Ack) => {
      if (!res.ok) {
        store.showToast(res.error ?? 'Impossibile entrare nella partita.');
        onClosed();
      }
    });
  });
  s.on('state', ({ game, view, serverNow }: { game: GameSummary; view: GameView; serverNow?: number }) =>
    useGame.getState().setState(game, view, serverNow),
  );
  s.on('chat:history', (m: ChatMessage[]) => useGame.getState().setMessages(m));
  s.on('chat', (m: ChatMessage) => useGame.getState().addMessage(m));
  s.on('rematch', (r: { id: string; by: string }) => useGame.getState().setRematchOffer(r));
  s.on('closed', () => {
    useGame.getState().showToast('La partita è stata chiusa.');
    onClosed();
  });
  s.on('connect_error', (err: Error) => {
    if (err.message === 'unauthorized') {
      useGame.getState().showToast('Sessione scaduta o non valida: accedi di nuovo.');
      s.disconnect();
      onClosed();
      return;
    }
    useGame.getState().showToast('Connessione al server persa, riprovo…');
  });
}

export function disconnectGame() {
  socket?.disconnect();
  socket = null;
  useGame.getState().reset();
}

function emit(event: string, payload: unknown): Promise<Ack> {
  return new Promise((resolve) => {
    if (!socket?.connected) return resolve({ ok: false, error: 'Non connesso al server.' });
    socket.timeout(8000).emit(event, payload, (err: Error | null, res: Ack) =>
      resolve(err ? { ok: false, error: 'Il server non risponde.' } : res),
    );
  });
}

export async function sendAction(action: GameAction): Promise<boolean> {
  const res = await emit('action', action);
  if (!res.ok) useGame.getState().showToast(res.error ?? 'Azione non valida.');
  return res.ok;
}

export async function sendChat(text: string): Promise<boolean> {
  const res = await emit('chat', text);
  if (!res.ok) useGame.getState().showToast(res.error ?? 'Messaggio non inviato.');
  return res.ok;
}
