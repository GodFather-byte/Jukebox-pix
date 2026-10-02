import { Link } from 'react-router-dom';

export default function GradeCategorias({ categorias }) {
  return (
    <div className="grade-categorias">
      {categorias.map((c) => (
        <Link key={c.id} to={`/categoria/${c.id}`} className="categoria" style={{ '--cor': c.cor }}>
          <span className="categoria-icone" aria-hidden="true">{c.icone}</span>
          <strong>{c.nome}</strong>
          <small>{c.total_artistas} {c.total_artistas === 1 ? 'artista' : 'artistas'}</small>
        </Link>
      ))}
    </div>
  );
}
