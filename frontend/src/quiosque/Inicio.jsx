import { Link } from 'react-router-dom';
import CdCard from '../components/CdCard.jsx';
import Estado from '../components/Estado.jsx';
import MusicaItem from '../components/MusicaItem.jsx';
import { useSessao } from '../context/Sessao.jsx';
import { useApi } from '../hooks.js';

// Início no estilo Spotify / YouTube Music: atalhos de gêneros, lançamentos em capas e as mais tocadas da casa.
export default function Inicio() {
  const { versoes, config } = useSessao();
  const categorias = useApi('/categorias', [versoes.lancamentos]);
  const lancamentos = useApi('/cds/lancamentos', [versoes.lancamentos]);
  const top = useApi('/musicas/top-tocadas', [versoes.top]);
  const sugestoes = useApi('/musicas/sugestoes', [versoes.top]);

  const generos = categorias.dados?.categorias ?? [];
  const novos = lancamentos.dados?.lancamentos ?? [];
  const ranking = top.dados?.top ?? [];
  const sugeridas = sugestoes.dados?.sugestoes ?? [];

  return (
    <div className="qk-inicio">
      {config.aviso && <div className="qk-faixa" role="status">📣 {config.aviso}</div>}

      <Link to="/buscar" className="qk-busca-atalho">
        <span aria-hidden="true">⌕</span> O que você quer ouvir? Música, artista ou CD
      </Link>

      {generos.length > 0 && (
        <div className="qk-atalhos">
          {generos.slice(0, 8).map((c) => (
            <Link key={c.id} to={`/categoria/${c.id}`} className="qk-atalho" style={{ '--cor': c.cor }}>
              <span aria-hidden="true">{c.icone}</span>
              <strong>{c.nome}</strong>
            </Link>
          ))}
        </div>
      )}

      {novos.length > 0 && (
        <section className="qk-secao">
          <h2>Lançamentos</h2>
          <div className="qk-prateleira">
            {novos.map((cd) => <CdCard key={cd.id} cd={cd} />)}
          </div>
        </section>
      )}

      {ranking.length > 0 && (
        <section className="qk-secao">
          <div className="qk-secao-topo">
            <h2>Mais tocadas da casa</h2>
            <Link to="/top">Ver tudo</Link>
          </div>
          <ul className="lista-musicas">
            {ranking.map((m, i) => <MusicaItem key={m.id} musica={m} posicao={i} />)}
          </ul>
        </section>
      )}

      {sugeridas.length > 0 && (
        <section className="qk-secao">
          <h2>Para animar a noite</h2>
          <ul className="lista-musicas">
            {sugeridas.slice(0, 8).map((m) => <MusicaItem key={m.id} musica={m} />)}
          </ul>
        </section>
      )}

      {!categorias.dados && <Estado carregando={categorias.carregando} erro={categorias.erro} />}
      {categorias.dados && generos.length === 0 && (
        <p className="qk-vazio">O acervo ainda está vazio. O dono cadastra os CDs no painel administrativo.</p>
      )}
    </div>
  );
}
