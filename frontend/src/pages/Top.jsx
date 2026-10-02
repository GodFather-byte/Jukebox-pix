import Estado from '../components/Estado.jsx';
import MusicaItem from '../components/MusicaItem.jsx';
import { useSessao } from '../context/Sessao.jsx';
import { useApi } from '../hooks.js';

export default function Top() {
  const { versoes } = useSessao();
  const { dados, erro, carregando } = useApi('/musicas/top-tocadas?limite=50', [versoes.top]);
  if (!dados) return <Estado carregando={carregando} erro={erro} />;

  return (
    <>
      <h1>🏆 Mais tocadas</h1>
      {dados.top.length === 0 && <p className="vazio">Ainda não tocou nada. Seja o primeiro!</p>}
      <ul className="lista-musicas">
        {dados.top.map((m, i) => <MusicaItem key={m.id} musica={m} posicao={i} />)}
      </ul>
    </>
  );
}
