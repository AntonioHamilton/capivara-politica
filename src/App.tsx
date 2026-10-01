import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { Avatar, Icon } from './components/ui.tsx';
import { AuthGate, useAuth } from './lib/auth.tsx';
import { quizCompleto } from './lib/scoring.ts';
import { useStore } from './lib/store.tsx';
import { Colinha } from './pages/Colinha.tsx';
import { ColinhaPublica } from './pages/ColinhaPublica.tsx';
import { Conta } from './pages/Conta.tsx';
import { Dados } from './pages/Dados.tsx';
import { EsqueciSenha } from './pages/EsqueciSenha.tsx';
import { Feedback } from './pages/Feedback.tsx';
import { Landing } from './pages/Landing.tsx';
import { Lista } from './pages/Lista.tsx';
import { PartidoPerfil } from './pages/PartidoPerfil.tsx';
import { Partidos } from './pages/Partidos.tsx';
import { Perfil } from './pages/Perfil.tsx';
import { Quiz } from './pages/Quiz.tsx';
import { RedefinirSenha } from './pages/RedefinirSenha.tsx';

function ThemeToggle() {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme ?? 'dark');
  const alternar = () => {
    const proximo = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = proximo;
    try {
      localStorage.setItem('theme', proximo);
    } catch {
      // sem armazenamento disponível, o tema vale só nesta sessão
    }
    setTheme(proximo);
  };
  return (
    <button className="btn-icone" onClick={alternar} aria-label={`Ativar modo ${theme === 'dark' ? 'light' : 'dark'}`}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fechar = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', fechar);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', fechar);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-menu-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="true" aria-expanded={open}>
        <Avatar src={null} nome={user.username} size={32} />
        <span className="user-menu-nome">{user.username}</span>
      </button>
      {open && (
        <div className="user-menu-dropdown" role="menu">
          <div className="user-menu-cabecalho">
            <Avatar src={null} nome={user.username} size={36} />
            <span>
              <strong>{user.username}</strong>
              {user.isAdmin && (
                <>
                  {' '}
                  <span className="selo pequeno">admin</span>
                </>
              )}
            </span>
          </div>
          <NavLink to="/app/quiz" role="menuitem" onClick={() => setOpen(false)}>
            Perfil
          </NavLink>
          <NavLink to="/app/conta" role="menuitem" onClick={() => setOpen(false)}>
            Conta
          </NavLink>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

function TopContent({ openMenu, setOpenMenu }: { openMenu: boolean; setOpenMenu: (v: boolean) => void }) {
  const { user } = useAuth();
  const { data } = useStore();
  return (
    <header className="topo">
      <div className="topo-int">
        <NavLink to="/app" className="marca" onClick={() => setOpenMenu(false)}>
          <img className="marca-img" src="/capivara.png" alt="" /> Capivara Política
        </NavLink>
        <nav className={openMenu ? 'aberto' : ''} onClick={() => setOpenMenu(false)}>
          <NavLink to="/app" end>
            Candidatos
          </NavLink>
          <NavLink to="/app/partidos">Partidos</NavLink>
          {quizCompleto(data.quiz) && <NavLink to="/app/colinha">Colinha</NavLink>}
          {quizCompleto(data.quiz) && <NavLink to="/app/feedback">Feedback</NavLink>}
          {user.isAdmin && <NavLink to="/app/dados">Dados</NavLink>}
        </nav>
        <ThemeToggle />
        <UserMenu />
        <button
          className="btn-icone menu-btn"
          onClick={() => setOpenMenu(!openMenu)}
          aria-label={openMenu ? 'Fechar menu' : 'Abrir menu'}
          aria-expanded={openMenu}
        >
          <Icon name={openMenu ? 'x' : 'menu'} />
        </button>
      </div>
    </header>
  );
}

function Content() {
  const [openMenu, setOpenMenu] = useState(false);
  const { user } = useAuth();
  return (
    <>
      <TopContent openMenu={openMenu} setOpenMenu={setOpenMenu} />
      <main>
        <Routes>
          <Route path="/" element={<Lista />} />
          <Route path="/candidato/:id" element={<Perfil />} />
          <Route path="/partidos" element={<Partidos />} />
          <Route path="/partido/:id" element={<PartidoPerfil />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/conta" element={<Conta />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/colinha" element={<Colinha />} />
          <Route
            path="/dados"
            element={user.isAdmin ? <Dados /> : <p className="estado-tela">Apenas o administrador pode acessar esta página.</p>}
          />
          <Route path="*" element={<p className="estado-tela">Página não encontrada.</p>} />
        </Routes>
      </main>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
        <Route path="/colinha/:token" element={<ColinhaPublica />} />
        <Route
          path="/app/*"
          element={
            <AuthGate>
              <Content />
            </AuthGate>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
