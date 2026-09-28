import { createContext, useContext, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loading } from '../components/ui.tsx';
import { api } from './api.ts';
import { StoreProvider } from './store.tsx';
import type { Data } from './types.ts';

export interface User {
  id: number;
  username: string;
  email: string | null;
  isAdmin: boolean;
}

interface AuthCtx {
  user: User;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthGate ausente');
  return c;
}

async function enviar<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? 'Erro');
  return j;
}

export const pedirRecuperacao = (email: string) => enviar<{ ok: true }>('/api/auth/forgot-password', { email });
export const redefinirSenha = (token: string, novaSenha: string) => enviar<{ ok: true }>('/api/auth/reset-password', { token, novaSenha });
export const mudarSenha = (senhaAtual: string, novaSenha: string) => enviar<{ ok: true }>('/api/auth/change-password', { senhaAtual, novaSenha });

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [data, setData] = useState<Data | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarLoading, setMostrarLoading] = useState(true);

  const entrar = (u: User | null) => {
    setUser(u);
    if (!u) return;
    setMostrarLoading(true);
    api
      .data()
      .then(setData)
      .catch((e: Error) => setErro(e.message));
  };

  useEffect(() => {
    let ativo = true;
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((u: User | null) => ativo && entrar(u));
    return () => {
      ativo = false;
    };
  }, []);

  const pronto = user !== undefined && (!user || data != null || erro != null);

  if (erro) return <p className="estado-tela">Não foi possível carregar os dados: {erro}</p>;
  if (mostrarLoading) return <Loading pronto={pronto} onCompleto={() => setMostrarLoading(false)} />;
  if (!user) return <LoginPage onEntrar={entrar} />;

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST' }).finally(() => {
      setUser(null);
      setData(null);
    });
  };

  return (
    <Ctx.Provider value={{ user, logout }}>
      <StoreProvider dataInicial={data!}>{children}</StoreProvider>
    </Ctx.Provider>
  );
}

function LoginPage({ onEntrar }: { onEntrar: (u: User) => void }) {
  const [params] = useSearchParams();
  const [modo, setModo] = useState<'login' | 'registro'>(params.get('modo') === 'registro' ? 'registro' : 'login');
  const [identificador, setIdentificador] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const u = await enviar<User>(
        modo === 'login' ? '/api/auth/login' : '/api/auth/register',
        modo === 'login' ? { identificador, password } : { username, email, password },
      );
      onEntrar(u);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="tela-login">
      <form className="card login-card" onSubmit={onSubmit}>
        <div className="marca login-marca">
          <img className="marca-img" src="/capivara.png" alt="" />
          Capivara Política
        </div>
        <h2>{modo === 'login' ? 'Entrar' : 'Criar conta'}</h2>
        {modo === 'login' ? (
          <div className="campo">
            <label>Usuário ou email</label>
            <input required autoFocus value={identificador} onChange={(e) => setIdentificador(e.target.value)} autoComplete="username" />
          </div>
        ) : (
          <>
            <div className="campo">
              <label>Usuário</label>
              <input required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            </div>
            <div className="campo">
              <label>Email</label>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
          </>
        )}
        <div className="campo">
          <label>Senha</label>
          <input
            required
            type="password"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
          />
          {modo === 'registro' && <small className="muted">Pelo menos 6 caracteres.</small>}
        </div>
        {modo === 'login' && (
          <Link to="/esqueci-senha" className="btn texto pequeno esqueci-link">
            Esqueci minha senha
          </Link>
        )}
        {erro && <p className="erro">{erro}</p>}
        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? 'Aguarde...' : modo === 'login' ? 'Entrar' : 'Criar conta'}
        </button>
        <button
          type="button"
          className="btn secundario"
          onClick={() => {
            setModo(modo === 'login' ? 'registro' : 'login');
            setErro(null);
          }}
        >
          {modo === 'login' ? 'Cadastrar' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  );
}
