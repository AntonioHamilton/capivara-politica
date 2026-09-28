import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api.ts';
import type { FeedbackInfo } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { dataBR } from '../lib/format.ts';

function EnviarFeedback() {
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    setEnviando(true);
    try {
      await api.sendFeedback(mensagem);
      setMensagem('');
      setMsg('Sugestão enviada. Obrigado!');
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="card">
      <h3>Enviar feedback</h3>
      <p className="muted">Encontrou um problema ou tem uma sugestão? Manda pra gente.</p>
      <form className="form" onSubmit={onSubmit}>
        <div className="campo">
          <label>Mensagem</label>
          <textarea required rows={4} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
        </div>
        {erro && <p className="erro">{erro}</p>}
        {msg && <p className="aviso-msg">{msg}</p>}
        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? 'Enviando...' : 'Enviar'}
        </button>
      </form>
    </section>
  );
}

function Feedbacks() {
  const [lista, setLista] = useState<FeedbackInfo[] | null>(null);

  useEffect(() => {
    api.listFeedback().then(setLista);
  }, []);

  return (
    <section className="card">
      <h3>Feedback dos usuários</h3>
      <p className="muted">Sugestões e problemas enviados por quem usa o app.</p>
      {lista && lista.length === 0 && <p className="vazio">Nenhum feedback enviado ainda.</p>}
      {lista && lista.length > 0 && (
        <ul className="polemicas">
          {lista.map((f) => (
            <li key={f.id} className="card">
              <div className="linha">
                <strong>{f.username}</strong>
                <span className="muted pequeno-texto">{f.email ?? '—'}</span>
                <span className="muted pequeno-texto">{dataBR(f.criadoEm)}</span>
              </div>
              <p>{f.mensagem}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Feedback() {
  const { user } = useAuth();
  return (
    <div className="pagina estreita">
      <div className="pagina-topo">
        <h1>Feedback</h1>
      </div>
      <EnviarFeedback />
      {user.isAdmin && <Feedbacks />}
    </div>
  );
}
