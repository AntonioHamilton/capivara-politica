import { useState } from 'react';
import { api } from '../lib/api.ts';
import { lerPesquisa, promptCorrecao } from '../lib/prompt.ts';
import { useStore } from '../lib/store.tsx';
import { Icon, Modal } from './ui.tsx';

interface Props {
  tipo: 'candidato' | 'partido';
  entidadeId: number;
  titulo: string;
  prompt: string;
  onClose: () => void;
  onSaved?: () => void;
}

export function ResearchModal({ tipo, entidadeId, titulo, prompt, onClose, onSaved }: Props) {
  const { refresh } = useStore();
  const [texto, setTexto] = useState('');
  const [erros, setErros] = useState<string[]>([]);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const copiar = async (valor: string, chave: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado(null);
    }
  };

  const salvar = async () => {
    const r = tipo === 'candidato' ? lerPesquisa('candidato', texto) : lerPesquisa('partido', texto);
    if (!r.ok) {
      setErros(r.erros);
      return;
    }
    setErros([]);
    setSalvando(true);
    try {
      await api.saveResearch(tipo, entidadeId, r.dados);
      if (tipo === 'partido') await refresh();
      onSaved?.();
      onClose();
    } catch (e) {
      setErros([(e as Error).message]);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo={`Pesquisar: ${titulo}`} onClose={onClose} largo>
      <div className="passo">
        <div className="passo-topo">
          <span className="passo-num">1</span>
          <div>
            <strong>Copie o prompt e cole na sua IA</strong>
            <p className="muted">Use uma IA com busca na web ligada. Ela vai devolver um JSON.</p>
          </div>
          <button className="btn pequeno" onClick={() => copiar(prompt, 'prompt')}>
            <Icon name="copy" size={15} /> {copiado === 'prompt' ? 'Copiado' : 'Copiar prompt'}
          </button>
        </div>
        <textarea className="codigo" readOnly rows={7} value={prompt} onFocus={(e) => e.currentTarget.select()} />
      </div>

      <div className="passo">
        <div className="passo-topo">
          <span className="passo-num">2</span>
          <div>
            <strong>Cole aqui a resposta da IA</strong>
            <p className="muted">Pode colar com ou sem o bloco de código. O app valida antes de salvar.</p>
          </div>
        </div>
        <textarea
          className="codigo"
          rows={8}
          value={texto}
          placeholder='{ "tipo": "...", ... }'
          onChange={(e) => setTexto(e.target.value)}
        />
        {erros.length > 0 && (
          <div className="caixa-erro">
            <strong>A resposta não passou na validação:</strong>
            <ul>
              {erros.slice(0, 12).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {erros.length > 12 && <li>e mais {erros.length - 12} problemas</li>}
            </ul>
            <button className="btn secundario pequeno" onClick={() => copiar(promptCorrecao(erros), 'correcao')}>
              <Icon name="copy" size={15} /> {copiado === 'correcao' ? 'Copiado' : 'Copiar pedido de correção'}
            </button>
          </div>
        )}
      </div>

      <div className="acoes">
        <button className="btn secundario" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn" disabled={!texto.trim() || salvando} onClick={salvar}>
          {salvando ? 'Salvando...' : 'Validar e salvar'}
        </button>
      </div>
    </Modal>
  );
}
