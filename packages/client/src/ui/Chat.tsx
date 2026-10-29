/** Chat della partita con emoticon (reazioni veloci e tavolozza). Uguale a quella di Nepi. */
import { Check, Smile } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { sendChat } from '../socket';
import { useGame } from '../store';

/** Reazioni veloci: un tocco e partono subito. */
const QUICK = ['👍', '😂', '😮', '😡', '👏', '🎉'];
/** Tavolozza completa, da inserire nel messaggio. */
const EMOJI = [
  '😀', '😄', '😁', '😆', '😅', '🤣', '😊', '😉', '😍', '😘', '😎', '🤓', '🤔', '🤨', '😏', '😬',
  '😴', '😢', '😭', '😤', '😱', '🥳', '🤯', '🙈', '🙄', '😇', '🤞', '🙏', '💪', '👌', '✌️', '🤝',
  '❤️', '💔', '🔥', '⭐', '✨', '🏆', '🎯', '🎲', '🧩', '🏺', '🎨', '🟦', '🟨', '🟥', '⬛', '🍷',
];
/** Messaggio fatto solo di emoticon (poche): si mostra più grande. */
const onlyEmoji = (t: string) => /^(\p{Extended_Pictographic}|\uFE0F|\u200D|\s){1,12}$/u.test(t.trim());

export function Chat() {
  const messages = useGame((s) => s.messages);
  const [text, setText] = useState('');
  const [picker, setPicker] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [messages]);
  const send = (t: string) => {
    if (!t.trim()) return;
    void sendChat(t).then((ok) => ok && t === text && setText(''));
  };
  /** Inserisce l'emoticon dove c'è il cursore. */
  const insert = (emoji: string) => {
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const stop = el?.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + emoji + text.slice(stop)).slice(0, 300);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };
  return (
    <div className="chat">
      <div className="chat-list">
        {messages.length === 0 && <div className="faint small">Nessun messaggio. Saluta gli altri giocatori!</div>}
        {messages.map((m) => (
          <div key={m.id} className="msg">
            <b>{m.user}</b> <span className={onlyEmoji(m.text) ? 'big' : ''}>{m.text}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="quick-emoji">
        {QUICK.map((e) => (
          <button key={e} type="button" className="emoji-btn" onClick={() => send(e)} aria-label={`Invia ${e}`}>
            {e}
          </button>
        ))}
      </div>
      {picker && (
        <div className="emoji-grid well">
          {EMOJI.map((e) => (
            <button key={e} type="button" className="emoji-btn" onClick={() => insert(e)} aria-label={`Inserisci ${e}`}>
              {e}
            </button>
          ))}
        </div>
      )}
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <button
          type="button"
          className={`icon-btn ${picker ? 'on' : ''}`}
          onClick={() => setPicker(!picker)}
          aria-label="Emoticon"
          title="Emoticon"
        >
          <Smile size={16} />
        </button>
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Scrivi un messaggio…"
          maxLength={300}
          aria-label="Messaggio"
        />
        <button className="icon-btn" disabled={!text.trim()} aria-label="Invia">
          <Check size={16} />
        </button>
      </form>
    </div>
  );
}

