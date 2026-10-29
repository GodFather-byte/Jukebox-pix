import { useEffect, useState } from 'react';
import GraficoColunas from './GraficoColunas.jsx';
import { formatarReais } from '../../api.js';

const PERIODOS = [
  ['hoje', 'Hoje'],
  ['semana', 'Últimos 7 dias'],
  ['mes', 'Este mês'],
];

export default function Resumo({ chamar }) {
  const [stats, setStats] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const carregar = () => chamar('/admin/stats').then(setStats).catch((e) => setErro(e.message));
    carregar();
    const id = setInterval(carregar, 30_000);
    return () => clearInterval(id);
  }, [chamar]);

  if (erro) return <p className="aviso aviso-erro">{erro}</p>;
  if (!stats) return <div className="estado"><span className="carregando" /></div>;

  const maxCategoria = Math.max(...stats.categorias.map((c) => c.total), 1);

  return (
    <>
      <div className="tiles">
        {PERIODOS.map(([chave, rotulo]) => {
          const p = stats.periodos[chave];
          return (
            <div key={chave} className="tile">
              <span className="rotulo">{rotulo}</span>
              <div className="tile-valor">{formatarReais(p.usuario)}</div>
              <small>sua parte ({stats.divisao_usuario}%)</small>
              <dl className="tile-detalhes">
                <div><dt>Músicas tocadas</dt><dd className="mono">{p.tocadas}</dd></div>
                <div><dt>Dessas, de cortesia (grátis)</dt><dd className="mono">{p.cortesia}</dd></div>
                {p.recados > 0 && <div><dt>Recados no telão</dt><dd className="mono">{p.recados}</dd></div>}
                <div><dt>Faturado (músicas e recados)</dt><dd className="mono">{formatarReais(p.bruto)}</dd></div>
                <div><dt>Parte da boate</dt><dd className="mono">{formatarReais(p.boate)}</dd></div>
                <div><dt>Recebido (Pix, cartão e notas)</dt><dd className="mono">{formatarReais(p.arrecadado)}</dd></div>
                {p.por_metodo && (
                  <div><dt>Pix · Cartão · Notas</dt><dd className="mono">{formatarReais(p.por_metodo.pix)} · {formatarReais(p.por_metodo.cartao)} · {formatarReais(p.por_metodo.nota)}</dd></div>
                )}
              </dl>
            </div>
          );
        })}
      </div>
      <p className="nota">A divisão considera só as músicas pagas efetivamente tocadas e os recados que foram ao ar (cortesia, vales e playlist automática ficam de fora). “Recebido” inclui créditos ainda não usados ou vencidos.</p>

      <GraficoColunas
        titulo="Músicas tocadas por dia (últimos 14 dias)"
        nomeValor="Músicas"
        serie={stats.serie_diaria.map((p) => ({
          dia: p.dia,
          valor: p.tocadas,
          texto: `${p.tocadas} músicas · ${formatarReais(p.valor)}`,
        }))}
      />

      <div className="destaques">
        <div className="card">
          <span className="rotulo">Música mais tocada</span>
          <strong>{stats.musica_mais_tocada?.titulo ?? '—'}</strong>
          <small>{stats.musica_mais_tocada ? `${stats.musica_mais_tocada.artista} · ${stats.musica_mais_tocada.vezes_tocada}x` : 'Sem dados ainda'}</small>
        </div>
        <div className="card">
          <span className="rotulo">Artista mais tocado</span>
          <strong>{stats.artista_mais_tocado?.nome ?? '—'}</strong>
          <small>{stats.artista_mais_tocado ? `${stats.artista_mais_tocado.total} reproduções` : 'Sem dados ainda'}</small>
        </div>
      </div>

      <section className="secao">
        <h2>Categorias mais populares</h2>
        <ul className="barras">
          {stats.categorias.map((c) => (
            <li key={c.nome}>
              <span className="barras-nome">{c.icone} {c.nome}</span>
              <span className="barras-trilho"><span className="barras-preenchimento" style={{ width: `${(c.total / maxCategoria) * 100}%` }} /></span>
              <b className="mono">{c.total}</b>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
