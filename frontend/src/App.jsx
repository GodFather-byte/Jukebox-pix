import { useEffect } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import Header from './components/Header.jsx';
import Avisos from './components/Avisos.jsx';
import AvisoPreparando from './components/AvisoPreparando.jsx';
import MiniPlayer from './components/MiniPlayer.jsx';
import NavInferior from './components/NavInferior.jsx';
import { SessaoProvider, useSessao } from './context/Sessao.jsx';
import { ToastProvider } from './context/Toast.jsx';
import AdminPanel from './pages/AdminPanel.jsx';
import Artistas from './pages/Artistas.jsx';
import Busca from './pages/Busca.jsx';
import Categorias from './pages/Categorias.jsx';
import CDs from './pages/CDs.jsx';
import FilaPagina from './pages/FilaPagina.jsx';
import Home from './pages/Home.jsx';
import Musicas from './pages/Musicas.jsx';
import Pagar from './pages/Pagar.jsx';
import Recado from './pages/Recado.jsx';
import ResgatarVale from './pages/ResgatarVale.jsx';
import Tela from './pages/Tela.jsx';
import Top from './pages/Top.jsx';

function Conteudo() {
  const { sessao, erroConexao, tentarNovamente, fila, conectado } = useSessao();
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const tocando = fila.agora_tocando?.musica.titulo;
  useEffect(() => {
    document.title = tocando ? `${tocando} · Jukebox` : 'Jukebox';
    return () => { document.title = 'Jukebox'; };
  }, [tocando]);

  if (!sessao) {
    return (
      <main className="conteudo conteudo-centro">
        {erroConexao ? (
          <>
            <p className="aviso aviso-erro">{erroConexao}</p>
            <button className="btn" onClick={tentarNovamente}>Tentar de novo</button>
          </>
        ) : <span className="carregando" aria-label="Carregando" />}
      </main>
    );
  }

  return (
    <>
      <Avisos />
      <Header />
      <div className="faixas-topo">
        {!conectado && <div className="banner-offline" role="status">Sem conexão com a jukebox. A música do salão continua; esta tela atualiza quando o WiFi voltar.</div>}
        <AvisoPreparando />
      </div>
      <main className="conteudo"><Outlet /></main>
      <MiniPlayer />
      <NavInferior />
    </>
  );
}

// Só as telas do cliente criam sessão; o monitor (/tela) e o admin ficam de fora.
function LayoutCliente() {
  return (
    <SessaoProvider>
      <ToastProvider>
        <Conteudo />
      </ToastProvider>
    </SessaoProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/tela" element={<Tela />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route element={<LayoutCliente />}>
        <Route index element={<Home />} />
        <Route path="categorias" element={<Categorias />} />
        <Route path="categoria/:id" element={<Artistas />} />
        <Route path="artista/:id" element={<CDs />} />
        <Route path="cd/:id" element={<Musicas />} />
        <Route path="busca" element={<Busca />} />
        <Route path="top" element={<Top />} />
        <Route path="fila" element={<FilaPagina />} />
        <Route path="pagar" element={<Pagar />} />
        <Route path="recado" element={<Recado />} />
        <Route path="vale/:codigo" element={<ResgatarVale />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
