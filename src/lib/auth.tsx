import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loading } from '../components/ui.tsx';
import { api } from './api.ts';
import { invalidarCache } from './cache.ts';
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
    invalidarCache();
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
      invalidarCache();
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

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

// ícone oficial do Google (multicolor) — só é usado aqui, no botão de login
function IconeGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.806.5405-1.8368.8618-3.0477.8618-2.3436 0-4.3282-1.5832-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9641 10.71c-.18-.5405-.2823-1.1182-.2823-1.71s.1023-1.1695.2823-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9641 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5814-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6564 3.5795 9 3.5795z"
      />
    </svg>
  );
}

// botão "Entrar com o Google" — só aparece se VITE_GOOGLE_CLIENT_ID estiver configurado. Usa o
// Google Identity Services (script carregado no index.html) no modo "token client": o botão é
// nosso, do jeito que quisermos, e o clique é que abre o popup do Google. O access token que
// volta é conferido no servidor em /api/auth/google (via userinfo do Google).
function BotaoGoogle({ onEntrar }: { onEntrar: (u: User) => void }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const clienteRef = useRef<{ requestAccessToken: () => void } | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelado = false;

    const tentar = () => {
      if (cancelado) return;
      if (!window.google?.accounts?.oauth2) {
        setTimeout(tentar, 100);
        return;
      }
      clienteRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'openid email profile',
        callback: async (resp) => {
          if (resp.error || !resp.access_token) return;
          try {
            const u = await enviar<User>('/api/auth/google', { accessToken: resp.access_token });
            onEntrar(u);
          } catch (e) {
            console.error('Falha no login com Google:', e);
          }
        },
      });
      setPronto(true);
    };
    tentar();

    return () => {
      cancelado = true;
    };
  }, [clientId, onEntrar]);

  if (!clientId) return null;
  return (
    <>
      <div className="login-divisor">
        <span>ou</span>
      </div>
      <button type="button" className="btn-google" disabled={!pronto} onClick={() => clienteRef.current?.requestAccessToken()}>
        <span className="btn-google-badge">
          <IconeGoogle />
        </span>
        Entrar com o Google
      </button>
    </>
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
        <Link to="/" className="marca login-marca">
          <img className="marca-img" src="/capivara.png" alt="" />
          Capivara Política
        </Link>
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
        <BotaoGoogle onEntrar={onEntrar} />
      </form>
    </div>
  );
}
