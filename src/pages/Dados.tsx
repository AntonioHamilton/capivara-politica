import { useState } from 'react';
import { api } from '../lib/api.ts';
import { useStore } from '../lib/store.tsx';

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
    </div>
  );
}
