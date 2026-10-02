import { useEffect, useState } from 'react';
import Capa from '../components/Capa.jsx';
import Progresso from '../components/Progresso.jsx';
import { api } from '../api.js';
import { useApi } from '../hooks.js';

// Tela do monitor da boate: QR pra abrir o app + o que está tocando e a fila. Sem sessão de cliente.
export default function Tela() {
  const info = useApi('/info');
  const [fila, setFila] = useState({ agora_tocando: null, fila: [], total_aguardando: 0 });
  const [top, setTop] = useState([]);
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    const carregarFila = () => api('/fila').then(setFila).catch(() => {});
    const carregarTop = () => api('/musicas/top-tocadas').then((d) => setTop(d.top)).catch(() => {});
    const carregarAviso = () => api('/config').then((c) => setAviso(c.aviso)).catch(() => {});
    carregarFila();
    carregarTop();
    carregarAviso();

    const eventos = new EventSource('/api/eventos');
    eventos.addEventListener('fila', carregarFila);
    eventos.addEventListener('top', carregarTop);
    eventos.addEventListener('config', carregarAviso);
    eventos.onopen = () => { carregarFila(); carregarTop(); carregarAviso(); };
    const reserva = setInterval(carregarFila, 15_000);
    return () => { eventos.close(); clearInterval(reserva); };
  }, []);

  const atual = fila.agora_tocando;

  return (
    <main className="tela">
      <aside className="tela-qr">
        <h1>🎵 {info.dados?.nome ?? 'Jukebox'}</h1>
        {info.dados && <img src={info.dados.qr_app} alt={`QR code para abrir ${info.dados.url_app}`} />}
        <p className="tela-passos"><b>1.</b> Aponte a câmera do celular<br /><b>2.</b> Pague com Pix<br /><b>3.</b> Escolha sua música!</p>
        {info.dados && <code>{info.dados.url_app.replace('http://', '')}</code>}
        <small>Conecte-se ao WiFi da casa</small>
      </aside>

      <section className="tela-principal">
        {aviso && <div className="tela-aviso" role="status">📣 {aviso}</div>}

        <div className="tela-agora">
          <span className="selo selo-ciano">▶ TOCANDO AGORA</span>
          {atual ? (
            <div className="tela-agora-corpo">
              <Capa capa={atual.musica.capa} icone={atual.musica.icone} cor={atual.musica.cor} titulo={atual.musica.cd} className="capa-grande" />
              <div>
                <strong>{atual.musica.titulo}</strong>
                <span>{atual.musica.artista}</span>
                <small>{atual.automatica ? '🎲 Playlist automática' : `pedida por ${atual.quem}`}</small>
              </div>
            </div>
          ) : (
            <p className="tela-vazio">Escaneie o QR code e escolha a próxima música 🎶</p>
          )}
          <Progresso item={atual} />
        </div>

        <div className="tela-listas">
          <div>
            <h2>Próximas</h2>
            {fila.fila.length === 0 && <p className="vazio">Fila livre!</p>}
            <ol className="fila-lista">
              {fila.fila.slice(0, 6).map((item, i) => (
                <li key={item.id} className="fila-item">
                  <span className="fila-pos mono">{i + 1}</span>
                  <div className="fila-item-info"><strong>{item.prioridade ? '⚡ ' : ''}{item.musica.titulo}</strong><span>{item.musica.artista}</span></div>
                  <small>{item.quem}</small>
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
    </main>
  );
}
