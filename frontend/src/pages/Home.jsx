import { Link } from 'react-router-dom';
import CdCard from '../components/CdCard.jsx';
import Estado from '../components/Estado.jsx';
import Fila from '../components/Fila.jsx';
import GradeCategorias from '../components/GradeCategorias.jsx';
import MusicaItem from '../components/MusicaItem.jsx';
import { useSessao } from '../context/Sessao.jsx';
import { useAgora, useApi } from '../hooks.js';

export default function Home() {
  const { saldo, sessao, versoes, fila } = useSessao();
  const lancamentos = useApi('/cds/lancamentos', [versoes.lancamentos]);
  const top = useApi('/musicas/top-tocadas', [versoes.top]);
  const categorias = useApi('/categorias', [versoes.lancamentos]);
  const agora = useAgora(30_000);

  const minutos = sessao?.expira_em ? Math.max(1, Math.floor((Date.parse(sessao.expira_em) - agora) / 60_000)) : 0;
  const novos = lancamentos.dados?.lancamentos ?? [];
  const ranking = top.dados?.top ?? [];

  return (
    <>
      <section className="card saldo-card">
        <span className="rotulo">Seus créditos</span>
        <div className="saldo-valor mono">{saldo}</div>
        <small>{saldo > 0 ? `Vencem em ~${minutos} min sem uso · 1 crédito = 1 música` : '1 crédito = R$ 1,00 = 1 música'}</small>
        {sessao?.saldo_cortesia > 0 && <small>🎁 {sessao.saldo_cortesia} de cortesia</small>}
        <Link to="/pagar" className="btn btn-grande">PAGAR AGORA</Link>
      </section>

      {fila.agora_tocando && (
        <section className="secao">
          <h2>📋 Na fila agora</h2>
          <Fila limite={3} />
        </section>
      )}

      {novos.length > 0 && (
        <section className="secao">
          <h2>🆕 Lançamentos</h2>
          <div className="carrossel">
            {novos.map((cd) => <CdCard key={cd.id} cd={cd} />)}
          </div>
        </section>
      )}

      {ranking.length > 0 && (
        <section className="secao">
          <div className="secao-topo">
            <h2>🏆 Top 5 mais tocadas</h2>
            <Link to="/top">ver todas</Link>
          </div>
          <ul className="lista-musicas">
            {ranking.map((m, i) => <MusicaItem key={m.id} musica={m} posicao={i} />)}
          </ul>
        </section>
      )}

      <section className="secao">
        <h2>🎧 Categorias</h2>
        {categorias.dados
          ? <GradeCategorias categorias={categorias.dados.categorias} />
          : <Estado carregando={categorias.carregando} erro={categorias.erro} />}
      </section>
    </>
  );
}
