import { Route, Routes } from 'react-router-dom';
import AdminPanel from './pages/AdminPanel.jsx';
import Telao from './pages/Telao.jsx';
import Maquina from './maquina/Maquina.jsx';

// O cliente escolhe e paga só na tela da máquina (/). /telao é o segundo monitor do salão; /admin, o painel do dono.
export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/telao" element={<Telao />} />
      <Route path="*" element={<Maquina />} />
    </Routes>
  );
}
