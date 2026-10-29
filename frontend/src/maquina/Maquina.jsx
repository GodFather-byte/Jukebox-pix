import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Capa from '../components/Capa.jsx';
import Progresso from '../components/Progresso.jsx';
import { api, formatarDuracao } from '../api.js';
import { SessaoProvider, useSessao } from '../context/Sessao.jsx';
import { useAgora, useApi, useManterAceso } from '../hooks.js';
import Internet from './Internet.jsx';
import Pagamento from './Pagamento.jsx';
import { botaoDaTecla } from './teclas.js';
import './maquina.css';

const FAIXAS_VISIVEIS = 10;
const LADO = 3; // capas de cada lado do carrossel
const TODOS = { id: 'todos', nome: 'TODOS', icone: '★' };
const INTERNET = { id: 'internet', nome: 'INTERNET', icone: '🌐' };

const numero = (n) => String(n).padStart(3, '0');
const circular = (i, total) => ((i % total) + total) % total;

// Carrossel de capas em 3D: a do meio é o CD escolhido, as dos lados giram para trás.
function Carrossel({ cds, indice, aoEscolher, internet }) {
  if (internet) {
    return (
      <div className="pn-carrossel">
        <button type="button" className="pn-capa pn-capa-internet" style={{ '--d': 0 }} onClick={aoEscolher}>
          <span>🌐</span><b>BUSCAR NA INTERNET</b><small>TOCAR para pesquisar</small>
        </button>
      </div>
    );
  }
  if (!cds.length) return <div className="pn-carrossel"><p className="pn-vazio">Nenhum CD neste ritmo</p></div>;
  const itens = [];
  const lado = Math.min(LADO, Math.floor((cds.length - 1) / 2));
  for (let d = -lado; d <= lado; d++) itens.push({ d, cd: cds[circular(indice + d, cds.length)] });
  return (
    <div className="pn-carrossel">
      {itens.map(({ d, cd }) => (
        <button
          type="button"
          key={`${cd.id}:${d}`}
          className={`pn-capa ${d === 0 ? 'atual' : ''}`}
          style={{ '--d': d, '--a': Math.abs(d) }}
          onClick={() => aoEscolher(d)}
          aria-label={`${cd.artista} - ${cd.titulo}`}
        >
          <Capa capa={cd.capa} icone={cd.icone} cor={cd.cor} titulo={cd.titulo} prioridade={d === 0} />
          {d === 0 && cd.status === 'novo' && <span className="pn-novo">NOVO</span>}
        </button>
      ))}
    </div>
  );
}

