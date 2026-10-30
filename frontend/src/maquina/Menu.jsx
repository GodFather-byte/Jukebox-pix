import { useCallback, useEffect, useState } from 'react';
import { api, formatarReais } from '../api.js';

const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

function Coluna({ titulo, dados, pct, detalhe }) {
  return (
    <div className="pn-relogio-coluna">
      <h2>{titulo}</h2>
      {detalhe && <small>{detalhe}</small>}
      <strong>{formatarReais(dados.entrou)}</strong>
      <ul>
        <li><span>Dinheiro</span><b>{formatarReais(dados.por_metodo.nota)}</b></li>
        <li><span>Pix</span><b>{formatarReais(dados.por_metodo.pix)}</b></li>
        <li><span>Cartão</span><b>{formatarReais(dados.por_metodo.cartao)}</b></li>
        <li><span>Músicas tocadas</span><b>{dados.tocadas}{dados.gratis ? ` (${dados.gratis} grátis)` : ''}</b></li>
        <li className="destaque"><span>Empresa ({pct}%)</span><b>{formatarReais(dados.empresa)}</b></li>
        <li className="destaque"><span>Ponto ({100 - pct}%)</span><b>{formatarReais(dados.ponto)}</b></li>
      </ul>
    </div>
  );
}

// Menu do operador: o botão de dentro da máquina abre o relógio (total e desde o último fechamento) e fecha o
// caixa. TOCAR fecha (aperte de novo para confirmar), RITMO ou CANCELAR sai.
export default function Menu({ controle, aoFechar, aviso }) {
  const [relogio, setRelogio] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => api('/quiosque/relogio').then(setRelogio).catch((e) => setErro(e.message)), []);
  useEffect(() => { carregar(); }, [carregar]);

  async function fechar() {
    if (!confirmar) { setConfirmar(true); return; }
    setConfirmar(false);
    try {
      setRelogio(await api('/quiosque/relogio/fechar', { metodo: 'POST' }));
      aviso('CAIXA FECHADO. O PARCIAL COMEÇOU DE NOVO.');
    } catch (e) {
      setErro(e.message);
    }
  }

  controle.current = (botao) => {
    if (botao === 'tocar') fechar();
    else if (['ritmo', 'voltar', 'menu'].includes(botao)) aoFechar();
    else setConfirmar(false);
  };

  const ultimo = relogio?.ultimo_fechamento;
  return (
    <div className="pn-janela-fundo" role="dialog" aria-modal="true" aria-label="Menu do operador">
      <section className="pn-janela pn-relogio">
        <header>
          <h1>MENU DO OPERADOR</h1>
          <span>{relogio?.maquina} · {quando(new Date().toISOString())}</span>
          <button type="button" className="pn-fechar" aria-label="Fechar" onClick={aoFechar}>✕</button>
        </header>
        {erro && <p className="pn-erro" role="alert">{erro}</p>}
        {!relogio ? <p><span className="carregando carregando-pequeno" /> Carregando…</p> : (
          <>
            <div className="pn-relogio-colunas">
              <Coluna titulo="PARCIAL" detalhe={`desde ${quando(relogio.parcial.desde)}`} dados={relogio.parcial} pct={relogio.porcentagem_empresa} />
              <Coluna titulo="TOTAL" detalhe="desde a instalação" dados={relogio.total} pct={relogio.porcentagem_empresa} />
            </div>
            {ultimo && (
              <p className="pn-relogio-ultimo">
                Último fechamento: {quando(ultimo.em)} · entrou {formatarReais(ultimo.entrou)} · empresa {formatarReais(ultimo.empresa)} · ponto {formatarReais(ultimo.ponto)}
              </p>
            )}
            <button type="button" className={`pn-relogio-fechar ${confirmar ? 'confirmar' : ''}`} onClick={fechar}>
              {confirmar ? 'APERTE TOCAR DE NOVO PARA FECHAR O CAIXA' : 'TOCAR: FECHAR O CAIXA (ZERA O PARCIAL)'}
            </button>
          </>
        )}
        <p className="pn-dica">TOCAR fecha o caixa · RITMO ou CANCELAR sai · relatório completo no painel administrativo</p>
      </section>
    </div>
  );
}
