import Estado from '../components/Estado.jsx';
import GradeCategorias from '../components/GradeCategorias.jsx';
import { useApi } from '../hooks.js';

export default function Categorias() {
  const { dados, erro, carregando } = useApi('/categorias');
  if (!dados) return <Estado carregando={carregando} erro={erro} />;

  return (
    <>
      <h1>Categorias</h1>
      <GradeCategorias categorias={dados.categorias} />
    </>
  );
}
