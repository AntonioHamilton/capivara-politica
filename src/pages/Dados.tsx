import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api.ts';
import type { UsuarioInfo } from '../lib/api.ts';
import { useStore } from '../lib/store.tsx';

function Usuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioInfo[] | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = () => api.listUsers().then(setUsuarios);
  useEffect(() => {
    carregar();
  }, []);

  const criarAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    setMsg(null);
    setEnviando(true);
    try {
      await api.createAdmin({ username, email, password });
      setUsername('');
      setEmail('');
      setPassword('');
      setMsg('Novo admin criado.');
      await carregar();
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const promover = async (id: number) => {
    if (!window.confirm('Tornar este usuário administrador?')) return;
    await api.promoteUser(id);
    await carregar();
  };

  return (
    <section className="card">
      <h3>Usuários</h3>
      <p className="muted">Quem é admin pode gerenciar candidatos, partidos e pesquisas.</p>
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
                <td>{u.email ?? '—'}</td>
                <td>{u.isAdmin ? 'sim' : 'não'}</td>
                <td>
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

      <h4>Criar novo admin</h4>
      <form onSubmit={criarAdmin}>
        <div className="campo">
          <label>Usuário</label>
          <input required value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
        </div>
        <div className="campo">
          <label>Email</label>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </div>
        <div className="campo">
          <label>Senha</label>
          <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
        {erro && <p className="erro">{erro}</p>}
        {msg && <p className="aviso-msg">{msg}</p>}
        <button className="btn" type="submit" disabled={enviando}>
          {enviando ? 'Criando...' : 'Criar admin'}
        </button>
      </form>
    </section>
  );
}

export function Dados() {
  const { data, refresh } = useStore();
  const [msg, setMsg] = useState<string | null>(null);

  const importar = async (file: File) => {
    if (!window.confirm('Importar vai SUBSTITUIR todos os dados atuais (candidatos, partidos, pesquisas e quiz). Continuar?')) return;
    try {
      await api.importAll(JSON.parse(await file.text()));
      await refresh();
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
            {data.candidates.length} candidatos · {data.parties.length} partidos · {data.research.length} pesquisas salvas
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
