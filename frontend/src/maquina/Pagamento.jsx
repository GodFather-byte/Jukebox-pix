import { useCallback, useEffect, useState } from 'react';
import { api, formatarReais } from '../api.js';
import { bonusPara } from '../bonus.js';
import { useSessao } from '../context/Sessao.jsx';
import { useAgora, useApi } from '../hooks.js';

const OPCOES = [
  { id: 'nota', titulo: 'DINHEIRO', detalhe: 'Coloque a nota ou a moeda', metodo: 'nota' },
  { id: 'pix', titulo: 'PIX', detalhe: 'QR code nesta tela', metodo: 'pix' },
  { id: 'debito', titulo: 'CARTÃO DÉBITO', detalhe: 'Na maquininha', metodo: 'cartao' },
  { id: 'credito', titulo: 'CARTÃO CRÉDITO', detalhe: 'Na maquininha', metodo: 'cartao' },
];

const contagem = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// Tela de créditos da máquina. Anda com os mesmos botões: ↓/↑ escolhe, ◀ ▶ muda o valor, TOCAR confirma,
// RITMO volta. Tudo também funciona com toque.
export default function Pagamento({ controle, aoFechar }) {
  const { sessao, saldo, atualizarSessao, config, quiosque } = useSessao();
  const info = useApi('/info');
  const agora = useAgora(1000);
  const opcoes = OPCOES.filter((o) => quiosque.metodos[o.metodo]);
  const [passo, setPasso] = useState('forma'); // forma | valor | aguardando | ok
  const [indice, setIndice] = useState(0);
  const [valorIdx, setValorIdx] = useState(1);
  const [pagamento, setPagamento] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [notas, setNotas] = useState(0);

  const valores = info.dados?.valores ?? [5, 10, 20, 50];
  const valor = valores[valorIdx] ?? valores[0];
  const opcao = opcoes[indice] ?? opcoes[0];
  const pendente = pagamento?.status === 'pendente';

  const atualizar = useCallback(async (id) => {
    try {
      const atual = await api(`/pagamento/${id}`);
      setPagamento(atual);
      if (atual.status === 'confirmado') {
        setPasso('ok');
        if (sessao?.id) api(`/sessoes/${sessao.id}`).then(atualizarSessao).catch(() => {});
      }
    } catch { /* sem resposta agora: tenta de novo */ }
  }, [sessao?.id, atualizarSessao]);

  useEffect(() => {
    if (!pendente) return undefined;
    const id = pagamento.id;
    const relogio = setInterval(() => atualizar(id), 2500);
    const aoEvento = (e) => e.detail.id === id && atualizar(id);
    window.addEventListener('jukebox:pagamento', aoEvento);
    return () => { clearInterval(relogio); window.removeEventListener('jukebox:pagamento', aoEvento); };
  }, [pendente, pagamento?.id, atualizar]);

  useEffect(() => {
    const aoEvento = (e) => { if (e.detail.metodo === 'nota') setNotas((n) => n + e.detail.valor); };
    window.addEventListener('jukebox:pagamento', aoEvento);
    return () => window.removeEventListener('jukebox:pagamento', aoEvento);
  }, []);

  // Já pago: volta sozinho para a escolha de músicas.
  useEffect(() => {
    if (passo !== 'ok') return undefined;
    const id = setTimeout(aoFechar, 4000);
    return () => clearTimeout(id);
  }, [passo, aoFechar]);

  async function cancelarCobranca() {
    if (!pendente) return true;
    try {
      const r = await api(`/pagamento/${pagamento.id}/cancelar`, { metodo: 'POST' });
      if (r.status === 'confirmado') { setPagamento(r); setPasso('ok'); return false; }
      return true;
    } catch (e) {
      setErro(e.message);
      return false;
    }
  }

  async function voltar() {
    setErro('');
    if (passo === 'aguardando') {
      if (await cancelarCobranca()) { setPagamento(null); setPasso(opcao.id === 'nota' ? 'forma' : 'valor'); }
    } else if (passo === 'valor') setPasso('forma');
    else aoFechar();
  }

  async function gerar() {
    setErro('');
    setEnviando(true);
    try {
      const corpo = { valor, session_id: sessao.id, metodo: opcao.metodo, tipo_cartao: opcao.id === 'debito' ? 'debito' : 'credito' };
      setPagamento(await api('/pagamento/iniciar', { metodo: 'POST', corpo }));
      setPasso('aguardando');
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  function confirmar() {
    if (passo === 'forma') {
      if (!opcao) return;
      if (opcao.id === 'nota') { setNotas(0); setPasso('aguardando'); return; }
      if (!config.vendas_abertas) { setErro('Vendas encerradas agora. Quem já tem créditos continua escolhendo.'); return; }
      setPasso('valor');
    } else if (passo === 'valor' && !enviando) gerar();
    else if (passo === 'aguardando' && opcao.id === 'nota' && notas > 0) aoFechar();
    else if (passo === 'ok') aoFechar();
  }

  // Botões físicos chegam por aqui (a tela da máquina repassa enquanto esta janela está aberta).
  controle.current = (botao) => {
    if (botao === 'voltar' || botao === 'ritmo' || botao === 'creditos') return voltar();
    if (botao === 'tocar') return confirmar();
    if (passo === 'forma' && (botao === 'descer' || botao === 'proxima')) setIndice((i) => (i + 1) % opcoes.length);
    if (passo === 'forma' && (botao === 'subir' || botao === 'anterior')) setIndice((i) => (i - 1 + opcoes.length) % opcoes.length);
    if (passo === 'valor' && (botao === 'proxima' || botao === 'descer')) setValorIdx((i) => Math.min(valores.length - 1, i + 1));
    if (passo === 'valor' && (botao === 'anterior' || botao === 'subir')) setValorIdx((i) => Math.max(0, i - 1));
    return undefined;
  };

  const simular = () => api(`/pagamento/mock/confirmar/${pagamento.id}`, { metodo: 'POST' }).then(() => atualizar(pagamento.id));
  const notaTeste = (v) => api('/quiosque/nota-teste', { metodo: 'POST', corpo: { valor: v } }).catch((e) => setErro(e.message));

  let corpo;
  if (passo === 'ok') {
    const total = (pagamento?.creditos ?? notas) + (pagamento?.bonus ?? 0);
    corpo = (
      <div className="mq-pg-centro">
        <div className="mq-pg-ok">✓</div>
        <h2>PAGAMENTO APROVADO</h2>
        <p>+{total} {total === 1 ? 'crédito' : 'créditos'} · saldo {saldo}</p>
        <button type="button" className="mq-pg-botao" onClick={aoFechar}>ESCOLHER MÚSICAS</button>
      </div>
    );
  } else if (passo === 'aguardando' && opcao.id === 'nota') {
    corpo = (
      <div className="mq-pg-centro">
        <div className="mq-pg-nota" aria-hidden="true">💵</div>
        <h2>COLOQUE A NOTA OU A MOEDA</h2>
        <p>Cada R$ 1,00 = 1 crédito. Os créditos aparecem na hora.</p>
        {notas > 0 && <p className="mq-pg-recebido">Recebido: {formatarReais(notas)} · saldo {saldo}</p>}
        {quiosque.modo_teste && (
          <div className="mq-pg-teste">
            {[1, 2, 5, 10].map((v) => <button key={v} type="button" onClick={() => notaTeste(v)}>🧪 R$ {v}</button>)}
          </div>
        )}
        <p className="mq-pg-dica">{notas > 0 ? 'TOCAR: escolher músicas' : ''} · RITMO: voltar</p>
      </div>
    );
  } else if (passo === 'aguardando' && pendente && Date.parse(pagamento.expira_em) > agora) {
    const restante = contagem(Date.parse(pagamento.expira_em) - agora);
    corpo = pagamento.metodo === 'pix' ? (
      <div className="mq-pg-centro">
        <h2>PIX DE {formatarReais(pagamento.valor)}</h2>
        <img className="mq-pg-qr" src={pagamento.qr_imagem} alt="QR code do Pix" />
        <p>Abra o app do banco e aponte a câmera. Expira em <b>{restante}</b></p>
        {quiosque.modo_teste && <div className="mq-pg-teste"><button type="button" onClick={simular}>🧪 Simular Pix pago</button></div>}
        <p className="mq-pg-dica">RITMO: cancelar</p>
      </div>
    ) : (
      <div className="mq-pg-centro">
        <div className="mq-pg-nota" aria-hidden="true">💳</div>
        <h2>{formatarReais(pagamento.valor)} NO {opcao.id === 'debito' ? 'DÉBITO' : 'CRÉDITO'}</h2>
        <p>Passe ou aproxime o cartão <b>na maquininha</b>. Aguardando… <b>{restante}</b></p>
        {quiosque.modo_teste && <div className="mq-pg-teste"><button type="button" onClick={simular}>🧪 Simular cartão aprovado</button></div>}
        <p className="mq-pg-dica">RITMO: cancelar</p>
      </div>
    );
  } else if (passo === 'valor' || passo === 'aguardando') {
    corpo = (
      <div className="mq-pg-centro">
        <h2>{opcao.titulo}: ESCOLHA O VALOR</h2>
        {pagamento && <p className="mq-pg-erro">O tempo acabou. Escolha de novo.</p>}
        <div className="mq-pg-valores">
          {valores.map((v, i) => (
            <button key={v} type="button" className={i === valorIdx ? 'ativo' : ''} onClick={() => (i === valorIdx ? gerar() : setValorIdx(i))}>
              <b>R$ {v}</b>
              <small>{v} créditos{bonusPara(v, config.bonus) ? ` +${bonusPara(v, config.bonus)} bônus` : ''}</small>
            </button>
          ))}
        </div>
        <p className="mq-pg-dica">◀ ▶ muda o valor · TOCAR confirma · RITMO volta</p>
      </div>
    );
  } else {
    corpo = (
      <div className="mq-pg-formas">
        {opcoes.map((o, i) => (
          <button key={o.id} type="button" className={i === indice ? 'ativo' : ''} onClick={() => { setIndice(i); if (i === indice) confirmar(); }}>
            <span className="mq-pg-seta" aria-hidden="true">{i === indice ? '▶' : ''}</span>
            <b>{o.titulo}</b>
            <small>{o.detalhe}</small>
          </button>
        ))}
        <p className="mq-pg-dica">↓ escolhe · TOCAR confirma · RITMO volta</p>
      </div>
    );
  }

  return (
    <div className="pn-janela-fundo" role="dialog" aria-modal="true" aria-label="Colocar créditos">
      <section className="pn-janela mq-pg">
        <header>
          <h1>COLOCAR CRÉDITOS</h1>
          <span>1 crédito = 1 música = R$ 1,00{quiosque.modo_teste ? ' · MODO TESTE' : ''}</span>
          <button type="button" className="pn-fechar" aria-label="Fechar" onClick={voltar}>✕</button>
        </header>
        {erro && <p className="pn-erro" role="alert">{erro}</p>}
        {corpo}
      </section>
    </div>
  );
}
