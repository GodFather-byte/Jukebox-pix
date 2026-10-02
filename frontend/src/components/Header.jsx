import { Link, useLocation, useNavigate } from 'react-router-dom';
import Saldo from './Saldo.jsx';

export default function Header() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const naHome = pathname === '/';

  return (
    <header className="topo">
      {naHome ? (
        <Link to="/" className="logo">🎵 <span>JUKEBOX</span></Link>
      ) : (
        <button className="btn-icone" onClick={() => navigate(-1)} aria-label="Voltar">←</button>
      )}
      <Saldo />
    </header>
  );
}
