import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Capa from '../components/Capa.jsx';
import { api } from '../api.js';
import { SessaoProvider, useSessao } from '../context/Sessao.jsx';
import { useApi, useManterAceso } from '../hooks.js';
import Equalizador from './Equalizador.jsx';
import Pagamento from './Pagamento.jsx';
import { botaoDaTecla } from './teclas.js';
import './maquina.css';

const FAIXAS_VISIVEIS = 12;
const VIZINHOS = 4; // capas em cima (CDs anteriores) e embaixo (próximos)
const TODOS = { id: 'todos', nome: 'TODOS' };

const numero = (n) => String(n).padStart(3, '0');
const circular = (i, total) => ((i % total) + total) % total;

// Texto que corre quando não cabe (letreiro), como no "Ouvindo a música" das máquinas.
function Letreiro({ texto, className = '' }) {
  return (
    <div className={`mq-letreiro ${className}`}>
      <span key={texto}>{texto}&nbsp;&nbsp;•&nbsp;&nbsp;{texto}&nbsp;&nbsp;•&nbsp;&nbsp;</span>
    </div>
  );
}

function Miniatura({ cd, aoEscolher }) {
  if (!cd) return <div className="mq-mini vazia" />;
  return (
    <button type="button" className="mq-mini" onClick={aoEscolher} aria-label={`${cd.artista} - ${cd.titulo}`}>
      <Capa capa={cd.capa} icone={cd.icone} cor={cd.cor} titulo={cd.titulo} />
    </button>
  );
}

