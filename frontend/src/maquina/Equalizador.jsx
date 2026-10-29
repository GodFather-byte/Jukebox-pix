import { memo } from 'react';

// Fundo de barras coloridas de equalizador, como o das máquinas de bar. Só CSS: cada coluna sobe e desce num ritmo próprio.
const COLUNAS = 40;

function Equalizador({ tocando }) {
  return (
    <div className={`mq-eq ${tocando ? '' : 'parado'}`} aria-hidden="true">
      {Array.from({ length: COLUNAS }, (_, i) => (
        <span
          key={i}
          style={{
            '--matiz': `${Math.round((i / COLUNAS) * 330)}`,
            '--tempo': `${0.7 + ((i * 37) % 11) / 10}s`,
            '--atraso': `${-((i * 53) % 17) / 10}s`,
          }}
        />
      ))}
    </div>
  );
}

export default memo(Equalizador);
