import { useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { Icon } from './components/ui.tsx';
import { StoreProvider } from './lib/store.tsx';
import { Dados } from './pages/Dados.tsx';
import { Lista } from './pages/Lista.tsx';
import { PartidoPerfil } from './pages/PartidoPerfil.tsx';
import { Partidos } from './pages/Partidos.tsx';
import { Perfil } from './pages/Perfil.tsx';
import { Quiz } from './pages/Quiz.tsx';

function TemaToggle() {
  const [tema, setTema] = useState(document.documentElement.dataset.theme ?? 'escuro');
  const alternar = () => {
    const proximo = tema === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.dataset.theme = proximo;
    try {
      localStorage.setItem('tema', proximo);
    } catch {
      // sem armazenamento disponível, o tema vale só nesta sessão
    }
    setTema(proximo);
  };
  return (
    <button className="btn-icone" onClick={alternar} aria-label={`Ativar modo ${tema === 'escuro' ? 'claro' : 'escuro'}`}>
      <Icon name={tema === 'escuro' ? 'sun' : 'moon'} />
    </button>
  );
}

export function App() {
  const [menuAberto, setMenuAberto] = useState(false);
  return (
    <BrowserRouter>
      <header className="topo">
        <div className="topo-int">
          <NavLink to="/" className="marca" onClick={() => setMenuAberto(false)}>
            <img className="marca-img" src="/capivara.png" alt="" /> Capivara Política
          </NavLink>
          <nav className={menuAberto ? 'aberto' : ''} onClick={() => setMenuAberto(false)}>
            <NavLink to="/" end>
              Candidatos
            </NavLink>
            <NavLink to="/partidos">Partidos</NavLink>
            <NavLink to="/quiz">Meu perfil</NavLink>
            <NavLink to="/dados">Dados</NavLink>
          </nav>
          <TemaToggle />
          <button
            className="btn-icone menu-btn"
            onClick={() => setMenuAberto(!menuAberto)}
            aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuAberto}
          >
            <Icon name={menuAberto ? 'x' : 'menu'} />
          </button>
        </div>
      </header>
      <main>
        <StoreProvider>
          <Routes>
            <Route path="/" element={<Lista />} />
            <Route path="/candidato/:id" element={<Perfil />} />
            <Route path="/partidos" element={<Partidos />} />
            <Route path="/partido/:id" element={<PartidoPerfil />} />
            <Route path="/quiz" element={<Quiz />} />
            <Route path="/dados" element={<Dados />} />
            <Route path="*" element={<p className="estado-tela">Página não encontrada.</p>} />
          </Routes>
        </StoreProvider>
      </main>
    </BrowserRouter>
  );
}
