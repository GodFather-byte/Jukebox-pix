import { Navigate, Route, Routes } from 'react-router-dom';
import AdminPanel from './pages/AdminPanel.jsx';
import Artistas from './pages/Artistas.jsx';
import Busca from './pages/Busca.jsx';
import Categorias from './pages/Categorias.jsx';
import CDs from './pages/CDs.jsx';
import FilaPagina from './pages/FilaPagina.jsx';
import Musicas from './pages/Musicas.jsx';
import Recado from './pages/Recado.jsx';
import Telao from './pages/Telao.jsx';
import Top from './pages/Top.jsx';
import Inicio from './quiosque/Inicio.jsx';
import Quiosque from './quiosque/Quiosque.jsx';

// O cliente escolhe e paga só na tela do jukebox (/). /telao é o segundo monitor do salão; /admin, o painel do dono.
export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/telao" element={<Telao />} />
      <Route element={<Quiosque />}>
        <Route index element={<Inicio />} />
        <Route path="tela" element={<Inicio />} />
        <Route path="buscar" element={<Busca />} />
        <Route path="generos" element={<Categorias />} />
        <Route path="categoria/:id" element={<Artistas />} />
        <Route path="artista/:id" element={<CDs />} />
        <Route path="cd/:id" element={<Musicas />} />
        <Route path="top" element={<Top />} />
        <Route path="fila" element={<FilaPagina />} />
        <Route path="recado" element={<Recado />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
