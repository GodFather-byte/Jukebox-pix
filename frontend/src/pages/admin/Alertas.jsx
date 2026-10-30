import { useCallback, useEffect, useState } from 'react';

const TIPOS = [
  ['player', '🔇 O player falhou 3 vezes seguidas', 'Sinal de que o som parou ou os arquivos de música sumiram.'],
  ['pix', '📲 Sem conexão com o provedor de Pix', 'Ninguém consegue pagar. Avisa quando cai e quando volta (só com Mercado Pago).'],
  ['disco', '💾 Pouco espaço em disco', 'Menos de 10% ou 5 GB livres. Avisa no máximo uma vez por dia.'],
  ['backup', '🗄 O backup falhou', 'Inclui a cópia extra (pendrive solto, nuvem offline).'],
  ['inicio', '🟢 A jukebox ligou', 'Útil para saber que o notebook reiniciou (queda de energia, atualização do Windows).'],
  ['credito', '🚨 Dinheiro demais entrando de uma vez', 'Mais que o normal em 10 minutos pelo noteiro, moedeiro ou chave (CREDITO_ALERTA_10MIN, padrão R$ 150). Pode ser alguém com um teclado na máquina ou a placa com defeito.'],
  ['youtube', '🌐 Músicas da internet falhando', 'Três falhas seguidas ao pesquisar ou baixar (yt-dlp desatualizado ou internet fora). Avisa no máximo a cada 2 horas.'],
];

const dataBr = (dia) => dia.split('-').reverse().join('/');

