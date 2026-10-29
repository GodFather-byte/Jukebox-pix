import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import AvisoPreparando from '../components/AvisoPreparando.jsx';
import Avisos from '../components/Avisos.jsx';
import Capa from '../components/Capa.jsx';
import Progresso from '../components/Progresso.jsx';
import { abrirCreditos, api, textoEspera } from '../api.js';
import { SessaoProvider, useSessao } from '../context/Sessao.jsx';
import { ToastProvider, useToast } from '../context/Toast.jsx';
import { useAgora, useApi, useManterAceso } from '../hooks.js';
import Creditos from './Creditos.jsx';
import Teclado from './Teclado.jsx';
import './quiosque.css';

const OCIOSO_MS = 90_000; // sem ninguém tocando na tela: volta ao início e mostra a tela de descanso

const NAVEGACAO = [
  { para: '/', icone: '⌂', texto: 'Início', fim: true },
  { para: '/buscar', icone: '⌕', texto: 'Buscar' },
  { para: '/generos', icone: '◫', texto: 'Gêneros' },
  { para: '/top', icone: '★', texto: 'Mais tocadas' },
  { para: '/fila', icone: '≡', texto: 'Fila' },
];

function saudacao(agora) {
  const hora = new Date(agora).getHours();
  return hora < 5 ? 'Boa madrugada' : hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
}

function Lateral({ nome }) {
  const { saldo, config, quiosque } = useSessao();
  return (
    <aside className="qk-lateral">
      <div className="qk-marca">
        <span className="qk-marca-icone" aria-hidden="true">♪</span>
        <strong>{nome}</strong>
      </div>
      <nav className="qk-nav" aria-label="Menu">
        {NAVEGACAO.map((item) => (
          <NavLink key={item.para} to={item.para} end={item.fim} className={({ isActive }) => (isActive ? 'ativo' : '')}>
            <span aria-hidden="true">{item.icone}</span>{item.texto}
          </NavLink>
        ))}
        {config.recados.ativo && (
          <NavLink to="/recado" className={({ isActive }) => (isActive ? 'ativo' : '')}><span aria-hidden="true">✉</span>Recado no telão</NavLink>
        )}
      </nav>
      <div className="qk-carteira">
        <span>Seus créditos</span>
        <b>{saldo}</b>
        <small>1 crédito = 1 música · R$ 1,00</small>
        <button type="button" className="qk-btn qk-btn-grande" onClick={abrirCreditos} disabled={!config.vendas_abertas && !quiosque.metodos.nota}>
          + Colocar créditos
        </button>
        <div className="qk-formas" aria-label="Formas de pagamento">
          {quiosque.metodos.pix && <span>Pix</span>}
          {quiosque.metodos.cartao && <span>Débito</span>}
          {quiosque.metodos.cartao && <span>Crédito</span>}
          {quiosque.metodos.nota && <span>Dinheiro</span>}
        </div>
        {quiosque.modo_teste && <small className="qk-teste">🧪 Modo teste: nada é cobrado</small>}
      </div>
    </aside>
  );
}

