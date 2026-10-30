import { useCallback, useEffect, useState } from 'react';
import Capa from '../components/Capa.jsx';
import { api, formatarDuracao } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';
import { botaoDaTecla } from './teclas.js';

// Teclado da busca. Com os botões da máquina: ◀ ▶ andam pelas teclas, ↓ ↑ trocam de linha, TOCAR aperta a tecla.
const LINHAS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '⌫', '⌫'],
  ['ESPAÇO', 'ESPAÇO', 'ESPAÇO', 'ESPAÇO', 'BUSCAR', 'BUSCAR', 'BUSCAR', 'INTERNET', 'INTERNET', 'INTERNET'],
];
const SEM_INTERNET = LINHAS.map((linha) => linha.map((v) => (v === 'INTERNET' ? 'BUSCAR' : v)));
const COLUNAS = 10;

// Busca pelo nome, com o teclado da tela e os botões da máquina. Procura primeiro no acervo da casa (o HD);
// não achou e o dono ligou "músicas da internet", a mesma busca vai ao YouTube: o áudio e a capa são baixados
// e a música entra na fila sozinha (se o download falhar, o crédito volta).
const NA_INTERNET = { id: 'internet' }; // última linha dos resultados do acervo

export default function Busca({ controle, aoFechar, aviso, inicio = 'acervo' }) {
  const { sessao, config, preparando, atualizarSessao, recarregarPreparando, adicionarMusica } = useSessao();
  const internetLigada = config.youtube.ativo;
  const teclado = internetLigada ? LINHAS : SEM_INTERNET;
  const [origem, setOrigem] = useState(inicio === 'internet' && internetLigada ? 'internet' : 'acervo');
  const [texto, setTexto] = useState('');
  const [tecla, setTecla] = useState({ l: 1, c: 0 });
  const [fase, setFase] = useState('digitar'); // digitar | buscando | resultados
  const [resultados, setResultados] = useState([]);
  const [indice, setIndice] = useState(0);
  const [confirmar, setConfirmar] = useState(null); // video_id aguardando o segundo TOCAR
  const [erro, setErro] = useState('');

  const buscar = useCallback(async (termo = texto, onde = origem) => {
    if (termo.trim().length < 2) { setErro('Escreva pelo menos 2 letras.'); return; }
    setErro('');
    setOrigem(onde);
    setConfirmar(null);
    setFase('buscando');
    try {
      const q = encodeURIComponent(termo.trim());
      const r = onde === 'acervo'
        ? await api(`/musicas/buscar?q=${q}`)
        : await api(`/youtube/buscar?q=${q}&session_id=${sessao.id}`);
      setResultados(onde === 'acervo' && internetLigada ? [...r.resultados, NA_INTERNET] : r.resultados);
      setIndice(0);
      setFase('resultados');
    } catch (e) {
      setErro(e.message);
      setFase('digitar');
    }
  }, [texto, origem, sessao.id, internetLigada]);

  async function tocarDoAcervo(musica) {
    try {
      await adicionarMusica(musica);
      aviso(`♪ NA FILA: ${musica.titulo.toUpperCase()}`);
      aoFechar();
    } catch (e) {
      if (e.codigo === 'SALDO_INSUFICIENTE') aviso('COLOQUE CRÉDITOS PARA TOCAR', 'erro', true);
      else setErro(e.message);
    }
  }

  async function pedir(item) {
    if (item === NA_INTERNET) { buscar(texto, 'internet'); return; }
    if (origem === 'acervo') { tocarDoAcervo(item); return; }
    if (!item.na_casa && confirmar !== item.video_id) { setConfirmar(item.video_id); return; }
    setConfirmar(null);
    try {
      const r = await api('/youtube/comprar', { metodo: 'POST', corpo: { session_id: sessao.id, video_id: item.video_id } });
      atualizarSessao({ saldo: r.saldo });
      if (r.pronto) aviso(`♪ NA FILA: ${item.titulo.toUpperCase()}`);
      else {
        await recarregarPreparando();
        aviso('BAIXANDO A MÚSICA E A CAPA… ENTRA NA FILA EM INSTANTES');
      }
      aoFechar();
    } catch (e) {
      if (e.codigo === 'SALDO_INSUFICIENTE') aviso('COLOQUE CRÉDITOS PARA PEDIR', 'erro', true);
      else setErro(e.message);
    }
  }

  function apertarTecla(valor) {
    setErro('');
    if (valor === '⌫') setTexto((t) => t.slice(0, -1));
    else if (valor === 'ESPAÇO') setTexto((t) => (t.length < 60 ? `${t} ` : t));
    else if (valor === 'BUSCAR') buscar(texto, 'acervo');
    else if (valor === 'INTERNET') buscar(texto, 'internet');
    else setTexto((t) => (t.length < 60 ? t + valor : t));
  }

  // Teclado de verdade (se houver um ligado) também escreve.
  useEffect(() => {
    if (fase !== 'digitar') return undefined;
    const aoTecla = (e) => {
      if (botaoDaTecla(e) && e.key !== 'Backspace') return; // botão da máquina (ex.: D e R no perfil JukeLinux)
      if (e.key === 'Backspace') {
        e.stopImmediatePropagation();
        e.preventDefault();
        setTexto((t) => t.slice(0, -1));
        return;
      }
      if (e.key.length === 1 && /[\p{L}\p{N}-]/u.test(e.key)) {
        e.stopImmediatePropagation();
        e.preventDefault();
        setTexto((t) => (t.length < 60 ? t + e.key.toUpperCase() : t));
      }
    };
    window.addEventListener('keydown', aoTecla, true);
    return () => window.removeEventListener('keydown', aoTecla, true);
  }, [fase]);

  controle.current = (botao) => {
    if (botao === 'ritmo' || botao === 'voltar') {
      if (fase === 'resultados') { setFase('digitar'); setConfirmar(null); setOrigem(inicio === 'internet' && internetLigada ? 'internet' : 'acervo'); } else aoFechar();
      return;
    }
    if (fase === 'digitar') {
      if (botao === 'proxima') setTecla(({ l, c }) => (c + 1 < COLUNAS ? { l, c: c + 1 } : { l: (l + 1) % LINHAS.length, c: 0 }));
      if (botao === 'anterior') setTecla(({ l, c }) => (c > 0 ? { l, c: c - 1 } : { l: (l - 1 + LINHAS.length) % LINHAS.length, c: COLUNAS - 1 }));
      if (botao === 'descer') setTecla(({ l, c }) => ({ l: (l + 1) % LINHAS.length, c }));
      if (botao === 'subir') setTecla(({ l, c }) => ({ l: (l - 1 + LINHAS.length) % LINHAS.length, c }));
      if (botao === 'tocar') apertarTecla(teclado[tecla.l][tecla.c]);
    } else if (fase === 'resultados' && resultados.length) {
      if (botao === 'descer' || botao === 'proxima') { setIndice((i) => (i + 1) % resultados.length); setConfirmar(null); }
      if (botao === 'subir' || botao === 'anterior') { setIndice((i) => (i - 1 + resultados.length) % resultados.length); setConfirmar(null); }
      if (botao === 'tocar') pedir(resultados[indice]);
    }
  };

  // A escolhida fica sempre à vista: com 60 resultados do acervo a lista rola.
  useEffect(() => {
    document.querySelector('.pn-resultados button.ativo')?.scrollIntoView({ block: 'nearest' });
  }, [indice, resultados]);

  const baixando = (id) => preparando.some((p) => p.video_id === id);

  return (
    <div className="pn-janela-fundo" role="dialog" aria-modal="true" aria-label={origem === 'acervo' ? 'Buscar música no acervo' : 'Buscar música na internet'}>
      <section className="pn-janela pn-internet">
        <header>
          <h1>{origem === 'acervo' ? 'BUSCAR MÚSICA' : 'BUSCAR NA INTERNET'}</h1>
          <span>{origem === 'acervo'
            ? `Procura em todos os CDs da casa pelo nome da música, do artista ou do CD${internetLigada ? ' · não achou? Tem a internet' : ''}`
            : `A música e a capa são baixadas do YouTube · ${config.youtube.preco} ${config.youtube.preco === 1 ? 'crédito' : 'créditos'} · até ${config.youtube.max_min} min`}</span>
          <button type="button" className="pn-fechar" aria-label="Fechar" onClick={aoFechar}>✕</button>
        </header>
        {erro && <p className="pn-erro" role="alert">{erro}</p>}

        {fase !== 'resultados' && (
          <>
            <div className="pn-campo" aria-live="polite">{texto || <span>Digite o nome da música ou do artista</span>}<i /></div>
            {fase === 'buscando' ? <p className="pn-dica"><span className="carregando carregando-pequeno" /> Procurando…</p> : (
              <div className="pn-teclado">
                {teclado.map((linha, l) => (
                  <div key={l} className="pn-teclado-linha">
                    {linha.map((valor, c) => {
                      if (c > 0 && linha[c - 1] === valor) return null; // tecla larga ocupa várias colunas
                      const largura = linha.filter((v) => v === valor).length;
                      const ativa = tecla.l === l && linha[tecla.c] === valor;
                      return (
                        <button key={c} type="button" style={{ flex: largura }} className={`${ativa ? 'ativa' : ''} ${valor === 'BUSCAR' || valor === 'INTERNET' ? 'destaque' : ''}`} onClick={() => { setTecla({ l, c }); apertarTecla(valor); }}>
                          {valor === 'INTERNET' ? '🌐 INTERNET' : valor === 'BUSCAR' ? '🔎 BUSCAR' : valor}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
            <p className="pn-dica">◀ ▶ ▼ escolhem a tecla · TOCAR aperta · RITMO volta</p>
          </>
        )}

        {fase === 'resultados' && (
          <>
            <p className="pn-dica">{origem === 'acervo' ? 'No acervo' : 'Na internet'}: “{texto.trim()}”</p>
            {resultados.length === 0 ? <p className="pn-vazio">Nada encontrado. Tente outras palavras.</p> : (
              <ol className="pn-resultados">
                {origem === 'acervo' && resultados.map((m, i) => (
                  <li key={m.id}>
                    {m === NA_INTERNET ? (
                      <button type="button" className={`pn-res-internet ${i === indice ? 'ativo' : ''}`} onClick={() => buscar(texto, 'internet')}>
                        <span className="pn-res-icone">🌐</span>
                        <span className="pn-res-texto"><b>Não achou? Buscar na internet</b><small>A música e a capa vêm do YouTube</small></span>
                      </button>
                    ) : (
                      <button type="button" className={i === indice ? 'ativo' : ''} onClick={() => { setIndice(i); pedir(m); }}>
                        <Capa capa={m.capa} icone={m.icone} cor={m.cor} titulo={m.cd} className="pn-res-capa" />
                        <span className="pn-res-texto">
                          <b>{m.titulo}</b>
                          <small>{m.artista} · {m.cd} · {formatarDuracao(m.duracao)}</small>
                        </span>
                        <span className="pn-res-preco">{m.creditos} {m.creditos === 1 ? 'CRÉDITO' : 'CRÉDITOS'}</span>
                      </button>
                    )}
                  </li>
                ))}
                {origem === 'internet' && resultados.map((r, i) => (
                  <li key={r.video_id}>
                    <button type="button" className={i === indice ? 'ativo' : ''} onClick={() => { setIndice(i); pedir(r); }}>
                      <img src={r.thumb} alt="" loading="lazy" />
                      <span className="pn-res-texto">
                        <b>{r.titulo}</b>
                        <small>{r.canal} · {formatarDuracao(r.duracao)}{r.na_casa ? ' · já baixada' : ''}</small>
                      </span>
                      <span className="pn-res-preco">
                        {baixando(r.video_id) ? 'BAIXANDO…' : confirmar === r.video_id ? `TOCAR DE NOVO: ${r.creditos} CRÉD.` : `${r.creditos} ${r.creditos === 1 ? 'CRÉDITO' : 'CRÉDITOS'}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <p className="pn-dica">{origem === 'acervo' ? '▼ escolhe · TOCAR põe na fila' : '▼ escolhe · TOCAR pede (de novo para confirmar)'} · RITMO volta à busca</p>
          </>
        )}
      </section>
    </div>
  );
}
