import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

export const CHAVE_SESSAO = 'jukebox_sessao';
const SessaoContext = createContext(null);

export const useSessao = () => useContext(SessaoContext);

const lerArmazenado = () => {
  try { return localStorage.getItem(CHAVE_SESSAO); } catch { return null; }
};
const gravarArmazenado = (id) => {
  try { localStorage.setItem(CHAVE_SESSAO, id); } catch { /* modo privado: a sessão dura só esta aba */ }
};

const FILA_VAZIA = { agora_tocando: null, fila: [], total_aguardando: 0 };

// Regras da casa (vendas, prioridade, limites, aviso): o servidor avisa quando o dono muda.
const CONFIG_PADRAO = {
  vendas_abertas: true,
  max_pedidos_por_pessoa: 0,
  bloquear_repeticao_min: 0,
  prioridade: { ativa: false, extra: 2, limite: 3 },
  aviso: '',
};

export function SessaoProvider({ children }) {
  const [sessao, setSessao] = useState(null);
  const [erroConexao, setErroConexao] = useState(null);
  const [fila, setFila] = useState(FILA_VAZIA);
  // Contadores que sobem quando o servidor avisa que algo mudou; as telas refazem o GET.
  const [versoes, setVersoes] = useState({ fila: 0, top: 0, lancamentos: 0, config: 0 });
  const [config, setConfig] = useState(CONFIG_PADRAO);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const id = lerArmazenado();
      let atual = null;
      if (id) {
        try {
          atual = await api(`/sessoes/${id}`);
        } catch (erro) {
          if (erro.status !== 404) throw erro;
        }
      }
      atual ??= await api('/sessoes', { metodo: 'POST' });
      gravarArmazenado(atual.id);
      if (ativo) {
        setSessao(atual);
        setErroConexao(null);
      }
    })().catch((erro) => ativo && setErroConexao(erro.message));
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  const sessionId = sessao?.id;

  useEffect(() => {
    if (!sessionId) return undefined;
    const eventos = new EventSource(`/api/eventos?session_id=${sessionId}`);

    eventos.addEventListener('sessao', (e) => setSessao((s) => ({ ...s, ...JSON.parse(e.data) })));
    for (const nome of ['fila', 'top', 'lancamentos', 'config']) {
      eventos.addEventListener(nome, () => setVersoes((v) => ({ ...v, [nome]: v[nome] + 1 })));
    }
    eventos.addEventListener('pagamento', (e) => {
      window.dispatchEvent(new CustomEvent('jukebox:pagamento', { detail: JSON.parse(e.data) }));
    });
    // Ao reconectar (WiFi oscilou) pode ter perdido eventos: refaz tudo.
    eventos.onopen = () => {
      setVersoes((v) => ({ fila: v.fila + 1, top: v.top + 1, lancamentos: v.lancamentos + 1, config: v.config + 1 }));
      api(`/sessoes/${sessionId}`).then((s) => setSessao((atual) => ({ ...atual, ...s }))).catch(() => {});
    };

    return () => eventos.close();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;
    const carregar = () => api(`/fila/${sessionId}`).then(setFila).catch(() => {});
    carregar();
    const id = setInterval(carregar, 15_000); // rede de segurança caso o SSE caia
    return () => clearInterval(id);
  }, [sessionId, versoes.fila]);

  useEffect(() => {
    api('/config').then(setConfig).catch(() => {});
  }, [sessionId, versoes.config]);

  const adicionarMusica = useCallback(async (musica, { prioridade = false } = {}) => {
    const resposta = await api('/fila/adicionar', {
      metodo: 'POST',
      corpo: { session_id: sessionId, musica_id: musica.id, prioridade },
    });
    setSessao((s) => ({ ...s, saldo: resposta.saldo }));
    return resposta;
  }, [sessionId]);

  const valor = useMemo(() => ({
    sessao,
    saldo: sessao?.saldo ?? 0,
    fila,
    versoes,
    config,
    erroConexao,
    adicionarMusica,
    tentarNovamente: () => setTentativa((n) => n + 1),
    atualizarSessao: (dados) => setSessao((s) => ({ ...s, ...dados })),
  }), [sessao, fila, versoes, config, erroConexao, adicionarMusica]);

  return <SessaoContext.Provider value={valor}>{children}</SessaoContext.Provider>;
}
