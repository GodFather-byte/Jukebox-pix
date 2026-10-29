import { useCallback, useEffect, useState } from 'react';
import QRCode from '../components/QRCode.jsx';
import ValeForm from '../components/ValeForm.jsx';
import { api, formatarReais } from '../api.js';
import { bonusPara, textoDasJanelas } from '../bonus.js';
import { useSessao } from '../context/Sessao.jsx';
import { useAgora, useApi } from '../hooks.js';

const NOTAS_TESTE = [2, 5, 10, 20];

function contagem(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Escolha do valor (Pix e cartão): botões grandes + "outro valor" num teclado numérico na própria tela.
function Valores({ valores, min, max, valor, setValor, bonus }) {
  const [texto, setTexto] = useState(''); // vazio: valor escolhido num dos botões
  const digitar = (d) => {
    const novo = (d === '⌫' ? texto.slice(0, -1) : `${texto}${d}`).replace(/^0+/, '').slice(0, 3);
    setTexto(novo);
    setValor(Number(novo) || 0);
  };
  const outro = texto !== '';
  return (
    <div className="qk-valores">
      <div className="qk-valores-botoes">
        {valores.map((v) => (
          <button key={v} type="button" className={`qk-valor ${!outro && valor === v ? 'ativo' : ''}`} onClick={() => { setTexto(''); setValor(v); }}>
            <b>R$ {v}</b>
            <small>{v} músicas</small>
            {bonusPara(v, bonus) > 0 && <span className="qk-valor-bonus">🎁 +{bonusPara(v, bonus)}</span>}
          </button>
        ))}
      </div>
      <div className="qk-outro">
        <span>Outro valor</span>
        <b className={outro ? 'ativo' : ''}>{outro ? formatarReais(valor || 0) : 'R$ —'}</b>
        <div className="qk-numpad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
            d ? <button key={d} type="button" onClick={() => digitar(d)}>{d}</button> : <span key={`v${i}`} />
          ))}
        </div>
        <small>De R$ {min} a R$ {max}</small>
      </div>
    </div>
  );
}

function Confirmado({ pagamento, saldo, aoFechar, aoMais }) {
  return (
    <div className="qk-pagamento qk-ok">
      <div className="qk-ok-icone">✓</div>
      <h2>Pronto! +{pagamento.creditos + (pagamento.bonus ?? 0)} créditos</h2>
      {pagamento.bonus > 0 && <p className="qk-bonus">🎁 Inclui {pagamento.bonus} de bônus</p>}
      <p>Saldo agora: <b>{saldo}</b> {saldo === 1 ? 'crédito' : 'créditos'}</p>
      <button type="button" className="qk-btn qk-btn-grande" onClick={aoFechar}>Escolher músicas</button>
      <button type="button" className="qk-btn qk-btn-fantasma" onClick={aoMais}>Colocar mais créditos</button>
    </div>
  );
}

