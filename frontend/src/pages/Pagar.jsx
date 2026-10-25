import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Estado from '../components/Estado.jsx';
import QRCode from '../components/QRCode.jsx';
import { api, formatarReais } from '../api.js';
import { bonusPara, textoDasJanelas } from '../bonus.js';
import { useSessao } from '../context/Sessao.jsx';
import { useToast } from '../context/Toast.jsx';
import { useAgora, useApi } from '../hooks.js';

const CHAVE_PAGAMENTO = 'jukebox_pagamento';
const guardar = (id) => { try { id ? localStorage.setItem(CHAVE_PAGAMENTO, id) : localStorage.removeItem(CHAVE_PAGAMENTO); } catch { /* sem storage */ } };
const lembrado = () => { try { return localStorage.getItem(CHAVE_PAGAMENTO); } catch { return null; } };

function contagem(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function Pagar({ embutido = false, aoEscolher, aoVoltar }) {
  const { sessao, saldo, atualizarSessao, config } = useSessao();
  const mostrarToast = useToast();
  const navigate = useNavigate();
  const escolher = () => (embutido ? aoEscolher?.() : navigate('/'));
  const voltar = () => (embutido ? (aoVoltar ?? aoEscolher)?.() : navigate('/'));
  const info = useApi('/info');

  const [valor, setValor] = useState(10);
  const [outro, setOutro] = useState('');
  const [pagamento, setPagamento] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState('');

  const pendente = pagamento?.status === 'pendente';
  const agora = useAgora(1000);

  const atualizar = useCallback(async (id) => {
    try {
      const atual = await api(`/pagamento/${id}`);
      setPagamento(atual);
      if (atual.status !== 'pendente') guardar(null);
      if (atual.status === 'confirmado' && sessao?.id) api(`/sessoes/${sessao.id}`).then(atualizarSessao).catch(() => {});
    } catch { /* sem rede por um instante: tenta no próximo ciclo */ }
  }, [sessao?.id, atualizarSessao]);

  // Se o cliente saiu da tela no meio do pagamento, retoma o Pix que ainda vale.
  useEffect(() => {
    const id = lembrado();
    if (!id) return;
    api(`/pagamento/${id}`)
      .then((p) => (p.status === 'pendente' && !p.expirado ? setPagamento(p) : guardar(null)))
      .catch(() => guardar(null));
  }, []);

  useEffect(() => {
    if (!pendente) return undefined;
    const id = pagamento.id;
    const consulta = setInterval(() => atualizar(id), 3000);
    const aoEvento = (e) => e.detail.id === id && atualizar(id);
    window.addEventListener('jukebox:pagamento', aoEvento);
    return () => {
      clearInterval(consulta);
      window.removeEventListener('jukebox:pagamento', aoEvento);
    };
  }, [pendente, pagamento?.id, atualizar]);

  if (!info.dados || !sessao) return <Estado carregando erro={info.erro} />;
  const { valores, valor_min: min, valor_max: max, modo_teste: modoTeste, sessao_ttl_min: ttl } = info.dados;

  const valorFinal = outro !== '' ? Number(outro) : valor;
  const valorValido = Number.isInteger(valorFinal) && valorFinal >= min && valorFinal <= max;

  async function gerar() {
    setErro('');
    setGerando(true);
    try {
      const novo = await api('/pagamento/iniciar', { metodo: 'POST', corpo: { valor: valorFinal, session_id: sessao.id } });
      guardar(novo.id);
      setPagamento(novo);
    } catch (e) {
      setErro(e.message);
    } finally {
      setGerando(false);
    }
  }

  // Cancela de verdade no servidor (e no provedor): um QR cancelado não pode ser pago depois.
  async function cancelar() {
    try {
      const resultado = await api(`/pagamento/${pagamento.id}/cancelar`, { metodo: 'POST' });
      if (resultado.status === 'confirmado') {
        setPagamento(resultado); // já tinha sido pago: não desfaz, mostra a confirmação
        return;
      }
    } catch (erro) {
      mostrarToast(erro.message, { tipo: 'erro' });
      return;
    }
    guardar(null);
    setPagamento(null);
  }

  function novoPix() {
    guardar(null);
    setPagamento(null);
  }

  if (pagamento?.status === 'confirmado') {
    return (
      <section className="card pagamento-ok">
        <div className="pagamento-icone">✅</div>
        <h1>Pagamento confirmado!</h1>
        <p><b className="mono">+{pagamento.creditos}</b> créditos adicionados</p>
        {pagamento.bonus > 0 && <p className="bonus-destaque">🎁 + <b className="mono">{pagamento.bonus}</b> de bônus!</p>}
        <p>Saldo atual: <b className="mono">{saldo}</b></p>
        <button className="btn btn-grande" onClick={escolher}>ESCOLHER MÚSICAS</button>
        <button className="btn btn-fantasma" onClick={novoPix}>Adicionar mais créditos</button>
      </section>
    );
  }

  if (pendente) {
    const restante = Date.parse(pagamento.expira_em) - agora;
    if (restante > 0) {
      return (
        <section className="card pagamento-qr">
          <h1>Pague {formatarReais(pagamento.valor)} via Pix</h1>
          {pagamento.bonus > 0 && <p className="bonus-destaque">🎁 Você ganha + <b className="mono">{pagamento.bonus}</b> créditos de bônus</p>}
          <p className="subtitulo">Abra o app do seu banco e aponte a câmera para <b>este QR</b>. Dá para usar também o <b>Pix copia e cola</b>.</p>
          <QRCode imagem={pagamento.qr_imagem} texto={pagamento.qr_code} alt="QR code do Pix" />
          <p className="aguardando"><span className="carregando carregando-pequeno" /> Aguardando pagamento… expira em <b className="mono">{contagem(restante)}</b></p>
          {modoTeste && (
            <button className="btn btn-fantasma" onClick={() => api(`/pagamento/mock/confirmar/${pagamento.id}`, { metodo: 'POST' }).then(() => atualizar(pagamento.id))}>
              🧪 Simular pagamento (modo teste)
            </button>
          )}
          <button className="btn btn-fantasma" onClick={cancelar}>Cancelar</button>
        </section>
      );
    }
  }

  if (!config.vendas_abertas) {
    return (
      <section className="card pagamento-ok">
        <div className="pagamento-icone">🌙</div>
        <h1>Vendas encerradas</h1>
        <p>No momento não estamos vendendo créditos novos. Quem já tem créditos continua pedindo músicas normalmente.</p>
        <button className="btn btn-grande" onClick={voltar}>{embutido ? 'VOLTAR AO TELÃO' : 'VOLTAR'}</button>
      </section>
    );
  }

  return (
    <>
      <h1>Adicionar créditos</h1>
      <p className="subtitulo">1 crédito = R$ 1,00. Pague com Pix e toque na hora.</p>

      {pagamento && <p className="aviso aviso-erro">Esse Pix expirou. Gere um novo para continuar.</p>}

      {!config.bonus.ativo && config.bonus.habilitado && config.bonus.faixas.length > 0 && config.bonus.agenda.length > 0 && (
        <p className="bonus-destaque bonus-futuro">
          🎁 Bônus de recarga das {textoDasJanelas(config.bonus.agenda)}: {config.bonus.faixas.map((f) => `R$ ${f.valor} → +${f.bonus}`).join(' · ')}
        </p>
      )}

      <div className="valores" role="group" aria-label="Valor">
        {valores.map((v) => (
          <button key={v} className={`valor ${outro === '' && valor === v ? 'ativo' : ''}`} onClick={() => { setValor(v); setOutro(''); }}>
            <b className="mono">R$ {v}</b>
            <small>{v} créditos</small>
            {bonusPara(v, config.bonus) > 0 && <span className="valor-bonus">🎁 +{bonusPara(v, config.bonus)} bônus</span>}
          </button>
        ))}
      </div>

      <label className="campo-rotulo">
        Outro valor (R$ {min} a {max})
        <input
          className="campo mono"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder="Ex.: 15"
          value={outro}
          onChange={(e) => setOutro(e.target.value.replace(/\D/g, '').slice(0, 3))}
        />
      </label>

      {valorValido && bonusPara(valorFinal, config.bonus) > 0 && (
        <p className="bonus-destaque">🎁 Com R$ {valorFinal} você ganha + <b className="mono">{bonusPara(valorFinal, config.bonus)}</b> créditos de bônus</p>
      )}

      {erro && <p className="aviso aviso-erro">{erro}</p>}

      <button className="btn btn-grande" onClick={gerar} disabled={!valorValido || gerando}>
        {gerando ? 'GERANDO PIX…' : valorValido ? `GERAR PIX DE ${formatarReais(valorFinal)}` : 'ESCOLHA UM VALOR'}
      </button>

      <p className="nota">Seus créditos valem por {ttl} minutos após o último pagamento ou música pedida. Use antes de vencer!</p>
      {modoTeste && <p className="aviso">🧪 Modo de teste: o Pix é simulado e nenhum dinheiro é cobrado.</p>}
    </>
  );
}
