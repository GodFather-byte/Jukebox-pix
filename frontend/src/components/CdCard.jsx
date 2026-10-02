import { Link } from 'react-router-dom';
import Capa from './Capa.jsx';
import { textoDias } from '../api.js';

export default function CdCard({ cd, mostrarArtista = true }) {
  return (
    <Link to={`/cd/${cd.id}`} className="cd-card">
      <div className="cd-card-capa">
        <Capa capa={cd.capa} icone={cd.icone} cor={cd.cor} titulo={cd.titulo} />
        {cd.status === 'novo' && <span className="selo selo-rosa cd-card-selo">🆕 {textoDias(cd.dias_restantes)}</span>}
      </div>
      <strong>{cd.titulo}</strong>
      <span>{mostrarArtista ? cd.artista : `${cd.ano ?? ''} · ${cd.total_musicas} músicas`}</span>
    </Link>
  );
}
