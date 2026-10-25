import { useCallback, useEffect, useState } from 'react';
import { formatarReais } from '../../api.js';

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const ROTULOS = { na_fila: '✅ Entrou na fila', falhou: '❌ Falhou (crédito devolvido)', baixando: '⏳ Baixando…' };

function bytes(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

const paraForm = (c) => ({ ativo: c.ativo, preco: String(c.preco), max_min: String(c.max_min), automatica: c.automatica });

export default function Internet({ chamar }) {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const [aceite, setAceite] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [ocupado, setOcupado] = useState('');

  const carregar = useCallback(async () => {
    const r = await chamar('/admin/youtube');
    setD(r);
    setForm((atual) => atual ?? paraForm(r.config)); // não apaga o que o dono está digitando
    return r;
  }, [chamar]);

  useEffect(() => {
    carregar().catch((e) => setMensagem({ tipo: 'erro', texto: e.message }));
    const id = setInterval(() => carregar().catch(() => {}), 5000);
    return () => clearInterval(id);
  }, [carregar]);

  async function salvar(e) {
    e.preventDefault();
    setMensagem(null);
    setOcupado('salvar');
    try {
      const { config } = await chamar('/admin/youtube/config', {
        metodo: 'PUT',
        corpo: { ativo: form.ativo, preco: Number(form.preco), max_min: Number(form.max_min), automatica: form.automatica, aceite },
      });
      setForm(paraForm(config));
      const r = await carregar();
      setMensagem(config.ativo && !r.ytdlp.ok
        ? { tipo: 'erro', texto: 'Ajustes salvos, mas o yt-dlp não foi encontrado neste computador: os clientes ainda não veem a busca. Siga os passos acima.' }
        : { tipo: 'ok', texto: '✔ Ajustes salvos. Os celulares já foram atualizados.' });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setOcupado('');
    }
  }

  async function verificar() {
    setMensagem(null);
    setOcupado('verificar');
    try {
      const r = await chamar('/admin/youtube/verificar', { metodo: 'POST' });
      setD(r);
      setMensagem(r.ytdlp.ok ? { tipo: 'ok', texto: `✔ yt-dlp encontrado (versão ${r.ytdlp.versao}).` } : { tipo: 'erro', texto: r.ytdlp.erro });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setOcupado('');
    }
  }

  async function atualizar() {
    setMensagem(null);
    setOcupado('atualizar');
    try {
      const r = await chamar('/admin/youtube/atualizar', { metodo: 'POST' });
      setD(r);
      const { atualizacao } = r;
      setMensagem({
        tipo: atualizacao.ok ? 'ok' : 'erro',
        texto: atualizacao.atualizou
          ? `✔ yt-dlp atualizado: ${atualizacao.versao_antes} → ${atualizacao.versao_depois}.`
          : `${atualizacao.ok ? 'Nada a atualizar.' : 'Não consegui atualizar.'} ${atualizacao.saida}`,
      });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setOcupado('');
    }
  }

  if (!d || !form) return mensagem ? <p className="aviso aviso-erro">{mensagem.texto}</p> : <div className="estado"><span className="carregando" /></div>;

  const { ytdlp, hoje, acervo } = d;
  const precisaAceite = form.ativo && !d.config.aceite_em;
  const numero = (campo) => (
    <input className="campo mono" inputMode="numeric" value={form[campo]}
      onChange={(e) => setForm({ ...form, [campo]: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
  );

  return (
    <div className="internet-admin">
      <div className="admin-topo-interno">
        <h2>🌐 Músicas da internet</h2>
        <button className="btn btn-fantasma btn-pequeno" onClick={() => carregar().catch((e) => setMensagem({ tipo: 'erro', texto: e.message }))}>↻ Atualizar</button>
      </div>
      <p className="nota">
        O cliente pesquisa qualquer música na internet (YouTube), paga com créditos e a jukebox baixa o áudio e a capa na hora e coloca na fila.
        Dá certo para músicas que você não tem no acervo. Fica <b>desligado</b> até você ligar abaixo.
      </p>

      <div className="aviso-legal" role="note">
        <strong>⚠ Leia antes de ligar</strong>
        <p>
          Os termos do YouTube <b>não permitem baixar</b> vídeos, e as músicas têm <b>direitos autorais</b>: tocar cópias sem licença para o público de um
          estabelecimento comercial pode gerar cobrança ou ação de quem detém os direitos (no Brasil, também o ECAD cobra a execução pública de música).
          O risco é <b>seu</b>, que opera o negócio. Em caso de dúvida, fale com um advogado ou com o ECAD antes de usar.
        </p>
      </div>

      <h2>Situação do yt-dlp</h2>
      <div className={`sistema-item ${ytdlp.ok ? 'sistema-ok' : 'sistema-erro'}`}>
        <span className="sistema-icone" aria-hidden="true">{ytdlp.ok ? '🟢' : '🔴'}</span>
        <div>
          <strong>{ytdlp.ok ? `yt-dlp encontrado (versão ${ytdlp.versao})` : 'yt-dlp não encontrado'}</strong>
          <div className="sistema-detalhe">
            {ytdlp.ok ? (
              <>
                Programa: <code>{ytdlp.caminho}</code>.
                {ytdlp.js_runtime ? ' Usa o Node deste servidor para resolver os desafios do YouTube.' : ' Esta versão é antiga: atualize para funcionar com o YouTube de hoje.'}
                {d.em_preparo > 0 && <> {d.em_preparo} {d.em_preparo === 1 ? 'música está sendo baixada' : 'músicas estão sendo baixadas'} agora.</>}
              </>
            ) : (
              <>
                {ytdlp.erro}
                <ol className="internet-passos">
                  <li>No PowerShell: <code>winget install yt-dlp.yt-dlp</code> (aceite o pedido do Windows e espere terminar).</li>
                  <li><b>Feche o servidor</b>, abra um <b>novo</b> PowerShell e rode <code>npm start</code> de novo (o servidor só enxerga programas instalados depois quando reinicia).</li>
                  <li>Volte aqui e clique em <b>Verificar de novo</b>. Se o programa estiver em outra pasta, aponte <code>YTDLP_PATH</code> no <b>.env</b>.</li>
                </ol>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="admin-acoes">
        <button className="btn btn-ciano btn-pequeno" disabled={ocupado === 'verificar'} onClick={verificar}>{ocupado === 'verificar' ? 'Verificando…' : '🔎 Verificar de novo'}</button>
        {ytdlp.ok && (
          <button className="btn btn-fantasma btn-pequeno" disabled={ocupado === 'atualizar'} onClick={atualizar}>{ocupado === 'atualizar' ? 'Atualizando (pode levar 1 min)…' : '⬆ Atualizar o yt-dlp'}</button>
        )}
      </div>
      {ytdlp.ok && <small className="nota">O YouTube muda de tempos em tempos. Se os pedidos começarem a falhar, atualize o yt-dlp (o botão acima, ou <code>winget upgrade yt-dlp.yt-dlp</code>).</small>}

      {mensagem && <p className={`aviso ${mensagem.tipo === 'erro' ? 'aviso-erro' : 'aviso-ok'}`}>{mensagem.texto}</p>}

      <h2>Hoje</h2>
      <div className="tiles">
        <div className="tile">
          <span className="rotulo">Pedidos</span>
          <div className="tile-valor">{hoje.pedidos}</div>
          <small>{hoje.ok} entraram na fila · {hoje.falhas} falharam (crédito devolvido)</small>
        </div>
        <div className="tile">
          <span className="rotulo">Tocadas</span>
          <div className="tile-valor">{hoje.tocadas}</div>
          <small>{formatarReais(hoje.bruto)} faturados com músicas da internet</small>
        </div>
        <div className="tile">
          <span className="rotulo">Já baixadas</span>
          <div className="tile-valor">{acervo.musicas}</div>
          <small>{bytes(acervo.bytes)} em disco · pedir de novo é instantâneo</small>
        </div>
      </div>

      <h2>⚙ Ajustes</h2>
      <form className="admin-form internet-admin-form" onSubmit={salvar}>
        <label className="interruptor">
          <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>Aceitar pedidos de músicas da internet</strong>
            <small>Aparece para o cliente na busca (botão “Pesquisar na internet”). Só funciona com o yt-dlp instalado.</small>
          </span>
        </label>
        {precisaAceite && (
          <label className="marcar">
            <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
            <span>Li o aviso acima e <b>assumo a responsabilidade</b> pelo uso (direitos autorais e termos do YouTube).</span>
          </label>
        )}
        {d.config.aceite_em && <small>Aviso confirmado em {new Date(d.config.aceite_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</small>}
        <div className="admin-form-linha">
          <label>Preço de cada música (créditos)
            {numero('preco')}
            <small>Entra no faturamento e na divisão com a boate, como qualquer música (quando toca).</small>
          </label>
          <label>Duração máxima (minutos)
            {numero('max_min')}
            <small>Impede mixes e sets de horas na fila.</small>
          </label>
        </div>
        <label className="interruptor">
          <input type="checkbox" checked={form.automatica} onChange={(e) => setForm({ ...form, automatica: e.target.checked })} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>Usar também na playlist automática</strong>
            <small>Desligado (recomendado): a playlist sorteia só as músicas do seu acervo, nunca as baixadas da internet.</small>
          </span>
        </label>
        <button className="btn" disabled={ocupado === 'salvar' || (precisaAceite && !aceite)}>{ocupado === 'salvar' ? 'SALVANDO…' : 'SALVAR AJUSTES'}</button>
      </form>

      {d.recentes.length > 0 && (
        <>
          <h2>Últimos pedidos</h2>
          <ul className="historico">
            {d.recentes.map((r) => (
              <li key={r.id}>
                <span className="mono">{hora(r.criado_em)}</span>
                <b className={`evento ${r.status === 'na_fila' ? 'evento-criado' : r.status === 'falhou' ? 'evento-removido' : 'evento-lancado'}`}>{ROTULOS[r.status] ?? r.status}</b>
                <span>“{r.titulo}”{r.canal ? ` — ${r.canal}` : ''} · {r.quem} · {r.creditos} {r.creditos === 1 ? 'crédito' : 'créditos'}</span>
                {r.erro && <small>motivo: {r.erro}</small>}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Como gerenciar o que foi baixado</h2>
      <p className="nota">
        As músicas baixadas ficam no CD <b>“Músicas Sob Demanda”</b> (categoria “Sob demanda”), na aba <b>💿 Biblioteca</b>: lá você pode mudar o preço, ocultar do app ou <b>apagar o CD inteiro</b>{' '}
        (os arquivos são apagados e quem tinha pedido na fila recebe o crédito de volta). Os arquivos ficam na pasta <code>musicas\SobDemanda</code>. Para desligar tudo na hora, basta desmarcar o interruptor acima.
      </p>
    </div>
  );
}
