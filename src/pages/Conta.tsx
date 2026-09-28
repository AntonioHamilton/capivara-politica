import { useState } from 'react';
import type { FormEvent } from 'react';
import { mudarSenha, useAuth } from '../lib/auth.tsx';

export function Conta() {
  const { user } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    setEnviando(true);
    try {
      await mudarSenha(senhaAtual, novaSenha);
      setSenhaAtual('');
      setNovaSenha('');
      setMsg('Senha alterada com sucesso.');
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="pagina estreita">
      <div className="pagina-topo">
        <h1>Conta</h1>
      </div>

      <section className="card">
        <h3>Dados da conta</h3>
        <p className="muted">
          Usuário: <strong>{user.username}</strong>
          <br />
          Email: <strong>{user.email ?? 'não cadastrado'}</strong>
        </p>
      </section>

      <section className="card">
        <h3>Alterar senha</h3>
        <form className="form" onSubmit={onSubmit}>
          <div className="campo">
            <label>Senha atual</label>
            <input
              required
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="campo">
            <label>Nova senha</label>
            <input
              required
              type="password"
              minLength={6}
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              autoComplete="new-password"
            />
            <small className="muted">Pelo menos 6 caracteres.</small>
          </div>
          {erro && <p className="erro">{erro}</p>}
          {msg && <p className="aviso-msg">{msg}</p>}
          <button className="btn" type="submit" disabled={enviando}>
            {enviando ? 'Salvando...' : 'Alterar senha'}
          </button>
        </form>
      </section>
    </div>
  );
}
