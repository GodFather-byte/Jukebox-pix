import { useEffect, useState } from 'react';
import { api } from './api.js';

// Rerenderiza a cada `ms` (barras de progresso, contagens regressivas).
export function useAgora(ms = 1000) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return agora;
}

// Mantém a tela do monitor acesa. O navegador solta a trava quando a aba some; pedimos de novo ao voltar.
export function useManterAceso() {
  useEffect(() => {
    let trava = null;
    let ativo = true;
    const pedir = () => {
      if (!ativo || !navigator.wakeLock || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then((l) => { trava = l; }).catch(() => {});
    };
    pedir();
    const aoVoltar = () => { if (document.visibilityState === 'visible') pedir(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      ativo = false;
      document.removeEventListener('visibilitychange', aoVoltar);
      trava?.release?.().catch(() => {});
    };
  }, []);
}

export function useDebounce(valor, ms = 300) {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const id = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(id);
  }, [valor, ms]);
  return atrasado;
}

// Busca `caminho` e refaz quando ele ou `recarregarCom` mudam. Mantém o dado antigo durante o refetch.
export function useApi(caminho, recarregarCom = []) {
  const [estado, setEstado] = useState({ dados: null, erro: null, carregando: Boolean(caminho) });

  useEffect(() => {
    if (!caminho) return undefined;
    let ativo = true;
    setEstado((s) => ({ ...s, carregando: true }));
    api(caminho)
      .then((dados) => ativo && setEstado({ dados, erro: null, carregando: false }))
      .catch((erro) => ativo && setEstado((s) => ({ ...s, erro, carregando: false })));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho, ...recarregarCom]);

  return estado;
}