function Tela() {
  const { sessao, saldo, fila, adicionarMusica, erroConexao, tentarNovamente, versoes } = useSessao();
  useManterAceso();
  const lista = useApi('/cds', [versoes.lancamentos]);
  const [ritmoIdx, setRitmoIdx] = useState(0);
  const [cdIdx, setCdIdx] = useState(0);
  const [faixaIdx, setFaixaIdx] = useState(0);
  const [faixas, setFaixas] = useState({}); // id do CD -> músicas
  const [pagando, setPagando] = useState(false);
  const [aviso, setAviso] = useState(null); // { texto, tipo }
  const controlePagamento = useRef(null);

  const todos = lista.dados?.cds ?? [];
  // Número do CD: a posição dele no acervo todo, igual em qualquer ritmo.
  const numeros = useMemo(() => new Map(todos.map((cd, i) => [cd.id, i + 1])), [todos]);
  const ritmos = useMemo(() => {
    const vistos = new Map();
    for (const cd of todos) if (!vistos.has(cd.categoria_id)) vistos.set(cd.categoria_id, { id: cd.categoria_id, nome: cd.categoria.toUpperCase(), cor: cd.cor });
    const novos = todos.some((cd) => cd.status === 'novo') ? [{ id: 'novos', nome: 'LANÇAMENTOS' }] : [];
    return [TODOS, ...novos, ...vistos.values()];
  }, [todos]);
  const ritmo = ritmos[ritmoIdx] ?? TODOS;
  const cds = useMemo(() => (ritmo.id === 'todos' ? todos
    : ritmo.id === 'novos' ? todos.filter((cd) => cd.status === 'novo')
      : todos.filter((cd) => cd.categoria_id === ritmo.id)), [todos, ritmo.id]);
  const cd = cds.length ? cds[circular(cdIdx, cds.length)] : null;
  const musicas = cd ? faixas[cd.id] : null;

  // Carrega as faixas do CD escolhido (e guarda, para ir e voltar sem esperar).
  useEffect(() => {
    if (!cd || faixas[cd.id]) return;
    api(`/cds/${cd.id}/musicas`).then((r) => setFaixas((f) => ({ ...f, [cd.id]: r.musicas }))).catch(() => {});
  }, [cd, faixas]);
  useEffect(() => { setFaixas({}); }, [versoes.top, versoes.lancamentos]);

  const avisar = useCallback((texto, tipo = 'ok') => setAviso({ texto, tipo, id: Date.now() }), []);
  useEffect(() => {
    if (!aviso) return undefined;
    const id = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(id);
  }, [aviso]);

  // Nota ou moeda que entra a qualquer hora aparece na tela.
  useEffect(() => {
    const aoPagamento = (e) => {
      const { metodo, status, creditos } = e.detail ?? {};
      if (status === 'confirmado' && metodo === 'nota' && !pagando) avisar(`+${creditos} ${creditos === 1 ? 'CRÉDITO' : 'CRÉDITOS'}! ESCOLHA SUA MÚSICA`);
    };
    window.addEventListener('jukebox:pagamento', aoPagamento);
    return () => window.removeEventListener('jukebox:pagamento', aoPagamento);
  }, [avisar, pagando]);

  const mudarCd = useCallback((passo) => { setCdIdx((i) => i + passo); setFaixaIdx(0); }, []);
  const mudarRitmo = useCallback(() => {
    setRitmoIdx((i) => (i + 1) % Math.max(1, ritmos.length));
    setCdIdx(0);
    setFaixaIdx(0);
  }, [ritmos.length]);

  const tocar = useCallback(async (musica) => {
    if (!musica) return;
    try {
      await adicionarMusica(musica);
      avisar(`♪ NA FILA: ${musica.titulo.toUpperCase()}`);
    } catch (erro) {
      if (erro.codigo === 'SALDO_INSUFICIENTE') {
        avisar('COLOQUE CRÉDITOS PARA TOCAR', 'erro');
        setPagando(true);
      } else avisar(erro.message.toUpperCase(), 'erro');
    }
  }, [adicionarMusica, avisar]);

  const apertar = useCallback((botao) => {
    if (pagando) return controlePagamento.current?.(botao);
    const total = musicas?.length ?? 0;
    if (botao === 'ritmo') mudarRitmo();
    if (botao === 'anterior') mudarCd(-1);
    if (botao === 'proxima') mudarCd(1);
    if (botao === 'descer' && total) setFaixaIdx((i) => (i + 1) % total);
    if (botao === 'subir' && total) setFaixaIdx((i) => (i - 1 + total) % total);
    if (botao === 'tocar' && total) tocar(musicas[Math.min(faixaIdx, total - 1)]);
    if (botao === 'creditos') setPagando(true);
    return undefined;
  }, [pagando, musicas, faixaIdx, mudarRitmo, mudarCd, tocar]);

  useEffect(() => {
    const aoTecla = (e) => {
      const botao = botaoDaTecla(e);
      if (!botao) return;
      e.preventDefault();
      if (!e.repeat || ['anterior', 'proxima', 'descer', 'subir'].includes(botao)) apertar(botao);
    };
    window.addEventListener('keydown', aoTecla);
    return () => window.removeEventListener('keydown', aoTecla);
  }, [apertar]);

  if (!sessao || !lista.dados) {
    return (
      <main className="mq mq-carregando">
        {erroConexao || lista.erro
          ? <button type="button" onClick={tentarNovamente}>{erroConexao || lista.erro.message} · TENTAR DE NOVO</button>
          : <span className="carregando" aria-label="Carregando" />}
      </main>
    );
  }

  const atual = fila.agora_tocando;
  const vizinho = (passo) => (cds.length > 1 ? cds[circular(cdIdx + passo, cds.length)] : null);
  const anteriores = Array.from({ length: VIZINHOS }, (_, i) => vizinho(i - VIZINHOS));
  const proximos = Array.from({ length: VIZINHOS }, (_, i) => vizinho(i + 1));
  const inicioLista = musicas ? Math.max(0, Math.min(faixaIdx - FAIXAS_VISIVEIS + 3, musicas.length - FAIXAS_VISIVEIS)) : 0;

  return (
    <main className="mq">
      <div className="mq-linha mq-cima">
        <Equalizador tocando={Boolean(atual)} />
        {anteriores.map((c, i) => <Miniatura key={`a${i}`} cd={c} aoEscolher={() => mudarCd(i - VIZINHOS)} />)}
        <button type="button" className="mq-disco" onClick={mudarRitmo} aria-label={`Ritmo: ${ritmo.nome}. Toque para trocar`}>
          <span className="mq-disco-cd">CD</span>
          <span className="mq-disco-furo" />
          <span className="mq-disco-ritmo">{ritmo.nome}</span>
        </button>
      </div>

      <section className="mq-meio">
        <aside className="mq-ouvindo">
          <Letreiro texto={atual ? `OUVINDO A MÚSICA: ${atual.musica.titulo} - ${atual.musica.artista}` : 'ESCOLHA SUA MÚSICA'} className="mq-ouvindo-texto" />
          <div className="mq-ouvindo-capa">
            {atual
              ? <Capa capa={atual.musica.capa} icone={atual.musica.icone} cor={atual.musica.cor} titulo={atual.musica.cd} />
              : <div className="mq-ouvindo-vazio">♪</div>}
          </div>
          <div className="mq-fila">FILA <b>{String(fila.total_aguardando).padStart(2, '0')}</b></div>
        </aside>

        <ol className="mq-faixas">
          {!cd && <li className="mq-faixas-vazio">NENHUM CD NESTE RITMO</li>}
          {cd && !musicas && <li className="mq-faixas-vazio">CARREGANDO…</li>}
          {musicas?.slice(inicioLista, inicioLista + FAIXAS_VISIVEIS).map((m, i) => {
            const n = inicioLista + i;
            const escolhida = n === faixaIdx;
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={escolhida ? 'escolhida' : ''}
                  onClick={() => (escolhida ? tocar(m) : setFaixaIdx(n))}
                >
                  <span className="mq-seta" aria-hidden="true">{escolhida ? '▶' : ''}</span>
                  <span className="mq-faixa-num">{String(n + 1).padStart(2, '0')} -</span>
                  <span className="mq-faixa-titulo">{m.titulo.toUpperCase()}</span>
                  {m.creditos > 1 && <span className="mq-faixa-preco">{m.creditos}¢</span>}
                </button>
              </li>
            );
          })}
        </ol>

        <aside className="mq-cd">
          <div className="mq-cd-topo">
            <span className="mq-cd-seta" aria-hidden="true">▼</span>
            <span className="mq-cd-numero">{cd ? numero(numeros.get(cd.id)) : '---'}</span>
          </div>
          <div className="mq-cd-capa">
            {cd && <Capa capa={cd.capa} icone={cd.icone} cor={cd.cor} titulo={cd.titulo} prioridade />}
            {cd?.status === 'novo' && <span className="mq-cd-novo">LANÇAMENTO</span>}
          </div>
          {cd && <Letreiro texto={`${cd.artista} - ${cd.titulo}`.toUpperCase()} className="mq-cd-nome" />}
        </aside>
      </section>

      <div className="mq-linha mq-baixo">
        <Equalizador tocando={Boolean(atual)} />
        {proximos.map((c, i) => <Miniatura key={`p${i}`} cd={c} aoEscolher={() => mudarCd(i + 1)} />)}
        <button type="button" className="mq-creditos" onClick={() => setPagando(true)} aria-label={`Créditos: ${saldo}. Toque para colocar créditos`}>
          <span>Créditos</span>
          <b>{saldo}</b>
          <small>PIX · CARTÃO · DINHEIRO</small>
        </button>
      </div>

      {aviso && <div className={`mq-aviso ${aviso.tipo}`} key={aviso.id} role="status">{aviso.texto}</div>}
      {pagando && <Pagamento controle={controlePagamento} aoFechar={() => setPagando(false)} />}
    </main>
  );
}

// Tela da máquina de música: capas em volta, faixas no meio, CD escolhido à direita, créditos no canto.
// Anda pelos botões da máquina (teclas, veja teclas.js) ou por toque.
export default function Maquina() {
  return (
    <SessaoProvider>
      <Tela />
    </SessaoProvider>
  );
}
