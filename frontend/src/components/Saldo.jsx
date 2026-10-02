import { Link } from 'react-router-dom';
import { useSessao } from '../context/Sessao.jsx';

export default function Saldo() {
  const { saldo } = useSessao();
  return (
    <Link to="/pagar" className="saldo" aria-label={`Saldo: ${saldo} créditos. Toque para adicionar créditos`}>
      <span aria-hidden="true">💰</span>
      <b className="mono">{saldo}</b>
      <small>{saldo === 1 ? 'crédito' : 'créditos'}</small>
    </Link>
  );
}
