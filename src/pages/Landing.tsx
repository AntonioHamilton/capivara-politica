import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

function useRevela<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          el.classList.add('revelado');
          obs.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function Secao({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRevela<HTMLDivElement>();
  return (
    <div ref={ref} className={`landing-revela${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  );
}

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-header-int">
          <span className="marca landing-marca">
            <img className="marca-img" src="/capivara.png" alt="" /> Capivara Política
          </span>
          <div className="landing-header-acoes">
            <Link to="/app?modo=login" className="btn texto">
              Entrar
            </Link>
            <Link to="/app?modo=registro" className="btn">
              Cadastrar
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-blob landing-blob-1" aria-hidden="true" />
          <div className="landing-blob landing-blob-2" aria-hidden="true" />
          <div className="landing-hero-texto">
            <span className="landing-selo">Eleições 2026 · Brasil</span>
            <h1>
              Entenda seu perfil político.
              <br />
              Descubra quem combina com você.
            </h1>
            <p className="landing-sub">
              Responda um quiz de 2 minutos sobre economia, costumes, segurança e instituições, e veja a compatibilidade real entre
              você e cada candidato — com fontes, propostas e polêmicas pesquisadas, sem achismo.
            </p>
            <div className="landing-cta">
              <Link to="/app?modo=registro" className="btn lg">
                Fazer meu perfil político
              </Link>
              <Link to="/app?modo=login" className="btn secundario lg">
                Já tenho conta
              </Link>
            </div>
          </div>
          <div className="landing-hero-img">
            <img src="/capivara.png" alt="Capivara Política" className="landing-capivara" />
          </div>
        </section>

        <Secao className="landing-secao landing-nome">
          <span className="landing-eyebrow">De onde veio o nome</span>
          <h2>Por que "Capivara Política"?</h2>
          <p>
            No Brasil, "fazer a capivara" de alguém é gíria pra puxar o passado da pessoa — vasculhar o que ela já disse, votou ou fez.
            É exatamente isso que o app faz com cada candidato: pesquisa votos, declarações, projetos de lei e polêmicas, sempre com
            fonte, pra você não decidir seu voto no escuro.
          </p>
        </Secao>

        <Secao className="landing-secao landing-origem">
          <span className="landing-eyebrow">Como começou</span>
          <h2>Nasceu nas eleições de 2026</h2>
          <p>
            A Capivara Política foi criada por causa das eleições de 2026, para ajudar o eleitor a decidir o voto com mais informação e
            menos ruído. O foco inicial foi em Sergipe: os candidatos a governador, deputado federal e deputado estadual do estado, com
            a ideia de crescer para outros estados depois.
          </p>
        </Secao>

        <Secao className="landing-secao landing-depoimento">
          <blockquote>
            "Fiz o quiz e finalmente entendi meu próprio perfil político — não sabia que eu pensava tão parecido com alguns candidatos e
            tão diferente de outros que eu achava que representavam o que eu penso. Em poucos minutos recebi as indicações de quem mais
            combina comigo em cada cargo."
          </blockquote>
          <span className="muted">— um eleitor usando a Capivara Política</span>
        </Secao>

        <Secao className="landing-secao">
          <span className="landing-eyebrow">O que você encontra</span>
          <h2>Tudo pra votar com mais clareza</h2>
          <div className="landing-cards">
            <div className="card landing-card">
              <h3>Quiz de compatibilidade</h3>
              <p className="muted">30 perguntas sobre economia, costumes, segurança e instituições geram seu perfil político.</p>
            </div>
            <div className="card landing-card">
              <h3>Pesquisas com fonte</h3>
              <p className="muted">Votos, propostas e polêmicas de cada candidato e partido, sempre com link pra fonte original.</p>
            </div>
            <div className="card landing-card">
              <h3>Comparação por cargo</h3>
              <p className="muted">Veja o ranking de compatibilidade entre os candidatos do mesmo cargo e estado.</p>
            </div>
            <div className="card landing-card">
              <h3>Sua colinha pra votar</h3>
              <p className="muted">No dia da eleição, veja de um jeito rápido quem mais combina com você em cada cargo.</p>
            </div>
          </div>
        </Secao>

        <Secao className="landing-secao landing-final">
          <h2>Pronto pra descobrir seu perfil?</h2>
          <Link to="/app?modo=registro" className="btn lg">
            Começar agora
          </Link>
        </Secao>
      </main>

      <footer className="landing-footer">
        <span className="muted">Capivara Política · Eleições 2026</span>
      </footer>
    </div>
  );
}