// Janela "Colocar créditos": Pix (QR nesta tela), cartão (maquininha) ou notas (noteiro).
export default function Creditos({ aoFechar }) {
  const { sessao, saldo, atualizarSessao, config, quiosque } = useSessao();
  const info = useApi('/info');
  const agora = useAgora(1000);
  const metodos = ['pix', 'cartao', 'nota'].filter((m) => quiosque.metodos[m]);
  const [metodo, setMetodo] = useState(metodos[0]);
  const [valor, setValor] = useState(10);
  const [tipoCartao, setTipoCartao] = useState('debito');
  const [pagamento, setPagamento] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [notas, setNotas] = useState(0); // reais que entraram pelo noteiro com esta janela aberta

  const pendente = pagamento?.status === 'pendente';

  const atualizar = useCallback(async (id) => {
    try {
      const atual = await api(`/pagamento/${id}`);
      setPagamento(atual);
      if (atual.status === 'confirmado' && sessao?.id) api(`/sessoes/${sessao.id}`).then(atualizarSessao).catch(() => {});
    } catch { /* sem resposta agora: tenta no próximo ciclo */ }
  }, [sessao?.id, atualizarSessao]);

  useEffect(() => {
    if (!pendente) return undefined;
    const id = pagamento.id;
    const consulta = setInterval(() => atualizar(id), 2500);
    const aoEvento = (e) => e.detail.id === id && atualizar(id);
    window.addEventListener('jukebox:pagamento', aoEvento);
    return () => { clearInterval(consulta); window.removeEventListener('jukebox:pagamento', aoEvento); };
  }, [pendente, pagamento?.id, atualizar]);

  // Notas entram a qualquer hora pelo noteiro: soma aqui para o cliente ver o dinheiro virar crédito.
  useEffect(() => {
    const aoEvento = (e) => { if (e.detail.metodo === 'nota') setNotas((n) => n + e.detail.valor); };
    window.addEventListener('jukebox:pagamento', aoEvento);
    return () => window.removeEventListener('jukebox:pagamento', aoEvento);
  }, []);

  // Fechar com cobrança aberta cancela de verdade (o QR ou a cobrança na maquininha não podem ser pagos depois).
  async function cancelar() {
    if (pendente) {
      try {
        const r = await api(`/pagamento/${pagamento.id}/cancelar`, { metodo: 'POST' });
        if (r.status === 'confirmado') { setPagamento(r); return; }
      } catch (e) {
        setErro(e.message);
        return;
      }
    }
    setPagamento(null);
  }

  async function fechar() {
    if (pendente) await cancelar();
    aoFechar();
  }

  async function gerar() {
    setErro('');
    setEnviando(true);
    try {
      const corpo = { valor, session_id: sessao.id, metodo, tipo_cartao: tipoCartao };
      setPagamento(await api('/pagamento/iniciar', { metodo: 'POST', corpo }));
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!info.dados || !sessao) return null;
  const { valores, valor_min: min, valor_max: max } = info.dados;
  const valorValido = Number.isInteger(valor) && valor >= min && valor <= max;
  const simular = () => api(`/pagamento/mock/confirmar/${pagamento.id}`, { metodo: 'POST' }).then(() => atualizar(pagamento.id));

  let corpo;
  if (pagamento?.status === 'confirmado') {
    corpo = <Confirmado pagamento={pagamento} saldo={saldo} aoFechar={aoFechar} aoMais={() => setPagamento(null)} />;
  } else if (pendente && Date.parse(pagamento.expira_em) > agora) {
    const restante = contagem(Date.parse(pagamento.expira_em) - agora);
    corpo = pagamento.metodo === 'pix' ? (
      <div className="qk-pagamento qk-pix">
        <h2>Pague {formatarReais(pagamento.valor)} com Pix</h2>
        <p>Abra o app do seu banco e aponte a câmera para o QR.</p>
        <QRCode imagem={pagamento.qr_imagem} alt="QR code do Pix" />
        <p className="qk-aguardando"><span className="carregando carregando-pequeno" /> Aguardando o Pix… <b>{restante}</b></p>
        <div className="qk-acoes">
          {quiosque.modo_teste && <button type="button" className="qk-btn qk-btn-fantasma" onClick={simular}>🧪 Simular Pix pago</button>}
          <button type="button" className="qk-btn qk-btn-fantasma" onClick={cancelar}>Cancelar</button>
        </div>
      </div>
    ) : (
      <div className="qk-pagamento qk-maquininha">
        <div className="qk-maquininha-icone" aria-hidden="true">💳</div>
        <h2>{formatarReais(pagamento.valor)} no {tipoCartao === 'debito' ? 'débito' : 'crédito'}</h2>
        <p>Passe, insira ou aproxime o cartão <b>na maquininha</b> e siga as instruções nela.</p>
        <p className="qk-aguardando"><span className="carregando carregando-pequeno" /> Aguardando a maquininha… <b>{restante}</b></p>
        <div className="qk-acoes">
          {quiosque.modo_teste && <button type="button" className="qk-btn qk-btn-fantasma" onClick={simular}>🧪 Simular cartão aprovado</button>}
          <button type="button" className="qk-btn qk-btn-fantasma" onClick={cancelar}>Cancelar</button>
        </div>
      </div>
    );
  } else if (metodo === 'nota') {
    corpo = (
      <div className="qk-pagamento qk-notas">
        <div className="qk-nota-anim" aria-hidden="true"><span>💵</span></div>
        <h2>Insira a nota no noteiro</h2>
        <p>Cada R$ 1 vira 1 crédito. Os créditos aparecem aqui na hora.</p>
        {notas > 0 && <p className="qk-notas-recebidas">Recebido agora: <b>{formatarReais(notas)}</b></p>}
        <p>Saldo: <b>{saldo}</b> {saldo === 1 ? 'crédito' : 'créditos'}</p>
        {quiosque.modo_teste && (
          <div className="qk-acoes">
            {NOTAS_TESTE.map((v) => (
              <button key={v} type="button" className="qk-btn qk-btn-fantasma" onClick={() => api('/quiosque/nota-teste', { metodo: 'POST', corpo: { valor: v } }).catch((e) => setErro(e.message))}>
                🧪 Nota de R$ {v}
              </button>
            ))}
          </div>
        )}
        {notas > 0 && <button type="button" className="qk-btn qk-btn-grande" onClick={aoFechar}>Escolher músicas</button>}
      </div>
    );
  } else if (!config.vendas_abertas) {
    corpo = (
      <div className="qk-pagamento">
        <h2>🌙 Vendas encerradas</h2>
        <p>Agora não estamos vendendo créditos. Quem já tem créditos continua escolhendo músicas.</p>
      </div>
    );
  } else {
    corpo = (
      <div className="qk-pagamento">
        {pagamento && <p className="qk-erro">O tempo acabou. Comece de novo.</p>}
        {metodo === 'cartao' && (
          <div className="qk-segmento" role="group" aria-label="Tipo de cartão">
            <button type="button" className={tipoCartao === 'debito' ? 'ativo' : ''} onClick={() => setTipoCartao('debito')}>Débito</button>
            <button type="button" className={tipoCartao === 'credito' ? 'ativo' : ''} onClick={() => setTipoCartao('credito')}>Crédito</button>
          </div>
        )}
        <Valores valores={valores} min={min} max={max} valor={valor} setValor={setValor} bonus={config.bonus} />
        {!config.bonus.ativo && config.bonus.habilitado && config.bonus.faixas.length > 0 && config.bonus.agenda.length > 0 && (
          <p className="qk-bonus">🎁 Bônus das {textoDasJanelas(config.bonus.agenda)}: {config.bonus.faixas.map((f) => `R$ ${f.valor} → +${f.bonus}`).join(' · ')}</p>
        )}
        <button type="button" className="qk-btn qk-btn-grande" onClick={gerar} disabled={!valorValido || enviando}>
          {enviando ? 'Aguarde…' : !valorValido ? 'Escolha um valor'
            : metodo === 'pix' ? `Gerar Pix de ${formatarReais(valor)}` : `Pagar ${formatarReais(valor)} na maquininha`}
        </button>
      </div>
    );
  }

  const travado = pendente || pagamento?.status === 'confirmado';
  return (
    <div className="qk-modal-fundo" role="presentation" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <section className="qk-modal" role="dialog" aria-modal="true" aria-label="Colocar créditos">
        <header className="qk-modal-topo">
          <div>
            <h1>Colocar créditos</h1>
            <p>1 crédito = R$ 1,00 = 1 música{quiosque.modo_teste ? ' · 🧪 modo teste: nada é cobrado' : ''}</p>
          </div>
          <button type="button" className="qk-fechar" aria-label="Fechar" onClick={fechar}>✕</button>
        </header>
        {metodos.length > 1 && (
          <div className="qk-metodos" role="tablist">
            {metodos.map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={metodo === m}
                className={metodo === m ? 'ativo' : ''}
                disabled={travado && metodo !== m}
                onClick={() => { setMetodo(m); setErro(''); }}
              >
                <span aria-hidden="true">{{ pix: '⚡', cartao: '💳', nota: '💵' }[m]}</span>
                {{ pix: 'Pix', cartao: 'Cartão', nota: 'Dinheiro' }[m]}
                <small>{{ pix: 'QR nesta tela', cartao: 'Débito ou crédito', nota: 'Notas no noteiro' }[m]}</small>
              </button>
            ))}
          </div>
        )}
        {erro && <p className="qk-erro" role="alert">{erro}</p>}
        {corpo}
        {!travado && <div className="qk-vale"><ValeForm /></div>}
      </section>
    </div>
  );
}
