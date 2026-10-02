import { useParams } from 'react-router-dom';
import CdCard from '../components/CdCard.jsx';
import Estado from '../components/Estado.jsx';
import { useApi } from '../hooks.js';

export default function CDs() {
  const { id } = useParams();
  const { dados, erro, carregando } = useApi(`/artistas/${id}/cds`);
  if (!dados) return <Estado carregando={carregando} erro={erro} />;

  const { artista, cds } = dados;
  return (
    <>
      <h1 className="titulo-categoria" style={{ '--cor': artista.cor }}>{artista.nome}</h1>
      <p className="subtitulo">{artista.icone} {artista.categoria}</p>
      {cds.length === 0 && <p className="vazio">Nenhum CD disponível ainda.</p>}
      <div className="grade-cds">
        {cds.map((cd) => <CdCard key={cd.id} cd={cd} mostrarArtista={false} />)}
      </div>
    </>
  );
}
