import { formatarRestante, segundosRestantes } from '../api.js';
import { useAgora } from '../hooks.js';

// Barra de progresso da música tocando, calculada pelos horários que o servidor informou.
export default function Progresso({ item, mostrarTempo = false }) {
  const agora = useAgora(1000);
  if (!item?.iniciado_em || !item?.fim_previsto_em) return null;

  const inicio = Date.parse(item.iniciado_em);
  const total = Date.parse(item.fim_previsto_em) - inicio;
  const pct = total > 0 ? Math.min(100, Math.max(0, ((agora - inicio) / total) * 100)) : 0;
  const restante = formatarRestante(segundosRestantes(item, agora));
  const barra = (
    <div
      className="progresso"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={restante ? `${restante} restantes` : undefined}
    >
      <div className="progresso-barra" style={{ width: `${pct}%` }} />
    </div>
  );

  if (!mostrarTempo) return barra;
  return (
    <div className="progresso-linha">
      {barra}
      {restante && <span className="progresso-tempo mono">{restante}</span>}
    </div>
  );
}
