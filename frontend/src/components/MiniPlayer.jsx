import { Link, useLocation } from 'react-router-dom';
import Progresso from './Progresso.jsx';
import { useSessao } from '../context/Sessao.jsx';

export default function MiniPlayer() {
  const { fila } = useSessao();
  const { pathname } = useLocation();
  const atual = fila.agora_tocando;

  // Na própria página da fila ele só repetiria o card "tocando agora".
  if (!atual || pathname === '/fila') return null;

  return (
    <Link to="/fila" className="miniplayer" aria-label="Ver fila de músicas">
      <span className="miniplayer-icone" aria-hidden="true">{atual.automatica ? '🎲' : '▶'}</span>
      <div className="miniplayer-info">
        <strong>{atual.musica.titulo}</strong>
        <span>{atual.musica.artista}{fila.total_aguardando ? ` · +${fila.total_aguardando} na fila` : ''}</span>
      </div>
      <Progresso item={atual} />
    </Link>
  );
}