// Coluna da direita, como a fila do YouTube Music: o que toca e o que vem a seguir.
function PainelFila() {
  const { fila } = useSessao();
  const atual = fila.agora_tocando;
  return (
    <aside className="qk-painel">
      <h2>Tocando agora</h2>
      {atual ? (
        <div className="qk-painel-agora">
          <Capa capa={atual.musica.capa} icone={atual.musica.icone} cor={atual.musica.cor} titulo={atual.musica.cd} className="qk-painel-capa" prioridade />
          <strong>{atual.musica.titulo}</strong>
          <span>{atual.musica.artista}</span>
        </div>
      ) : <p className="qk-vazio">Nada tocando. Escolha a primeira!</p>}
      <h2>A seguir {fila.total_aguardando > 0 && <small>{fila.total_aguardando}</small>}</h2>
      {fila.fila.length === 0 ? <p className="qk-vazio">Fila livre: a sua toca já.</p> : (
        <ol className="qk-painel-lista">
          {fila.fila.slice(0, 12).map((item) => (
            <li key={item.id}>
              <Capa capa={item.musica.capa} icone={item.musica.icone} cor={item.musica.cor} titulo="" className="capa-pequena" />
              <div>
                <strong>{item.prioridade ? '⚡ ' : ''}{item.musica.titulo}</strong>
                <span>{item.musica.artista}</span>
              </div>
              <small>{textoEspera(item.espera_segundos)}</small>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}

// Barra de baixo, como a do Spotify: capa, música, progresso e o saldo sempre à vista.
function Tocador() {
  const { fila, saldo } = useSessao();
  const atual = fila.agora_tocando;
  const seguinte = fila.fila[0];
  return (
    <footer className="qk-tocador">
      <div className="qk-tocador-musica">
        {atual ? (
          <>
            <Capa capa={atual.musica.capa} icone={atual.musica.icone} cor={atual.musica.cor} titulo={atual.musica.cd} className="qk-tocador-capa" />
            <div>
              <strong>{atual.musica.titulo}</strong>
              <span>{atual.musica.artista}</span>
            </div>
            <span className="eq" aria-hidden="true"><span /><span /><span /><span /></span>
          </>
        ) : <span className="qk-vazio">Toque em uma música para ela tocar</span>}
      </div>
      <div className="qk-tocador-meio">
        <Progresso item={atual} mostrarTempo />
        {seguinte && <small>A seguir: <b>{seguinte.musica.titulo}</b> · {seguinte.musica.artista}</small>}
      </div>
      <button type="button" className="qk-tocador-saldo" onClick={abrirCreditos}>
        <b>{saldo}</b> {saldo === 1 ? 'crédito' : 'créditos'}
        <span>+ Colocar</span>
      </button>
    </footer>
  );
}

// Tela de descanso: quando ninguém mexe, mostra o que toca em tamanho grande e chama quem passa.
function Descanso({ nome, aoAcordar }) {
  const { fila, quiosque } = useSessao();
  const agora = useAgora(1000);
  const atual = fila.agora_tocando;
  const [cartazes, setCartazes] = useState([]);
  const [indice, setIndice] = useState(0);
  const [recado, setRecado] = useState(null);

  useEffect(() => {
    api('/cartazes').then((c) => setCartazes(c.ativo ? c.cartazes : [])).catch(() => {});
    api('/recados/atual').then((d) => setRecado(d.atual)).catch(() => {});
    const eventos = new EventSource('/api/eventos?tela=1');
    eventos.addEventListener('recado', (e) => setRecado(JSON.parse(e.data).atual ?? null));
    return () => eventos.close();
  }, []);
  useEffect(() => {
    if (cartazes.length === 0) return undefined;
    const id = setInterval(() => setIndice((i) => i + 1), 12_000);
    return () => clearInterval(id);
  }, [cartazes.length]);

  const cartaz = cartazes.length && indice % 3 === 2 ? cartazes[Math.floor(indice / 3) % cartazes.length] : null;
  return (
    <div className="qk-descanso" role="button" tabIndex={0} onClick={aoAcordar} onKeyDown={aoAcordar} aria-label="Toque para escolher sua música">
      <div
        className="qk-descanso-fundo"
        style={atual?.musica.capa ? { backgroundImage: `url("/capas/${encodeURI(atual.musica.capa)}")` } : { background: atual?.musica.cor || '#3a1530' }}
      />
      <div className="qk-descanso-topo">
        <strong>♪ {nome}</strong>
        <time>{new Date(agora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
      {cartaz ? (
        <img className="qk-descanso-cartaz" src={cartaz.imagem} alt={cartaz.legenda ?? ''} />
      ) : (
        <div className="qk-descanso-agora">
          {atual && <Capa capa={atual.musica.capa} icone={atual.musica.icone} cor={atual.musica.cor} titulo={atual.musica.cd} className="qk-descanso-capa" />}
          <div>
            <span className="qk-selo">{atual ? 'TOCANDO AGORA' : 'JUKEBOX'}</span>
            <h1>{atual ? atual.musica.titulo : 'Escolha a próxima música'}</h1>
            {atual && <p>{atual.musica.artista}</p>}
            {atual && <Progresso item={atual} />}
          </div>
        </div>
      )}
      {recado && <div className="qk-descanso-recado">💬 {recado.texto}</div>}
      <div className="qk-descanso-chamada">
        <b>TOQUE NA TELA PARA ESCOLHER SUA MÚSICA</b>
        <span>Pix{quiosque.metodos.cartao ? ' · Débito · Crédito' : ''}{quiosque.metodos.nota ? ' · Dinheiro' : ''}</span>
      </div>
    </div>
  );
}

function Conteudo() {
  const { sessao, erroConexao, tentarNovamente, conectado, fila } = useSessao();
  const info = useApi('/info');
  const nome = info.dados?.nome ?? 'Jukebox';
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const mostrar = useToast();
  const agora = useAgora(60_000);
  const [creditos, setCreditos] = useState(false);
  const [descanso, setDescanso] = useState(false);
  const rolagem = useRef(null);
  useManterAceso();

  useEffect(() => { rolagem.current?.scrollTo(0, 0); }, [pathname]);

  useEffect(() => {
    const tocando = fila.agora_tocando?.musica.titulo;
    document.title = tocando ? `${tocando} · ${nome}` : nome;
  }, [fila.agora_tocando?.musica.titulo, nome]);

  useEffect(() => {
    const abrir = () => { setDescanso(false); setCreditos(true); };
    window.addEventListener('jukebox:pagar', abrir);
    return () => window.removeEventListener('jukebox:pagar', abrir);
  }, []);

  // Nota que entra pelo noteiro aparece em qualquer tela (com a janela de créditos aberta, ela mesma mostra).
  const creditosAberto = useRef(false);
  creditosAberto.current = creditos;
  useEffect(() => {
    const aoPagamento = (e) => {
      const { metodo, status, creditos: total } = e.detail ?? {};
      if (status === 'confirmado' && metodo === 'nota' && !creditosAberto.current) {
        setDescanso(false);
        mostrar(`💵 +${total} ${total === 1 ? 'crédito' : 'créditos'}! Escolha suas músicas.`, { tipo: 'ok' });
      }
    };
    window.addEventListener('jukebox:pagamento', aoPagamento);
    return () => window.removeEventListener('jukebox:pagamento', aoPagamento);
  }, [mostrar]);

  // Ninguém mexeu por um tempo: fecha o que estiver aberto, volta ao início e descansa.
  // Com a janela de créditos aberta não descansa (pode haver Pix ou cartão em andamento).
  const acordar = useCallback(() => setDescanso(false), []);
  useEffect(() => {
    if (creditos) return undefined;
    let relogio;
    const reiniciar = () => {
      clearTimeout(relogio);
      relogio = setTimeout(() => {
        document.activeElement?.blur?.();
        navigate('/');
        setDescanso(true);
      }, OCIOSO_MS);
    };
    reiniciar();
    const eventos = ['pointerdown', 'keydown', 'wheel'];
    for (const e of eventos) window.addEventListener(e, reiniciar, { passive: true });
    return () => { clearTimeout(relogio); for (const e of eventos) window.removeEventListener(e, reiniciar); };
  }, [creditos, navigate]);

  if (!sessao) {
    return (
      <main className="qk-carregando">
        {erroConexao ? (
          <>
            <p className="qk-erro">{erroConexao}</p>
            <button type="button" className="qk-btn" onClick={tentarNovamente}>Tentar de novo</button>
          </>
        ) : <span className="carregando" aria-label="Carregando" />}
      </main>
    );
  }

  return (
    <div className="qk">
      <Avisos />
      <Lateral nome={nome} />
      <main className="qk-conteudo" ref={rolagem}>
        <div className="qk-topo">
          <div className="qk-setas">
            <button type="button" aria-label="Voltar" onClick={() => navigate(-1)} disabled={pathname === '/'}>‹</button>
            <button type="button" aria-label="Avançar" onClick={() => navigate(1)}>›</button>
          </div>
          <span className="qk-saudacao">{saudacao(agora)}!</span>
          <time className="qk-relogio">{new Date(agora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
        {!conectado && <div className="qk-faixa qk-faixa-erro" role="alert">Sem conexão com o servidor do jukebox. A música continua; esta tela volta sozinha.</div>}
        <AvisoPreparando />
        <Outlet />
      </main>
      <PainelFila />
      <Tocador />
      <Teclado />
      {creditos && <Creditos aoFechar={() => setCreditos(false)} />}
      {descanso && <Descanso nome={nome} aoAcordar={acordar} />}
    </div>
  );
}

export default function Quiosque() {
  return (
    <SessaoProvider>
      <ToastProvider>
        <Conteudo />
      </ToastProvider>
    </SessaoProvider>
  );
}
