import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import type { UsuarioInfo } from '../lib/api.ts';

function NovoAdminForm({ onCriado, onClose }: { onCriado: () => void; onClose: () => void }) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const criarAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.createAdmin({ username, email, password });
      onCriado();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className="form subform" onSubmit={criarAdmin}>
      <div className="campo">
        <label>Usuário</label>
        <input required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
      </div>
      <div className="campo">
        <label>Email</label>
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </div>
      <div className="campo">
        <label>Senha</label>
        <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <small className="muted">Pelo menos 6 caracteres.</small>
      </div>
      {erro && <p className="erro">{erro}</p>}
      <div className="acoes">
        <button type="button" className="btn texto" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? 'Criando...' : 'Criar admin'}
        </button>
      </div>
    </form>
  );
}

function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioInfo[] | null>(null);
  const [criando, setCriando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const carregar = () => api.listUsers().then(setUsuarios);
  useEffect(() => {
    carregar();
  }, []);

  const promover = async (id: number) => {
    if (!window.confirm('Tornar este usuário administrador?')) return;
    await api.promoteUser(id);
    await carregar();
  };

  return (
    <section className="card">
      <div className="pagina-topo">
        <div>
          <h3>Usuários</h3>
          <p className="muted">Quem é admin pode gerenciar candidatos, partidos e pesquisas.</p>
        </div>
        {!criando && (
          <button type="button" className="btn secundario" onClick={() => setCriando(true)}>
            <Icon name="plus" /> Criar admin
          </button>
        )}
      </div>

      {criando && (
        <NovoAdminForm
          onClose={() => setCriando(false)}
          onCriado={() => {
            setCriando(false);
            setMsg('Novo admin criado.');
            carregar();
          }}
        />
      )}
      {msg && <p className="aviso-msg">{msg}</p>}

      {usuarios && (
        <table className="tabela-simples">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Email</th>
              <th>Admin</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td className="muted">{u.email ?? '—'}</td>
                <td>{u.isAdmin ? <span className="selo pequeno">admin</span> : <span className="selo-neutro">usuário</span>}</td>
                <td className="tabela-acao">
                  {!u.isAdmin && (
                    <button type="button" className="btn texto pequeno" onClick={() => promover(u.id)}>
                      Tornar admin
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function Dados() {
  const [msg, setMsg] = useState<string | null>(null);
  const [contagens, setContagens] = useState<{ candidatos: number; pesquisas: number; partidos: number } | null>(null);

  useEffect(() => {
    api.contagens().then(setContagens);
  }, []);

  const importar = async (file: File) => {
    if (!window.confirm('Importar vai SUBSTITUIR todos os dados atuais (candidatos, partidos, pesquisas e quiz). Continuar?')) return;
    try {
      await api.importAll(JSON.parse(await file.text()));
      api.contagens().then(setContagens);
      setMsg('Backup importado com sucesso.');
    } catch (e) {
      setMsg(`Não foi possível importar: ${(e as Error).message}`);
    }
  };

  return (
    <div className="pagina estreita">
      <div className="pagina-topo">
        <div>
          <h1>Dados</h1>
          <p className="muted">
            {contagens ? `${contagens.candidatos} candidatos · ` : ''}
            {contagens ? `${contagens.partidos} partidos` : ''}
            {contagens ? ` · ${contagens.pesquisas} pesquisas salvas` : ''}
          </p>
        </div>
      </div>

      <section className="card">
        <h3>Exportar</h3>
        <p className="muted">Baixa um arquivo JSON com tudo o que você salvou, incluindo fotos e logos.</p>
        <a className="btn" href="/api/export" download>
          Exportar dados
        </a>
      </section>

      <section className="card">
        <h3>Importar</h3>
        <p className="muted">Restaura um backup gerado pelo botão acima. Os dados atuais são substituídos.</p>
        <label className="btn secundario">
          Escolher arquivo de backup
          <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
        </label>
        {msg && <p className="aviso-msg">{msg}</p>}
      </section>

      <Usuarios />
    </div>
  );
}
