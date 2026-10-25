import { Link, useLocation } from 'react-router-dom';
import Capa from './Capa.jsx';
import Progresso from './Progresso.jsx';
import { formatarRestante, segundosRestantes } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';
import { useAgora } from '../hooks.js';

export default function MiniPlayer() {
  const { fila } = useSessao();
  const { pathname } = useLocation();
  const agora = useAgora(1000);
  const atual = fila.agora_tocando;

  // Na própria página da fila ele só repetiria o card "tocando agora".
  if (!atual || pathname === '/fila') return null;

  const restante = formatarRestante(segundosRestantes(atual, agora));
  const detalhe = atual.minha
    ? 'Sua música está tocando'
    : `${atual.musica.artista}${fila.total_aguardando ? ` · +${fila.total_aguardando} na fila` : ''}`;

  return (
    <Link to="/fila" className={`miniplayer ${atual.minha ? 'minha' : ''}`} aria-label="Ver fila de músicas">
      <span className="miniplayer-capa" aria-hidden="true">
        <Capa capa={atual.musica.capa} icone={atual.musica.icone} cor={atual.musica.cor} titulo="" className="capa-pequena" />
      </span>
      <div className="miniplayer-info">
        <strong>{atual.musica.titulo}</strong>
        <span>{detalhe}</span>
      </div>
      {restante && <span className="miniplayer-tempo mono">{restante}</span>}
      <Progresso item={atual} />
    </Link>
  );
}
