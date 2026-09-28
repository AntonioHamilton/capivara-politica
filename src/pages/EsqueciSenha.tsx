import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { pedirRecuperacao } from '../lib/auth.tsx';

export function EsqueciSenha() {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await pedirRecuperacao(email);
      setEnviado(true);
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
        <h2>Recuperar senha</h2>
        {enviado ? (
          <>
            <p className="muted">Se esse email tiver uma conta, enviamos um link para redefinir a senha. Confira sua caixa de entrada.</p>
            <Link to="/app" className="btn">
              Voltar para o login
            </Link>
          </>
        ) : (
          <form className="form" onSubmit={onSubmit}>
            <div className="campo">
              <label>Email</label>
              <input required autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            {erro && <p className="erro">{erro}</p>}
            <button className="btn" type="submit" disabled={enviando}>
              {enviando ? 'Enviando...' : 'Enviar link de recuperação'}
            </button>
            <Link to="/app" className="btn texto pequeno">
              Voltar para o login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
