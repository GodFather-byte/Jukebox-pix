import { Link, useParams } from 'react-router-dom';
import Capa from '../components/Capa.jsx';
import Estado from '../components/Estado.jsx';
import MusicaItem from '../components/MusicaItem.jsx';
import { textoDias } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';
import { useApi } from '../hooks.js';

export default function Musicas() {
  const { id } = useParams();
  const { versoes } = useSessao();
  const { dados, erro, carregando } = useApi(`/cds/${id}/musicas`, [versoes.top]);
  if (!dados) return <Estado carregando={carregando} erro={erro} />;

  const { cd, musicas } = dados;
  return (
    <>
      <section className="cd-topo">
        <Capa capa={cd.capa} icone={cd.icone} cor={cd.cor} titulo={cd.titulo} className="capa-grande" />
        <div>
          <h1>{cd.titulo}</h1>
          <Link to={`/artista/${cd.artista_id}`} className="cd-artista">{cd.artista}</Link>
          <small>{cd.icone} {cd.categoria}{cd.ano ? ` · ${cd.ano}` : ''} · {cd.total_musicas} músicas</small>
          {cd.status === 'novo' && <span className="selo selo-rosa">🆕 Lançamento · {textoDias(cd.dias_restantes)}</span>}
        </div>
      </section>

      <ul className="lista-musicas">
        {musicas.map((m) => <MusicaItem key={m.id} musica={m} mostrarCapa={false} />)}
      </ul>
    </>
  );
}
