import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CdCard from '../components/CdCard.jsx';
import Estado from '../components/Estado.jsx';
import Fila from '../components/Fila.jsx';
import GradeCategorias from '../components/GradeCategorias.jsx';
import MusicaItem from '../components/MusicaItem.jsx';
import ValeForm from '../components/ValeForm.jsx';
import { textoDasJanelas } from '../bonus.js';
import { useSessao } from '../context/Sessao.jsx';
import { esquecerFavoritos, useFavoritos } from '../favoritos.js';
import { useAgora, useApi } from '../hooks.js';

function DicaInstalar() {
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    const instalado = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    const movel = window.matchMedia('(pointer: coarse)').matches;
    let dispensou = false;
    try { dispensou = localStorage.getItem('jukebox_dica_inicio') === '1'; } catch { /* sem storage */ }
    setMostrar(movel && !instalado && !dispensou);
  }, []);

  if (!mostrar) return null;

  function fechar() {
    try { localStorage.setItem('jukebox_dica_inicio', '1'); } catch { /* sem storage */ }
    setMostrar(false);
  }

  return (
    <div className="aviso dica-app">
      <span>Adicione esta página à tela inicial para voltar sem escanear o QR de novo.</span>
      <button type="button" className="btn btn-pequeno btn-fantasma" onClick={fechar}>OK</button>
    </div>
  );
}

export default function Home() {
  const { saldo, sessao, versoes, fila, config } = useSessao();
  const { ids: favoritosIds } = useFavoritos();
  const lancamentos = useApi('/cds/lancamentos', [versoes.lancamentos]);
  const top = useApi('/musicas/top-tocadas', [versoes.top]);
  const categorias = useApi('/categorias', [versoes.lancamentos]);
  const pedidos = useApi(sessao ? `/sessoes/${sessao.id}/pedidos` : null, [versoes.fila]);
  const favoritas = useApi(
    favoritosIds.length ? `/musicas/por-ids?ids=${favoritosIds.map(encodeURIComponent).join(',')}` : null,
    [favoritosIds.join(',')],
  );
  const agora = useAgora(30_000);

  useEffect(() => {
    if (!favoritas.dados || favoritas.carregando || favoritas.erro || favoritosIds.length === 0) return;
    const vivos = new Set(favoritas.dados.musicas.map((m) => m.id));
    const mortos = favoritosIds.filter((id) => !vivos.has(id));
    if (mortos.length) esquecerFavoritos(mortos);
  }, [favoritas.dados, favoritas.carregando, favoritas.erro, favoritosIds]);

  const minutos = sessao?.expira_em ? Math.max(1, Math.floor((Date.parse(sessao.expira_em) - agora) / 60_000)) : 0;
  const novos = lancamentos.dados?.lancamentos ?? [];
  const ranking = top.dados?.top ?? [];

  return (
    <>
      {config.aviso && <div className="aviso-mural" role="status">📣 {config.aviso}</div>}
      <DicaInstalar />

      <section className="card saldo-card">
        <span className="rotulo">Seus créditos</span>
        <div className="saldo-valor mono">{saldo}</div>
        <small>{saldo > 0 ? `Vencem em ~${minutos} min sem uso · 1 crédito = R$ 1,00` : '1 crédito = R$ 1,00'}</small>
        {sessao?.saldo_cortesia > 0 && <small>🎁 {sessao.saldo_cortesia} de cortesia</small>}
        {config.vendas_abertas
          ? <Link to="/pagar" className="btn btn-grande">PAGAR NESTA TELA</Link>
          : <span className="btn btn-grande btn-desativado">VENDAS ENCERRADAS</span>}
        {config.vendas_abertas && <small className="pagar-na-tela">O QR do Pix abre aqui. Aponte a câmera do banco para esta tela.</small>}
        {config.vendas_abertas && config.bonus.ativo && config.bonus.faixas.length > 0 && (
          <small className="bonus-destaque">
            🎁 Bônus: {config.bonus.faixas.map((f) => `R$ ${f.valor} → +${f.bonus}`).join(' · ')}
            {config.bonus.agenda.length > 0 && ` (hoje das ${textoDasJanelas(config.bonus.agenda)})`}
          </small>
        )}
        {config.vendas_abertas && !config.bonus.ativo && config.bonus.habilitado && config.bonus.faixas.length > 0 && config.bonus.agenda.length > 0 && (
          <small className="bonus-destaque bonus-futuro">
            🎁 Bônus de recarga das {textoDasJanelas(config.bonus.agenda)}: {config.bonus.faixas.map((f) => `R$ ${f.valor} → +${f.bonus}`).join(' · ')}
          </small>
        )}
      </section>

      {config.recados.ativo && (
        config.recados.telao_online ? (
          <Link to="/recado" className="card recado-chamada">
            <span className="recado-icone" aria-hidden="true">💬</span>
            <span>
              <strong>Mande um recado para o telão</strong>
              <small>Aparece na tela da casa · {config.recados.preco} {config.recados.preco === 1 ? 'crédito' : 'créditos'}</small>
            </span>
          </Link>
        ) : (
          <div className="card recado-chamada recado-indisponivel">
            <span className="recado-icone" aria-hidden="true">💬</span>
            <span>
              <strong>Recado no telão</strong>
              <small>O telão está desligado agora</small>
            </span>
          </div>
        )
      )}

      <ValeForm />

      {(fila.agora_tocando || fila.total_aguardando > 0) && (
        <section className="secao">
          <div className="secao-topo">
            <h2>📋 Na fila agora</h2>
            <Link to="/fila">ver fila</Link>
          </div>
          <Fila limite={3} />
        </section>
      )}

      {(pedidos.dados?.pedidos?.length ?? 0) > 0 && (
        <section className="secao">
          <h2>🔁 Pedir de novo</h2>
          <ul className="lista-musicas">
            {pedidos.dados.pedidos.map((m) => <MusicaItem key={m.id} musica={m} />)}
          </ul>
        </section>
      )}

      {(favoritas.dados?.musicas.length ?? 0) > 0 && (
        <section className="secao">
          <h2>♥ Favoritas</h2>
          <ul className="lista-musicas">
            {favoritas.dados.musicas.map((m) => <MusicaItem key={m.id} musica={m} />)}
          </ul>
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
