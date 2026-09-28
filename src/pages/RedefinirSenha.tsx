import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { redefinirSenha } from '../lib/auth.tsx';

export function RedefinirSenha() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [novaSenha, setNovaSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await redefinirSenha(token, novaSenha);
      setFeito(true);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="tela-login">
      <div className="card login-card">
        <div className="marca login-marca">
          <img className="marca-img" src="/capivara.png" alt="" />
          Capivara Política
        </div>
        <h2>Redefinir senha</h2>
        {!token ? (
          <p className="erro">Link inválido. Peça uma nova recuperação de senha na tela de login.</p>
        ) : feito ? (
          <>
            <p className="muted">Senha redefinida com sucesso. Você já pode entrar com a nova senha.</p>
            <Link to="/" className="btn">
              Ir para o login
            </Link>
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="campo">
              <label>Nova senha</label>
              <input
                required
                autoFocus
                type="password"
                minLength={6}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                autoComplete="new-password"
              />
              <small className="muted">Pelo menos 6 caracteres.</small>
            </div>
            {erro && <p className="erro">{erro}</p>}
            <button className="btn" type="submit" disabled={enviando}>
              {enviando ? 'Salvando...' : 'Redefinir senha'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