export default function Alertas({ chamar }) {
  const [dados, setDados] = useState(null);
  const [form, setForm] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [ocupado, setOcupado] = useState('');
  const [conversas, setConversas] = useState(null);

  const carregar = useCallback(async () => {
    const d = await chamar('/admin/alertas');
    setDados(d);
    setForm({ alertas: d.alertas, fechamento: d.fechamento });
  }, [chamar]);

  useEffect(() => { carregar().catch((e) => setMensagem({ tipo: 'erro', texto: e.message })); }, [carregar]);

  async function salvar(e) {
    e.preventDefault();
    setMensagem(null);
    setSalvando(true);
    try {
      await chamar('/admin/alertas', { metodo: 'PUT', corpo: { alertas: form.alertas, fechamento: form.fechamento } });
      setMensagem({ tipo: 'ok', texto: '✔ Ajustes salvos.' });
      await carregar();
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setSalvando(false);
    }
  }

  async function testar(destino) {
    setMensagem(null);
    setOcupado(`teste-${destino}`);
    try {
      const r = await chamar('/admin/alertas/teste', { metodo: 'POST', corpo: { destino } });
      setMensagem(r.ok
        ? { tipo: 'ok', texto: `✔ Mensagem enviada${destino === 'boate' ? ' para a boate' : ''}. Confira o Telegram.` }
        : { tipo: 'erro', texto: `Não enviou: ${r.motivo}` });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setOcupado('');
    }
  }

  async function enviarFechamento() {
    setMensagem(null);
    setOcupado('fechamento');
    try {
      const r = await chamar('/admin/alertas/fechamento', { metodo: 'POST', corpo: { boate: form.fechamento.boate } });
      const falhas = [r.dono && !r.dono.ok && `você: ${r.dono.motivo}`, r.boate && !r.boate.ok && `boate: ${r.boate.motivo}`].filter(Boolean);
      setMensagem(falhas.length ? { tipo: 'erro', texto: `Não enviou (${falhas.join('; ')})` } : { tipo: 'ok', texto: '✔ Fechamento das últimas 24 h enviado. Confira o Telegram.' });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setOcupado('');
    }
  }

  async function descobrir() {
    setMensagem(null);
    setOcupado('conversas');
    try {
      setConversas((await chamar('/admin/alertas/conversas')).conversas);
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setOcupado('');
    }
  }

  if (!dados || !form) return mensagem ? <p className="aviso aviso-erro">{mensagem.texto}</p> : <div className="estado"><span className="carregando" /></div>;
  const { telegram } = dados;

  return (
    <div className="alertas">
      <h2>📲 Avisos no Telegram</h2>
      <p className="nota">
        A jukebox manda mensagem no seu celular quando algo dá problema e, se quiser, o fechamento do dia (e uma versão resumida para a boate).
        O token e as conversas ficam no arquivo <b>.env</b> do notebook: não aparecem aqui nem nos backups.
      </p>

      <div className={`sistema-item ${telegram.configurado ? 'sistema-ok' : 'sistema-atencao'}`}>
        <span className="sistema-icone" aria-hidden="true">{telegram.configurado ? '🟢' : '🟡'}</span>
        <div>
          <strong>{telegram.configurado ? 'Telegram configurado' : telegram.token ? 'Falta dizer para quem mandar' : 'Telegram não configurado'}</strong>
          <div className="sistema-detalhe">
            {telegram.configurado
              ? <>Avisos para você{telegram.boate_configurada ? ' e para a boate' : ''}. </>
              : null}
            {!telegram.token && (
              <ol className="alertas-passos">
                <li>No Telegram, procure por <b>@BotFather</b>, mande <code>/newbot</code> e siga os passos. Ele entrega um <b>token</b>.</li>
                <li>No arquivo <b>.env</b> (pasta do projeto) acrescente a linha <code>TELEGRAM_BOT_TOKEN=seu-token</code> e reinicie o servidor.</li>
                <li>Mande um “oi” para o seu bot no Telegram, volte aqui e clique em <b>Descobrir minha conversa</b>.</li>
                <li>Copie a linha <code>TELEGRAM_CHAT_ID=…</code> que aparecer para o <b>.env</b> e reinicie de novo.</li>
              </ol>
            )}
            {telegram.token && !telegram.configurado && (
              <ol className="alertas-passos">
                <li>Mande um “oi” para o seu bot no Telegram.</li>
                <li>Clique em <b>Descobrir minha conversa</b> abaixo e copie a linha <code>TELEGRAM_CHAT_ID=…</code> para o <b>.env</b>.</li>
                <li>Reinicie o servidor.</li>
              </ol>
            )}
          </div>
        </div>
      </div>

      {telegram.token && (
        <div className="card alertas-conversas">
          <div className="admin-acoes">
            <button className="btn btn-ciano btn-pequeno" disabled={ocupado === 'conversas'} onClick={descobrir}>{ocupado === 'conversas' ? 'Procurando…' : '🔎 Descobrir minha conversa'}</button>
            {telegram.configurado && <button className="btn btn-pequeno" disabled={ocupado === 'teste-dono'} onClick={() => testar('dono')}>✉ Mensagem de teste</button>}
            {telegram.boate_configurada && <button className="btn btn-fantasma btn-pequeno" disabled={ocupado === 'teste-boate'} onClick={() => testar('boate')}>✉ Teste para a boate</button>}
          </div>
          {conversas && conversas.length === 0 && <p className="vazio">Nenhuma conversa encontrada. Mande um “oi” para o bot e tente de novo.</p>}
          {conversas && conversas.length > 0 && (
            <ul className="admin-lista">
              {conversas.map((c) => (
                <li key={c.id} className="admin-linha">
                  <div className="admin-linha-info">
                    <strong>{c.nome} <small>({c.tipo})</small></strong>
                    <code>TELEGRAM_CHAT_ID={c.id}</code>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <small>Para o contato da boate, ele também precisa mandar um “oi” ao bot; o id dele vai em <code>TELEGRAM_CHAT_ID_BOATE=</code>.</small>
        </div>
      )}

      {mensagem && <p className={`aviso ${mensagem.tipo === 'erro' ? 'aviso-erro' : 'aviso-ok'}`}>{mensagem.texto}</p>}

      <form className="admin-form alertas-form" onSubmit={salvar}>
        <h2>O que avisar</h2>
        {TIPOS.map(([chave, titulo, detalhe]) => (
          <label key={chave} className="interruptor">
            <input type="checkbox" checked={form.alertas[chave]} onChange={(e) => setForm({ ...form, alertas: { ...form.alertas, [chave]: e.target.checked } })} />
            <span className="interruptor-trilho" aria-hidden="true" />
            <span><strong>{titulo}</strong><small>{detalhe}</small></span>
          </label>
        ))}

        <h2>📊 Fechamento do dia</h2>
        <label className="interruptor">
          <input type="checkbox" checked={form.fechamento.ativo} onChange={(e) => setForm({ ...form, fechamento: { ...form.fechamento, ativo: e.target.checked } })} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>Mandar o fechamento todo dia</strong>
            <small>Resumo das últimas 24 h até a hora escolhida (uma noite que passa da meia-noite fica inteira no mesmo fechamento): músicas, recados, faturado, sua parte, parte da boate, Pix recebido e as mais tocadas.</small>
          </span>
        </label>
        <label>Hora do fechamento
          <input className="campo mono" type="time" value={form.fechamento.hora} onChange={(e) => setForm({ ...form, fechamento: { ...form.fechamento, hora: e.target.value } })} />
        </label>
        <label className="interruptor" aria-disabled={!telegram.boate_configurada}>
          <input type="checkbox" checked={form.fechamento.boate} disabled={!telegram.boate_configurada} onChange={(e) => setForm({ ...form, fechamento: { ...form.fechamento, boate: e.target.checked } })} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>Mandar também para a boate</strong>
            <small>{telegram.boate_configurada ? 'A boate recebe só o faturado e o valor a repassar (sem a sua parte, o Pix total nem a cortesia).' : 'Defina TELEGRAM_CHAT_ID_BOATE no .env para liberar.'}</small>
          </span>
        </label>
        {dados.ultimo_fechamento && <small>Último fechamento automático: {dataBr(dados.ultimo_fechamento)}.</small>}

        <div className="admin-acoes">
          <button className="btn" disabled={salvando}>{salvando ? 'SALVANDO…' : 'SALVAR AJUSTES'}</button>
          {telegram.configurado && (
            <button type="button" className="btn btn-ciano" disabled={ocupado === 'fechamento'} onClick={enviarFechamento}>
              {ocupado === 'fechamento' ? 'Enviando…' : '📤 Enviar o fechamento das últimas 24 h agora'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
