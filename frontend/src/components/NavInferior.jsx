import { NavLink } from 'react-router-dom';
import { useSessao } from '../context/Sessao.jsx';

export default function NavInferior() {
  const { fila } = useSessao();
  const itens = [
    { para: '/', icone: '🏠', texto: 'Início', fim: true },
    { para: '/busca', icone: '🔍', texto: 'Buscar' },
    { para: '/top', icone: '🏆', texto: 'Top' },
    { para: '/fila', icone: '📋', texto: 'Fila', badge: fila.total_aguardando },
  ];

  return (
    <nav className="nav-inferior" aria-label="Navegação principal">
      {itens.map((item) => (
        <NavLink key={item.para} to={item.para} end={item.fim} className="nav-item">
          <span className="nav-icone" aria-hidden="true">{item.icone}</span>
          <span>{item.texto}</span>
          {item.badge > 0 && <b className="nav-badge mono">{item.badge}</b>}
        </NavLink>
      ))}
    </nav>
  );
}