function Topo({ nome }) {
  const { fila, saldo, preparando } = useSessao();
  const agora = useAgora(30_000);
  const atual = fila.agora_tocando;
  return (
    <header className="pn-topo">
      <div className="pn-marca"><span>♫</span>{nome}</div>
      <div className="pn-tocando">
        {atual ? (
          <>
            <Capa capa={atual.musica.capa} icone={atual.musica.icone} cor={atual.musica.cor} titulo={atual.musica.cd} className="pn-tocando-capa" />
            <div className="pn-tocando-texto">
              {atual.automatica
                ? <small className="pn-gratis">🎲 TOCANDO DE GRAÇA · ESCOLHA A PRÓXIMA!</small>
                : <small>TOCANDO AGORA</small>}
              <b>{atual.musica.titulo}</b>
              <span>{atual.musica.artista}</span>
              <Progresso item={atual} mostrarTempo />
            </div>
          </>
        ) : <div className="pn-tocando-texto"><small>SILÊNCIO NO SALÃO</small><b>Escolha a primeira música!</b></div>}
        <div className="pn-proximas">
          <small>NA FILA · {fila.total_aguardando}</small>
          {preparando.slice(0, 1).map((p) => <span key={p.video_id} className="pn-baixando">⬇ {p.titulo}</span>)}
          {fila.fila.slice(0, preparando.length ? 2 : 3).map((item, i) => <span key={item.id}>{i + 1}. {item.musica.titulo}</span>)}
        </div>
      </div>
      <div className="pn-saldo">
        <small>CRÉDITOS</small>
        <b>{saldo}</b>
        <time>{new Date(agora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
    </header>
  );
}

function Tela() {
  const { sessao, fila, config, adicionarMusica, erroConexao, tentarNovamente, versoes } = useSessao();
  useManterAceso();
  const info = useApi('/info');
  const lista = useApi('/cds', [versoes.lancamentos]);
  const [ritmoId, setRitmoId] = useState(TODOS.id); // pelo id: um gênero novo na lista não muda o escolhido
  const [cdIdx, setCdIdx] = useState(0);
  const [faixaIdx, setFaixaIdx] = useState(0);
  const [faixas, setFaixas] = useState({});
  const [janela, setJanela] = useState(null); // null | 'creditos' | 'internet'
  const [aviso, setAviso] = useState(null);
  const controleJanela = useRef(null);
  const faixaRitmos = useRef(null);

  const todos = lista.dados?.cds ?? [];
  const numeros = useMemo(() => new Map(todos.map((cd, i) => [cd.id, i + 1])), [todos]);
  const ritmos = useMemo(() => {
    const vistos = new Map();
    for (const cd of todos) if (!vistos.has(cd.categoria_id)) vistos.set(cd.categoria_id, { id: cd.categoria_id, nome: cd.categoria.toUpperCase(), icone: cd.icone, cor: cd.cor });
    const novos = todos.some((cd) => cd.status === 'novo') ? [{ id: 'novos', nome: 'LANÇAMENTOS', icone: '✦' }] : [];
    return [TODOS, ...novos, ...vistos.values(), ...(config.youtube.ativo ? [INTERNET] : [])];
  }, [todos, config.youtube.ativo]);
  const ritmoIdx = Math.max(0, ritmos.findIndex((r) => r.id === ritmoId));
  const ritmo = ritmos[ritmoIdx] ?? TODOS;
  const noInternet = ritmo.id === 'internet';
  const cds = useMemo(() => (ritmo.id === 'todos' ? todos
    : ritmo.id === 'novos' ? todos.filter((cd) => cd.status === 'novo')
      : todos.filter((cd) => cd.categoria_id === ritmo.id)), [todos, ritmo.id]);
  const cd = !noInternet && cds.length ? cds[circular(cdIdx, cds.length)] : null;
  const musicas = cd ? faixas[cd.id] : null;

  useEffect(() => {
    if (!cd || faixas[cd.id]) return;
    api(`/cds/${cd.id}/musicas`).then((r) => setFaixas((f) => ({ ...f, [cd.id]: r.musicas }))).catch(() => {});
  }, [cd, faixas]);
  useEffect(() => { setFaixas({}); }, [versoes.top, versoes.lancamentos]);

  // O ritmo escolhido fica sempre à vista, no meio da faixa de gêneros.
  useEffect(() => {
    faixaRitmos.current?.querySelector('.ativo')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [ritmoIdx, ritmos.length]);

  const avisar = useCallback((texto, tipo = 'ok', abrirCreditos = false) => {
    setAviso({ texto, tipo, id: Date.now() });
    if (abrirCreditos) setJanela('creditos');
  }, []);
  useEffect(() => {
    if (!aviso) return undefined;
    const id = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(id);
  }, [aviso]);

  useEffect(() => {
    const aoPagamento = (e) => {
      const { metodo, status, creditos } = e.detail ?? {};
      if (status === 'confirmado' && metodo === 'nota' && janela !== 'creditos') avisar(`+${creditos} ${creditos === 1 ? 'CRÉDITO' : 'CRÉDITOS'}! ESCOLHA SUA MÚSICA`);
    };
    const aoYoutube = (e) => {
      const { status, titulo } = e.detail ?? {};
      if (status === 'na_fila') avisar(`♪ CHEGOU DA INTERNET: ${String(titulo).toUpperCase()}`);
      if (status === 'falhou') avisar('NÃO DEU PARA BAIXAR. O CRÉDITO VOLTOU.', 'erro');
    };
    window.addEventListener('jukebox:pagamento', aoPagamento);
    window.addEventListener('jukebox:youtube', aoYoutube);
    return () => { window.removeEventListener('jukebox:pagamento', aoPagamento); window.removeEventListener('jukebox:youtube', aoYoutube); };
  }, [avisar, janela]);

  const mudarCd = useCallback((passo) => { setCdIdx((i) => i + passo); setFaixaIdx(0); }, []);
  const mudarRitmo = useCallback((passo = 1) => {
    setRitmoId(ritmos[circular(ritmoIdx + passo, ritmos.length)]?.id ?? TODOS.id);
    setCdIdx(0);
    setFaixaIdx(0);
  }, [ritmos, ritmoIdx]);

  const tocar = useCallback(async (musica) => {
    if (!musica) return;
    try {
      await adicionarMusica(musica);
      avisar(`♪ NA FILA: ${musica.titulo.toUpperCase()}`);
    } catch (erro) {
      if (erro.codigo === 'SALDO_INSUFICIENTE') avisar('COLOQUE CRÉDITOS PARA TOCAR', 'erro', true);
      else avisar(erro.message.toUpperCase(), 'erro');
    }
  }, [adicionarMusica, avisar]);

  const apertar = useCallback((botao) => {
    if (janela) return controleJanela.current?.(botao);
    const total = musicas?.length ?? 0;
    if (botao === 'ritmo') mudarRitmo(1);
    if (botao === 'anterior') mudarCd(-1);
    if (botao === 'proxima') mudarCd(1);
    if (botao === 'descer' && total) setFaixaIdx((i) => (i + 1) % total);
    if (botao === 'subir' && total) setFaixaIdx((i) => (i - 1 + total) % total);
    if (botao === 'tocar') {
      if (noInternet) setJanela('internet');
      else if (total) tocar(musicas[Math.min(faixaIdx, total - 1)]);
    }
    if (botao === 'creditos') setJanela('creditos');
    if (botao === 'internet' && config.youtube.ativo) setJanela('internet');
    return undefined;
  }, [janela, musicas, faixaIdx, noInternet, config.youtube.ativo, mudarRitmo, mudarCd, tocar]);

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
      <main className="pn pn-carregando">
        {erroConexao || lista.erro
          ? <button type="button" onClick={tentarNovamente}>{erroConexao || lista.erro.message} · TENTAR DE NOVO</button>
          : <span className="carregando" aria-label="Carregando" />}
      </main>
    );
  }

  const inicio = musicas ? Math.max(0, Math.min(faixaIdx - FAIXAS_VISIVEIS + 3, musicas.length - FAIXAS_VISIVEIS)) : 0;
  const tocandoId = fila.agora_tocando?.musica.id;
  const naFila = new Set(fila.fila.map((item) => item.musica.id));

  return (
    <main className="pn" style={{ '--tema': cd?.cor || ritmo.cor || '#7b2ff7' }}>
      <div className="pn-luzes" aria-hidden="true"><span /><span /><span /></div>
      <Topo nome={info.dados?.nome ?? 'Jukebox'} />

      <nav className="pn-ritmos" aria-label="Ritmos" ref={faixaRitmos}>
        {ritmos.map((r, i) => (
          <button type="button" key={r.id} className={i === ritmoIdx ? 'ativo' : ''} onClick={() => mudarRitmo(i - ritmoIdx)}>
            <span aria-hidden="true">{r.icone}</span>{r.nome}
          </button>
        ))}
      </nav>

      <Carrossel cds={cds} indice={cdIdx} internet={noInternet} aoEscolher={(d) => (noInternet ? setJanela('internet') : mudarCd(d))} />

      <section className="pn-disco">
        {cd && (
          <div className="pn-disco-info">
            <span className="pn-disco-num">Nº {numero(numeros.get(cd.id))}</span>
            <h1>{cd.titulo}</h1>
            <p>{cd.artista}{cd.ano ? ` · ${cd.ano}` : ''} · {cd.total_musicas} faixas</p>
          </div>
        )}
        <ol className="pn-faixas" style={{ '--linhas': Math.ceil(Math.min(FAIXAS_VISIVEIS, musicas?.length ?? 0) / 2) }}>
          {noInternet && <li className="pn-vazio">Não achou no acervo? Aperte TOCAR, escreva o nome e a música vem da internet com capa.</li>}
          {cd && !musicas && <li className="pn-vazio">Carregando…</li>}
          {musicas?.slice(inicio, inicio + FAIXAS_VISIVEIS).map((m, i) => {
            const n = inicio + i;
            const escolhida = n === faixaIdx;
            return (
              <li key={m.id}>
                <button type="button" className={escolhida ? 'escolhida' : ''} onClick={() => (escolhida ? tocar(m) : setFaixaIdx(n))}>
                  <span className="pn-faixa-num">{escolhida ? '▶' : String(n + 1).padStart(2, '0')}</span>
                  <span className="pn-faixa-titulo">{m.titulo}</span>
                  {m.id === tocandoId && <span className="pn-faixa-tag">TOCANDO</span>}
                  {m.id !== tocandoId && naFila.has(m.id) && <span className="pn-faixa-tag">NA FILA</span>}
                  {m.creditos > 1 && <span className="pn-faixa-tag ouro">{m.creditos} CRÉD.</span>}
                  <span className="pn-faixa-tempo">{formatarDuracao(m.duracao)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <footer className="pn-botoes">
        <button type="button" onClick={() => apertar('ritmo')}><kbd>RITMO</kbd>{ritmo.nome}</button>
        <button type="button" onClick={() => apertar('anterior')}><kbd>◀</kbd>CD anterior</button>
        <button type="button" onClick={() => apertar('descer')}><kbd>▼</kbd>Faixa</button>
        <button type="button" onClick={() => apertar('proxima')}><kbd>▶</kbd>Próximo CD</button>
        <button type="button" className="tocar" onClick={() => apertar('tocar')}><kbd>TOCAR</kbd>{noInternet ? 'Buscar' : 'Pôr na fila'}</button>
        {config.youtube.ativo && <button type="button" onClick={() => setJanela('internet')}><kbd>🌐</kbd>Internet</button>}
        <button type="button" className="creditos" onClick={() => setJanela('creditos')}><kbd>$</kbd>Créditos</button>
      </footer>

      {aviso && <div className={`pn-aviso ${aviso.tipo}`} key={aviso.id} role="status">{aviso.texto}</div>}
      {janela === 'creditos' && <Pagamento controle={controleJanela} aoFechar={() => setJanela(null)} />}
      {janela === 'internet' && <Internet controle={controleJanela} aoFechar={() => setJanela(null)} aviso={avisar} />}
    </main>
  );
}

// Tela da jukebox: carrossel de capas, faixas do CD, o que toca no topo e os botões da máquina embaixo.
// Anda pelos botões físicos (teclas, veja teclas.js) ou por toque.
export default function Maquina() {
  return (
    <SessaoProvider>
      <Tela />
    </SessaoProvider>
  );
}
