import Capa from './Capa.jsx';
import Progresso from './Progresso.jsx';
import { formatarDuracao } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';

function textoEspera(segundos) {
  if (segundos < 45) return 'em instantes';
  return `em ~${Math.max(1, Math.round(segundos / 60))} min`;
}

// `limite` corta a lista (prévia na home); sem limite mostra a fila toda.
export default function Fila({ limite }) {
  const { fila } = useSessao();
  const { agora_tocando: atual, fila: proximas, total_aguardando: total } = fila;
  const itens = limite ? proximas.slice(0, limite) : proximas;

  return (
    <div className="fila">
      {atual ? (
        <div className="fila-agora card">
          <span className="selo selo-ciano">▶ TOCANDO AGORA</span>
          <div className="fila-agora-corpo">
            <Capa capa={atual.musica.capa} icone={atual.musica.icone} cor={atual.musica.cor} titulo={atual.musica.cd} />
            <div className="fila-agora-info">
              <strong>{atual.musica.titulo}</strong>
              <span>{atual.musica.artista}</span>
              <small>{atual.automatica ? '🎲 Playlist automática' : `pedida por ${atual.minha ? 'você' : atual.quem}`}</small>
            </div>
          </div>
          <Progresso item={atual} />
        </div>
      ) : (
        <p className="vazio">Nada tocando agora. Escolha uma música! 🎶</p>
      )}

      {itens.length > 0 && (
        <ol className="fila-lista">
          {itens.map((item, i) => (
            <li key={item.id} className={`fila-item ${item.minha ? 'minha' : ''}`}>
              <span className="fila-pos mono">{i + 1}</span>
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
