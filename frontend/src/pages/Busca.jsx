import { useState } from 'react';
import Estado from '../components/Estado.jsx';
import MusicaItem from '../components/MusicaItem.jsx';
import { useApi, useDebounce } from '../hooks.js';

export default function Busca() {
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState('');
  const termo = useDebounce(texto.trim(), 300);
  const buscando = termo.length >= 2;

  const categorias = useApi('/categorias');
  const sugestoes = useApi('/musicas/sugestoes');
  const resultado = useApi(
    buscando ? `/musicas/buscar?q=${encodeURIComponent(termo)}${categoria ? `&categoria=${categoria}` : ''}` : null,
  );

  return (
    <>
      <h1>Buscar</h1>
      <input
        className="campo"
        type="search"
        placeholder="Música, artista, CD ou gênero…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        autoFocus
        autoComplete="off"
        enterKeyHint="search"
      />

      <div className="chips" role="group" aria-label="Filtrar por gênero">
        <button className={`chip ${categoria === '' ? 'ativo' : ''}`} onClick={() => setCategoria('')}>Todos</button>
        {categorias.dados?.categorias.map((c) => (
          <button key={c.id} className={`chip ${categoria === c.id ? 'ativo' : ''}`} onClick={() => setCategoria(c.id)}>
            {c.icone} {c.nome}
          </button>
        ))}
      </div>

      {!buscando && (
        <section className="secao">
          <h2>✨ Sugestões pra você</h2>
          <ul className="lista-musicas">
            {sugestoes.dados?.sugestoes.map((m) => <MusicaItem key={m.id} musica={m} />)}
          </ul>
        </section>
      )}

      {buscando && !resultado.dados && <Estado carregando={resultado.carregando} erro={resultado.erro} />}
      {buscando && resultado.dados && (
        resultado.dados.resultados.length === 0
          ? <p className="vazio">Nada encontrado para “{termo}”. Tente outra palavra.</p>
          : (
            <ul className="lista-musicas">
              {resultado.dados.resultados.map((m) => <MusicaItem key={m.id} musica={m} />)}
            </ul>
          )
      )}
    </>
  );
}
