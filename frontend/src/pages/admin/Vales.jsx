import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';

const dataBr = (iso) => new Date(iso).toLocaleDateString('pt-BR');
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

// Vale-música: cartões com QR code e código que o garçom entrega (ex.: "1 drink, 1 música").
export default function Vales({ chamar }) {
  const [nomeLocal, setNomeLocal] = useState('Jukebox');
  const [lotes, setLotes] = useState(null);
  const [form, setForm] = useState({ quantidade: '10', creditos: '1', validade_dias: '30', observacao: '' });
  const [criando, setCriando] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [impressao, setImpressao] = useState(null); // { lote, cartoes }
  const [carregandoCartoes, setCarregandoCartoes] = useState('');

  const carregar = useCallback(() => chamar('/admin/vales').then((d) => setLotes(d.lotes)).catch((e) => setMensagem({ tipo: 'erro', texto: e.message })), [chamar]);
  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { api('/info').then((i) => setNomeLocal(i.nome)).catch(() => {}); }, []);

  async function criar(e) {
    e.preventDefault();
    setMensagem(null);
    setCriando(true);
    try {
      const r = await chamar('/admin/vales', {
        metodo: 'POST',
        corpo: { quantidade: Number(form.quantidade), creditos: Number(form.creditos), validade_dias: Number(form.validade_dias), observacao: form.observacao },
      });
      await carregar();
      await abrirCartoes(r.lote);
      setMensagem({ tipo: 'ok', texto: `✔ ${r.codigos.length} vales criados. Confira os cartões abaixo e clique em Imprimir.` });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setCriando(false);
    }
  }

  async function abrirCartoes(lote) {
    setCarregandoCartoes(lote);
    try {
      const r = await chamar(`/admin/vales/${lote}/qrs`);
      setImpressao({ lote, cartoes: r.cartoes });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setCarregandoCartoes('');
    }
  }

  async function revogar(lote) {
    if (!window.confirm('Cancelar os vales deste lote que ainda não foram usados? Quem já resgatou não é afetado.')) return;
    try {
      const r = await chamar(`/admin/vales/${lote.lote}`, { metodo: 'DELETE' });
      setMensagem({ tipo: 'ok', texto: `✔ ${r.revogados} ${r.revogados === 1 ? 'vale cancelado' : 'vales cancelados'}.` });
      if (impressao?.lote === lote.lote) setImpressao(null);
      carregar();
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    }
  }

  const numero = (campo, tamanho = 3) => (
    <input className="campo mono" inputMode="numeric" value={form[campo]}
      onChange={(e) => setForm({ ...form, [campo]: e.target.value.replace(/\D/g, '').slice(0, tamanho) })} />
  );

  return (
    <>
      <div className="so-tela">
        <h2>🎟 Vales-música</h2>
        <p className="nota">
          Cartões com QR code e código, para o garçom entregar junto com um drink, por exemplo. O cliente aponta a câmera (ou digita o código no app)
          e ganha músicas grátis. Cada código vale <b>uma vez</b>. São créditos de <b>cortesia</b>: <b>o custo é seu</b> e não entram no faturamento nem na divisão com a boate.
        </p>

        <form className="admin-form" onSubmit={criar}>
          <div className="admin-form-linha">
            <label>Quantos vales
              {numero('quantidade')}
            </label>
            <label>Músicas grátis em cada
              {numero('creditos', 2)}
            </label>
          </div>
          <div className="admin-form-linha">
            <label>Valem por quantos dias
              {numero('validade_dias')}
            </label>
            <label>Para quem / observação (opcional)
              <input className="campo" maxLength={60} placeholder="Ex.: Garçom Carlos" value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </label>
          </div>
          {mensagem && <p className={`aviso ${mensagem.tipo === 'erro' ? 'aviso-erro' : 'aviso-ok'}`}>{mensagem.texto}</p>}
          <button className="btn btn-grande" disabled={criando}>{criando ? 'CRIANDO…' : 'CRIAR VALES'}</button>
        </form>

        <h2>Lotes criados</h2>
        {!lotes && <div className="estado"><span className="carregando" /></div>}
        {lotes?.length === 0 && <p className="vazio">Nenhum vale criado ainda.</p>}
        <ul className="admin-lista">
          {lotes?.map((l) => (
            <li key={l.lote} className="admin-linha">
              <div className="admin-linha-info">
                <strong>{l.observacao ?? 'Sem observação'} · {l.creditos} {l.creditos === 1 ? 'música' : 'músicas'} cada</strong>
                <span>Criado em {dataHora(l.criado_em)} · vale até {dataBr(l.validade_em)}</span>
                <span>
                  <b className="mono">{l.total}</b> vales · <b className="mono">{l.resgatados}</b> usados · <b className="mono">{l.disponiveis}</b> disponíveis
                  {l.vencidos > 0 && <> · <b className="mono">{l.vencidos}</b> vencidos</>}
                </span>
              </div>
              <div className="admin-acoes">
                <button className="btn btn-ciano btn-pequeno" disabled={carregandoCartoes === l.lote || l.disponiveis === 0} onClick={() => abrirCartoes(l.lote)}>
                  {carregandoCartoes === l.lote ? 'Abrindo…' : '🖨 Cartões'}
                </button>
                <button className="btn btn-perigo btn-pequeno" disabled={l.disponiveis + l.vencidos === 0} onClick={() => revogar(l)}>Cancelar não usados</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {impressao && (
        <section className="vales-impressao">
          <div className="vales-impressao-topo so-tela">
            <h2>Cartões do lote ({impressao.cartoes.length})</h2>
            <div className="admin-acoes">
              <button className="btn" onClick={() => window.print()}>🖨 Imprimir</button>
              <button className="btn btn-fantasma" onClick={() => setImpressao(null)}>Fechar</button>
            </div>
          </div>
          {impressao.cartoes.length === 0 && <p className="vazio so-tela">Todos os vales deste lote já foram usados ou venceram.</p>}
          <div className="vales-folha">
            {impressao.cartoes.map((c) => (
              <div key={c.codigo} className="vale-cartao">
                <strong className="vale-cartao-casa">🎵 {nomeLocal}</strong>
                <span className="vale-cartao-titulo">VALE-MÚSICA</span>
                <b className="vale-cartao-valor">{c.creditos} {c.creditos === 1 ? 'música grátis' : 'músicas grátis'}</b>
                <img src={c.qr} alt={`QR code do vale ${c.codigo}`} />
                <code className="vale-cartao-codigo">{c.codigo}</code>
                <small>Aponte a câmera do celular para o QR code ou digite o código no app (Início → “Tenho um vale-música”). Vale até {dataBr(c.validade_em)}. Uso único.</small>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
