import { Link, useParams } from 'react-router-dom';
import Estado from '../components/Estado.jsx';
import { capaUrl } from '../api.js';
import { useApi } from '../hooks.js';

const iniciais = (nome) => nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export default function Artistas() {
  const { id } = useParams();
  const { dados, erro, carregando } = useApi(`/categorias/${id}/artistas`);
  if (!dados) return <Estado carregando={carregando} erro={erro} />;

  const { categoria, artistas } = dados;
  return (
    <>
      <h1 className="titulo-categoria" style={{ '--cor': categoria.cor }}>
        <span aria-hidden="true">{categoria.icone}</span> {categoria.nome}
      </h1>
      {artistas.length === 0 && <p className="vazio">Nenhum artista nesta categoria ainda.</p>}
      <ul className="lista-artistas">
        {artistas.map((a) => (
          <li key={a.id}>
            <Link to={`/artista/${a.id}`} className="artista" style={{ '--cor': categoria.cor }}>
              {a.foto
                ? <img className="avatar" src={capaUrl(a.foto)} alt="" loading="lazy" />
                : <span className="avatar avatar-iniciais" aria-hidden="true">{iniciais(a.nome)}</span>}
              <div>
                <strong>{a.nome}</strong>
                <small>{a.total_cds} {a.total_cds === 1 ? 'CD' : 'CDs'}</small>
              </div>
              <span className="seta" aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
