import { useSessao } from '../context/Sessao.jsx';

// Faixa fixa logo abaixo do topo enquanto uma música da internet pedida por esta pessoa está sendo baixada:
// quem foi olhar a fila e não viu a música entende que ela está a caminho.
export default function AvisoPreparando() {
  const { preparando } = useSessao();
  if (preparando.length === 0) return null;

  const texto = preparando.length === 1
    ? `Preparando “${preparando[0].titulo}”`
    : `Preparando ${preparando.length} músicas da internet`;

  return (
    <div className="preparando-web" role="status" aria-live="polite">
      <span className="carregando carregando-pequeno" aria-hidden="true" />
      <span>🌐 {texto}… entra na fila em instantes.</span>
    </div>
  );
}
