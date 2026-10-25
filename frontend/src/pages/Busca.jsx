import { useEffect, useState } from 'react';
import BuscaInternet from '../components/BuscaInternet.jsx';
import Estado from '../components/Estado.jsx';
import MusicaItem from '../components/MusicaItem.jsx';
import { api } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';
import { useToast } from '../context/Toast.jsx';
import { useApi, useDebounce } from '../hooks.js';

const CHAVE_RECENTES = 'jukebox_buscas';

function lerRecentes() {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '[]');
    return Array.isArray(lista) ? lista.filter((item) => typeof item === 'string' && item.trim().length >= 2).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function lembrarBusca(termo) {
  const texto = termo.trim().slice(0, 80);
  if (texto.length < 2) return lerRecentes();
  const proximos = [texto, ...lerRecentes().filter((item) => item.toLocaleLowerCase('pt-BR') !== texto.toLocaleLowerCase('pt-BR'))].slice(0, 8);
  try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(proximos)); } catch { /* modo privado */ }
  return proximos;
}

// Mostra quanta gente já pediu a mesma música; o dono vê essa lista no admin.
function Sugerir({ texto }) {
  const { sessao } = useSessao();
  const mostrar = useToast();
  const [estado, setEstado] = useState('ocioso'); // ocioso | enviando | enviado

  useEffect(() => { setEstado('ocioso'); }, [texto]);

  async function enviar() {
    setEstado('enviando');
    try {
      const r = await api('/sugestoes', { metodo: 'POST', corpo: { session_id: sessao.id, texto } });
      setEstado('enviado');
      mostrar(r.pedidos > 1 ? `Obrigado! ${r.pedidos} pessoas já pediram essa.` : 'Obrigado! Vamos avaliar sua sugestão.', { tipo: 'ok' });
    } catch (erro) {
      setEstado('ocioso');
      mostrar(erro.message, { tipo: 'erro' });
    }
  }

  return (
    <button type="button" className="btn btn-fantasma" onClick={enviar} disabled={estado !== 'ocioso'}>
      {estado === 'enviado' ? '✔ Sugestão enviada' : `💡 Sugerir "${texto}" ao dono`}
    </button>
  );
}

export default function Busca() {
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [recentes, setRecentes] = useState(lerRecentes);
  const termo = useDebounce(texto.trim(), 300);
  const buscando = termo.length >= 2;

  const categorias = useApi('/categorias');
  const sugestoes = useApi('/musicas/sugestoes');
  const resultado = useApi(
    buscando ? `/musicas/buscar?q=${encodeURIComponent(termo)}${categoria ? `&categoria=${categoria}` : ''}` : null,
  );

  function guardar(valor = texto) {
    setRecentes(lembrarBusca(valor));
  }

  return (
    <>
      <h1>Buscar</h1>
      <form className="busca-campo" role="search" onSubmit={(e) => { e.preventDefault(); guardar(); }}>
        <label className="sr-only" htmlFor="busca-musica">Buscar música, artista ou CD</label>
        <input
          id="busca-musica"
          className="campo"
          type="search"
          placeholder="Música, artista, CD ou gênero…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoFocus
          autoComplete="off"
          enterKeyHint="search"
        />
        {texto && (
          <button type="button" className="busca-limpar" aria-label="Limpar busca" onClick={() => setTexto('')}>✕</button>
        )}
      </form>

      <div className="chips" role="group" aria-label="Filtrar por gênero">
        <button type="button" className={`chip ${categoria === '' ? 'ativo' : ''}`} onClick={() => setCategoria('')}>Todos</button>
        {categorias.dados?.categorias.map((c) => (
          <button type="button" key={c.id} className={`chip ${categoria === c.id ? 'ativo' : ''}`} onClick={() => setCategoria(c.id)}>
            {c.icone} {c.nome}
          </button>
        ))}
      </div>

      {!buscando && recentes.length > 0 && (
        <div className="recentes">
          <div className="secao-topo">
            <h2>Recentes</h2>
            <button type="button" className="link-limpo" onClick={() => { try { localStorage.removeItem(CHAVE_RECENTES); } catch { /* sem storage */ } setRecentes([]); }}>limpar</button>
          </div>
          <div className="chips">
            {recentes.map((item) => (
              <button type="button" key={item} className="chip" onClick={() => setTexto(item)}>{item}</button>
            ))}
          </div>
        </div>
      )}

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
          ? (
            <div className="sem-resultado">
              <p className="vazio">Nada encontrado para “{termo}”. Tente outra palavra.</p>
              <Sugerir texto={termo} />
            </div>
          )
          : (
            <>
              <p className="busca-contagem">
                {resultado.dados.resultados.length === 60
                  ? '60 músicas — refine a busca se a sua não aparecer'
                  : `${resultado.dados.resultados.length} ${resultado.dados.resultados.length === 1 ? 'música' : 'músicas'}`}
              </p>
              <ul className="lista-musicas">
                {resultado.dados.resultados.map((m) => (
                  <MusicaItem key={m.id} musica={m} termo={termo} aoPedir={() => guardar(termo)} />
                ))}
              </ul>
            </>
          )
      )}

      {/* Só aparece se o dono ligou "músicas da internet" (e o yt-dlp está funcionando no servidor). */}
      {buscando && resultado.dados && <BuscaInternet termo={termo} />}
    </>
  );
}
