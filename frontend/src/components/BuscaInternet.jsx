import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, formatarDuracao } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';
import { useToast } from '../context/Toast.jsx';

function Resultado({ item, estado, aoPedir }) {
  const rotulo = estado === 'fila' ? '✔ NA FILA' : estado === 'preparando' ? '⏳ AGUARDE' : item.na_casa ? '+ ADICIONAR' : '🎶 PEDIR';
  return (
    <li className="musica musica-web">
      <img className="web-thumb" src={item.thumb} alt="" loading="lazy" width="72" height="40" />
      <div className="musica-info">
        <strong>{item.titulo}</strong>
        <span>{item.canal}</span>
        <small className="musica-meta">
          <span className="mono">{formatarDuracao(item.duracao)}</span>
          <span className="preco-tag" title="créditos cobrados por esta música">💰 {item.creditos} {item.creditos === 1 ? 'crédito' : 'créditos'}</span>
          {item.na_casa && <span className="web-na-casa" title="Já foi baixada antes: entra na fila na hora">✔ na casa</span>}
        </small>
      </div>
      <button
        className={`btn btn-add ${estado === 'fila' ? 'btn-ok' : ''}`}
        onClick={() => aoPedir(item)}
        disabled={estado !== 'livre'}
        aria-label={`${item.na_casa ? 'Adicionar' : 'Pedir'} ${item.titulo} por ${item.creditos} ${item.creditos === 1 ? 'crédito' : 'créditos'}`}
      >
        {rotulo}
      </button>
    </li>
  );
}

// Pesquisa no YouTube pelo servidor da jukebox. A música nova é baixada na hora e entra na fila; se algo der
// errado o crédito volta sozinho. Só aparece se o dono ligou o recurso (e o yt-dlp está funcionando no servidor).
export default function BuscaInternet({ termo }) {
  const { sessao, config, preparando, atualizarSessao, recarregarPreparando } = useSessao();
  const mostrar = useToast();
  const navigate = useNavigate();
  const [fase, setFase] = useState('fechado'); // fechado | buscando | pronto | erro
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState({}); // video_id -> true enquanto o pedido está indo
  const [naFila, setNaFila] = useState({}); // video_id -> true quando já entrou na fila

  useEffect(() => {
    setFase('fechado');
    setDados(null);
    setErro('');
  }, [termo]);

  // A música entrou na fila: o botão mostra "NA FILA" por uns segundos e depois volta ao normal (já "na casa"), como nas outras listas.
  const marcarNaFila = (id, segundos) => {
    setNaFila((n) => ({ ...n, [id]: true }));
    setDados((d) => (d ? { ...d, resultados: d.resultados.map((r) => (r.video_id === id ? { ...r, na_casa: true } : r)) } : d));
    setTimeout(() => setNaFila((n) => ({ ...n, [id]: false })), segundos * 1000);
  };

  // Quando o download termina, o servidor avisa.
  useEffect(() => {
    const aoEvento = (e) => {
      const { video_id: id, status } = e.detail ?? {};
      if (id && status === 'na_fila') marcarNaFila(id, 4);
    };
    window.addEventListener('jukebox:youtube', aoEvento);
    return () => window.removeEventListener('jukebox:youtube', aoEvento);
  }, []);

  if (!config.youtube.ativo) return null;

  async function pesquisar() {
    setFase('buscando');
    setErro('');
    try {
      setDados(await api(`/youtube/buscar?q=${encodeURIComponent(termo)}&session_id=${sessao.id}`));
      setFase('pronto');
    } catch (e) {
      setErro(e.message);
      setFase('erro');
    }
  }

  async function pedir(item) {
    if (!item.na_casa && !window.confirm(
      `“${item.titulo}” será baixada da internet agora e entra na fila em cerca de 1 minuto.\nCusta ${item.creditos} ${item.creditos === 1 ? 'crédito' : 'créditos'} (devolvidos se algo der errado). Confirmar?`,
    )) return;

    setEnviando((v) => ({ ...v, [item.video_id]: true }));
    try {
      const r = await api('/youtube/comprar', { metodo: 'POST', corpo: { session_id: sessao.id, video_id: item.video_id } });
      atualizarSessao({ saldo: r.saldo });
      if (r.pronto) {
        marcarNaFila(item.video_id, 2);
        mostrar(`"${item.titulo}" entrou na fila 🎶`, { tipo: 'ok' });
      } else {
        await recarregarPreparando();
        mostrar('Preparando a sua música… ela entra na fila em instantes.', { tipo: 'ok' });
      }
    } catch (e) {
      if (e.codigo === 'JA_PEDIDA') {
        await recarregarPreparando();
      } else {
        mostrar(e.message, {
          tipo: 'erro',
          acao: e.codigo === 'SALDO_INSUFICIENTE' ? { texto: 'PAGAR', aoClicar: () => navigate('/pagar') } : undefined,
        });
      }
    } finally {
      setEnviando((v) => ({ ...v, [item.video_id]: false }));
    }
  }

  const estadoDe = (item) => {
    if (naFila[item.video_id]) return 'fila';
    if (enviando[item.video_id] || preparando.some((p) => p.video_id === item.video_id)) return 'preparando';
    return 'livre';
  };

  return (
    <section className="internet secao">
      {fase === 'fechado' && (
        <div className="card internet-chamada">
          <span className="internet-icone" aria-hidden="true">🌐</span>
          <div>
            <strong>Não achou? Pesquise na internet</strong>
            <small>A música é baixada do YouTube na hora e entra na fila em cerca de 1 minuto · {config.youtube.preco} {config.youtube.preco === 1 ? 'crédito' : 'créditos'}</small>
          </div>
          <button className="btn btn-ciano" onClick={pesquisar}>🔎 PESQUISAR “{termo}”</button>
        </div>
      )}

      {fase === 'buscando' && (
        <div className="estado">
          <span className="carregando" aria-label="Pesquisando na internet" />
          <small>Pesquisando na internet…</small>
        </div>
      )}

      {fase === 'erro' && (
        <div className="estado estado-erro">
          <p>{erro}</p>
          <button className="btn btn-fantasma" onClick={pesquisar}>Tentar de novo</button>
        </div>
      )}

      {fase === 'pronto' && dados && (
        <>
          <h2>🌐 Na internet (YouTube)</h2>
          {dados.resultados.length === 0
            ? <p className="vazio">Nada encontrado na internet para “{termo}”. Tente outras palavras.</p>
            : (
              <ul className="lista-musicas">
                {dados.resultados.map((item) => <Resultado key={item.video_id} item={item} estado={estadoDe(item)} aoPedir={pedir} />)}
              </ul>
            )}
          <small className="nota">Só aparecem músicas de até {dados.max_min} minutos. Se o download falhar, os créditos voltam para você.</small>
        </>
      )}
    </section>
  );
}
