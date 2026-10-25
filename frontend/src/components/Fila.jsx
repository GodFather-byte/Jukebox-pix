import Capa from './Capa.jsx';
import Progresso from './Progresso.jsx';
import { formatarDuracao, textoEspera } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';

function ResumoMinhas({ atual, proximas }) {
  const tocando = atual?.minha ? atual : null;
  const esperando = proximas.filter((item) => item.minha);
  if (!tocando && esperando.length === 0) return null;

  if (tocando) {
    return (
      <div className="card sua-vez" role="status">
        <span className="selo selo-rosa">SUA VEZ</span>
        <strong>{tocando.musica.titulo}</strong>
        <span>Está tocando agora no salão</span>
      </div>
    );
  }

  const primeira = esperando[0];
  const posicao = proximas.findIndex((item) => item.id === primeira.id) + 1;
  return (
    <div className="card sua-vez" role="status">
      <span className="selo selo-rosa">SUA VEZ</span>
      <strong>{esperando.length === 1 ? 'Você tem 1 música na fila' : `Você tem ${esperando.length} músicas na fila`}</strong>
      <span>A próxima é a {posicao}ª · {textoEspera(primeira.espera_segundos)} · {primeira.musica.titulo}</span>
    </div>
  );
}

// `limite` corta a lista (prévia na home); sem limite mostra a fila toda.
export default function Fila({ limite }) {
  const { fila } = useSessao();
  const { agora_tocando: atual, fila: proximas, total_aguardando: total } = fila;
  const itens = limite ? proximas.slice(0, limite) : proximas;

  return (
    <div className="fila">
      <ResumoMinhas atual={atual} proximas={proximas} />

      {atual ? (
        <div className={`fila-agora card ${atual.minha ? 'minha' : ''}`}>
          <span className="selo selo-ciano">▶ TOCANDO AGORA</span>
          <div className="fila-agora-corpo">
            <Capa capa={atual.musica.capa} icone={atual.musica.icone} cor={atual.musica.cor} titulo={atual.musica.cd} />
            <div className="fila-agora-info">
              <strong>{atual.musica.titulo}</strong>
              <span>{atual.musica.artista}</span>
              <small>{atual.automatica ? '🎲 Playlist automática' : atual.casa ? '🏠 Pedido da casa' : `pedida por ${atual.minha ? 'você' : atual.quem}`}</small>
            </div>
          </div>
          <Progresso item={atual} mostrarTempo />
        </div>
      ) : (
        <p className="vazio">Nada tocando agora. Escolha uma música! 🎶</p>
      )}

      {itens.length > 0 && (
        <ol className="fila-lista">
          {itens.map((item, i) => (
            <li key={item.id} className={`fila-item ${item.minha ? 'minha' : ''}`}>
              <span className="fila-pos mono">{i + 1}</span>
              <Capa capa={item.musica.capa} icone={item.musica.icone} cor={item.musica.cor} titulo="" className="capa-pequena" />
              <div className="fila-item-info">
                <strong>{item.prioridade ? '⚡ ' : ''}{item.musica.titulo}</strong>
                <span>{item.musica.artista}</span>
              </div>
              <div className="fila-item-meta">
                <small>{item.minha ? 'você' : item.quem}</small>
                <small className="mono">{textoEspera(item.espera_segundos)}</small>
              </div>
            </li>
          ))}
        </ol>
      )}

      {limite && total > itens.length && <p className="fila-mais">+ {total - itens.length} na fila</p>}
      {!limite && !itens.length && atual && <p className="vazio">Ninguém na fila. Sua música toca em seguida!</p>}
      {!limite && itens.some((i) => i.musica.duracao) && (
        <p className="fila-nota">Duração total na fila: {formatarDuracao(itens.reduce((t, i) => t + (i.musica.duracao ?? 0), 0))}</p>
      )}
    </div>
  );
}
