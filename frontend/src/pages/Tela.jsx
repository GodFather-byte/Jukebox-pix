import { useEffect, useState } from 'react';
import Capa from '../components/Capa.jsx';
import Progresso from '../components/Progresso.jsx';
import { api, capaUrl, textoEspera } from '../api.js';
import { useAgora, useApi, useManterAceso } from '../hooks.js';

const SEM_CARTAZES = { ativo: false, intervalo: 90, cartazes: [] };

function relogio(agora) {
  return new Date(agora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Tela do monitor da boate: QR pra abrir o app + o que está tocando e a fila. Sem sessão de cliente.
// Também mostra os recados pagos (um por vez, por cima de tudo) e os cartazes dos patrocinadores.
export default function Tela() {
  useManterAceso();
  const info = useApi('/info');
  const agora = useAgora(1000);
  const [fila, setFila] = useState({ agora_tocando: null, fila: [], total_aguardando: 0 });
  const [top, setTop] = useState([]);
  const [aviso, setAviso] = useState('');
  const [recado, setRecado] = useState(null); // { id, texto, ate }
  const [cartazes, setCartazes] = useState(SEM_CARTAZES);
  const [cartazAtual, setCartazAtual] = useState(null);
  const [conectado, setConectado] = useState(true);
  const [telaCheia, setTelaCheia] = useState(false);

  useEffect(() => {
    const carregarFila = () => api('/fila').then(setFila).catch(() => {});
    const carregarTop = () => api('/musicas/top-tocadas').then((d) => setTop(d.top)).catch(() => {});
    const carregarAviso = () => api('/config').then((c) => setAviso(c.aviso)).catch(() => {});
    const carregarRecado = () => api('/recados/atual').then((d) => setRecado(d.atual)).catch(() => {});
    // Só troca o estado se mudou de verdade: senão o rodízio dos cartazes reiniciaria a cada consulta.
    const carregarCartazes = () => api('/cartazes')
      .then((c) => setCartazes((atual) => (JSON.stringify(atual) === JSON.stringify(c) ? atual : c)))
      .catch(() => {});
    const carregarTudo = () => { carregarFila(); carregarTop(); carregarAviso(); carregarRecado(); carregarCartazes(); };
    carregarTudo();

    // ?tela=1 avisa o servidor que há um telão ligado (só então ele aceita recados pagos).
    const eventos = new EventSource('/api/eventos?tela=1');
    let ativo = true;
    let avisoQueda;
    eventos.addEventListener('fila', carregarFila);
    eventos.addEventListener('top', carregarTop);
    eventos.addEventListener('config', carregarAviso);
    eventos.addEventListener('recado', (e) => setRecado(JSON.parse(e.data).atual ?? null));
    eventos.addEventListener('cartazes', carregarCartazes);
    eventos.onopen = () => { if (!ativo) return; clearTimeout(avisoQueda); setConectado(true); carregarTudo(); };
    eventos.onerror = () => {
      clearTimeout(avisoQueda);
      avisoQueda = setTimeout(() => { if (ativo) setConectado(false); }, 2500);
    };
    const reserva = setInterval(carregarFila, 15_000);
    const reservaCartazes = setInterval(carregarCartazes, 5 * 60_000); // datas de validade mudam sozinhas
    return () => {
      ativo = false;
      clearTimeout(avisoQueda);
      eventos.close();
      clearInterval(reserva);
      clearInterval(reservaCartazes);
    };
  }, []);

  useEffect(() => {
    const aoMudar = () => setTelaCheia(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', aoMudar);
    return () => document.removeEventListener('fullscreenchange', aoMudar);
  }, []);

  function alternarTelaCheia() {
    if (document.fullscreenElement) document.exitFullscreen()?.catch(() => {});
    else document.documentElement.requestFullscreen()?.catch(() => {});
  }

  useEffect(() => {
    const aoTecla = (e) => {
      if ((e.key === 'f' || e.key === 'F') && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        alternarTelaCheia();
      }
    };
    window.addEventListener('keydown', aoTecla);
    return () => window.removeEventListener('keydown', aoTecla);
  }, []);

  // O recado some sozinho na hora marcada pelo servidor (mesmo se o aviso de "acabou" se perder).
  useEffect(() => {
    if (!recado?.ate) return undefined;
    const restante = Date.parse(recado.ate) - Date.now();
    const id = setTimeout(() => setRecado(null), Math.max(0, restante));
    return () => clearTimeout(id);
  }, [recado]);

  // Cartazes: de tempos em tempos um ocupa a tela por alguns segundos, em rodízio. Cada exibição é contada.
  useEffect(() => {
    if (!cartazes.ativo || cartazes.cartazes.length === 0) { setCartazAtual(null); return undefined; }
    let encerrado = false;
    let relogioCartaz;
    let vez = 0;
    const mostrar = () => {
      if (encerrado) return;
      const cartaz = cartazes.cartazes[vez % cartazes.cartazes.length];
      vez += 1;
      setCartazAtual(cartaz);
      api(`/cartazes/${cartaz.id}/exibido`, { metodo: 'POST' }).catch(() => {});
      relogioCartaz = setTimeout(() => {
        setCartazAtual(null);
        relogioCartaz = setTimeout(mostrar, cartazes.intervalo * 1000);
      }, cartaz.segundos * 1000);
    };
    relogioCartaz = setTimeout(mostrar, Math.min(cartazes.intervalo, 20) * 1000); // o primeiro aparece logo depois de abrir
    return () => { encerrado = true; clearTimeout(relogioCartaz); setCartazAtual(null); };
  }, [cartazes]);

  const atual = fila.agora_tocando;
  const seguinte = fila.fila[0];
  const capa = atual?.musica.capa ? encodeURI(capaUrl(atual.musica.capa)) : null;

  useEffect(() => {
    const nome = info.dados?.nome || 'Jukebox';
    document.title = atual ? `${atual.musica.titulo} · ${nome}` : nome;
    return () => { document.title = 'Jukebox'; };
  }, [atual?.musica.titulo, info.dados?.nome]);

  return (
    <main className="tela">
      <div
        className="tela-fundo"
        key={capa || atual?.musica.cor || 'vazio'}
        style={capa ? { backgroundImage: `url("${capa}")` } : { background: atual?.musica.cor || '#121835' }}
      />

      <aside className="tela-qr">
        <h1>🎵 {info.dados?.nome ?? 'Jukebox'}</h1>
        {info.dados && <img src={info.dados.qr_app} alt={`QR code para abrir ${info.dados.url_app}`} />}
        <p className="tela-passos"><b>1.</b> Aponte a câmera do celular<br /><b>2.</b> Pague com Pix<br /><b>3.</b> Escolha sua música!</p>
        {info.dados && <code>{info.dados.url_app.replace('http://', '')}</code>}
        <small>Conecte-se ao WiFi da casa</small>
      </aside>

      <section className="tela-principal">
        <div className="tela-controles">
          <time className="tela-relogio mono" dateTime={new Date(agora).toISOString()}>{relogio(agora)}</time>
          <button type="button" className="btn btn-pequeno btn-fantasma tela-cheia" onClick={alternarTelaCheia}>
            {telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
          </button>
        </div>
        {!conectado && <div className="tela-offline" role="alert">Sem conexão com a jukebox. Tentando de novo…</div>}
        {aviso && <div className="tela-aviso" role="status">📣 {aviso}</div>}

        <div className="tela-agora">
          <div className="tela-agora-topo">
            <span className="selo selo-ciano">▶ TOCANDO AGORA</span>
            {atual && (
              <span className="eq" aria-hidden="true"><span /><span /><span /><span /><span /></span>
            )}
          </div>
          {atual ? (
            <div className="tela-agora-corpo" key={atual.id}>
              <Capa capa={atual.musica.capa} icone={atual.musica.icone} cor={atual.musica.cor} titulo={atual.musica.cd} className="capa-grande" prioridade />
              <div>
                <strong aria-live="polite">{atual.musica.titulo}</strong>
                <span>{atual.musica.artista}</span>
                <small>{atual.automatica ? '🎲 Playlist automática' : atual.casa ? '🏠 Pedido da casa' : `pedida por ${atual.quem}`}</small>
              </div>
            </div>
          ) : (
            <p className="tela-vazio">Escaneie o QR code e escolha a próxima música 🎶</p>
          )}
          <Progresso item={atual} mostrarTempo />
          {seguinte && (
            <p className="tela-seguir">
              A seguir: <strong>{seguinte.prioridade ? '⚡ ' : ''}{seguinte.musica.titulo}</strong>
              <span> · {seguinte.musica.artista} · {textoEspera(seguinte.espera_segundos)}</span>
            </p>
          )}
        </div>

        <div className="tela-listas">
          <div>
            <h2>Próximas</h2>
            {fila.fila.length === 0 && <p className="vazio">Fila livre!</p>}
            <ol className="fila-lista">
              {fila.fila.slice(0, 6).map((item, i) => (
                <li key={item.id} className={`fila-item ${i === 0 ? 'seguir' : ''}`}>
                  <span className="fila-pos mono">{i + 1}</span>
                  <div className="fila-item-info"><strong>{item.prioridade ? '⚡ ' : ''}{item.musica.titulo}</strong><span>{item.musica.artista}</span></div>
                  <small>{item.quem} · {textoEspera(item.espera_segundos)}</small>
                </li>
              ))}
            </ol>
            {fila.total_aguardando > 6 && <p className="fila-mais">+ {fila.total_aguardando - 6} na fila</p>}
          </div>

          {top.length > 0 && (
            <div>
              <h2>🏆 Mais tocadas</h2>
              <ol className="fila-lista">
                {top.map((m, i) => (
                  <li key={m.id} className="fila-item">
                    <span className="fila-pos">{['🥇', '🥈', '🥉'][i] ?? i + 1}</span>
                    <div className="fila-item-info"><strong>{m.titulo}</strong><span>{m.artista}</span></div>
                    <small className="mono">{m.vezes_tocada}x</small>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>

      {cartazAtual && (
        <div className="tela-cartaz" key={cartazAtual.id}>
          <img src={cartazAtual.imagem} alt={cartazAtual.legenda ?? 'Cartaz'} />
          {cartazAtual.legenda && <p>{cartazAtual.legenda}</p>}
        </div>
      )}

      {recado && (
        <div className="tela-recado" role="alert" key={recado.id}>
          <span className="selo selo-rosa">💬 RECADO PARA O SALÃO</span>
          <p>{recado.texto}</p>
        </div>
      )}
    </main>
  );
}
