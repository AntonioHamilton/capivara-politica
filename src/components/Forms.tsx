import { useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../lib/api.ts';
import { useStore } from '../lib/store.tsx';
import { CARGOS, UFS } from '../lib/types.ts';
import type { Candidate, Cargo, Party } from '../lib/types.ts';
import { ImagePicker, Modal } from './ui.tsx';

const NOVO = 'novo';

export function PartyForm({ party, onClose, onSaved }: { party?: Party; onClose: () => void; onSaved?: (id: number) => void }) {
  const { refresh } = useStore();
  const [sigla, setSigla] = useState(party?.sigla ?? '');
  const [nome, setNome] = useState(party?.nome ?? '');
  const [logo, setLogo] = useState<string | null>(party?.logo ?? null);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    try {
      let id = party?.id;
      if (party) await api.updateParty(party.id, { sigla, nome, logo });
      else id = (await api.addParty({ sigla, nome, logo })).id;
      await refresh();
      onSaved?.(id!);
      onClose();
    } catch (err) {
      setErro((err as Error).message);
    }
  };

  return (
    <Modal titulo={party ? 'Editar partido' : 'Novo partido'} onClose={onClose}>
      <form onSubmit={salvar} className="form">
        <div className="campo">
          <label>Sigla</label>
          <input required value={sigla} onChange={(e) => setSigla(e.target.value)} placeholder="Ex.: PL" />
        </div>
        <div className="campo">
          <label>Nome completo</label>
          <input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Partido Liberal" />
        </div>
        <ImagePicker rotulo="Logo do partido" value={logo} onChange={setLogo} nome={sigla} />
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes">
          <button type="button" className="btn secundario" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn">
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CandidateForm({
  candidate,
  onClose,
  onSaved,
}: {
  candidate?: Candidate;
  onClose: () => void;
  onSaved?: (id: number) => void;
}) {
  const { data, refresh } = useStore();
  const [nome, setNome] = useState(candidate?.nome ?? '');
  const [cargo, setCargo] = useState<Cargo>(candidate?.cargo ?? 'deputado_federal');
  const [uf, setUf] = useState(candidate && candidate.uf !== 'BR' ? candidate.uf : '');
  const [partido, setPartido] = useState<string>(candidate?.partyId != null ? String(candidate.partyId) : '');
  const [novaSigla, setNovaSigla] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [novoLogo, setNovoLogo] = useState<string | null>(null);
  const [foto, setFoto] = useState<string | null>(candidate?.foto ?? null);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro(null);
    try {
      let partyId: number | null = partido ? Number(partido) : null;
      if (partido === NOVO) {
        partyId = (await api.addParty({ sigla: novaSigla, nome: novoNome, logo: novoLogo })).id;
      }
      const input = { nome, cargo, uf: cargo === 'presidente' ? 'BR' : uf, partyId, foto };
      let id = candidate?.id;
      if (candidate) await api.updateCandidate(candidate.id, input);
      else id = (await api.addCandidate(input)).id;
      await refresh();
      onSaved?.(id!);
      onClose();
    } catch (err) {
      setErro((err as Error).message);
    }
  };

  return (
    <Modal titulo={candidate ? 'Editar candidato' : 'Adicionar candidato'} onClose={onClose}>
      <form onSubmit={salvar} className="form">
        <div className="campo">
          <label>Nome</label>
          <input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de urna ou nome público" />
        </div>
        <div className="grade-2">
          <div className="campo">
            <label>Cargo</label>
            <select value={cargo} onChange={(e) => setCargo(e.target.value as Cargo)}>
              {Object.entries(CARGOS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {cargo !== 'presidente' && (
            <div className="campo">
              <label>Estado</label>
              <select required value={uf} onChange={(e) => setUf(e.target.value)}>
                <option value="">Selecione</option>
                {Object.entries(UFS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="campo">
          <label>Partido</label>
          <select required value={partido} onChange={(e) => setPartido(e.target.value)}>
            <option value="">Selecione</option>
            {data.parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sigla} - {p.nome}
              </option>
            ))}
            <option value={NOVO}>+ Novo partido</option>
          </select>
        </div>
        {partido === NOVO && (
          <div className="subform">
            <div className="grade-2">
              <div className="campo">
                <label>Sigla</label>
                <input required value={novaSigla} onChange={(e) => setNovaSigla(e.target.value)} placeholder="Ex.: PL" />
              </div>
              <div className="campo">
                <label>Nome completo</label>
                <input required value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex.: Partido Liberal" />
              </div>
            </div>
            <ImagePicker rotulo="Logo do partido" value={novoLogo} onChange={setNovoLogo} nome={novaSigla} />
          </div>
        )}
        <ImagePicker rotulo="Foto do candidato" value={foto} onChange={setFoto} nome={nome} />
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes">
          <button type="button" className="btn secundario" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn">
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
