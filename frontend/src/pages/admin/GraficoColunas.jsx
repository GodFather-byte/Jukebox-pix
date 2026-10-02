import { useEffect, useRef, useState } from 'react';

const ALTURA = 220;
const MARGEM = { topo: 24, direita: 8, base: 28, esquerda: 36 };
const ESPESSURA_MAX = 24;
const RAIO = 4;

// Máximo "redondo" pro eixo: 1, 2, 5 × 10^n.
function maximoRedondo(valor) {
  if (valor <= 4) return 4;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  const passo = [1, 2, 5, 10].find((m) => valor <= m * potencia) * potencia;
  return passo;
}

// Coluna com 4px de arredondamento só no topo e base reta.
function caminhoColuna(x, y, largura, altura) {
  const r = Math.min(RAIO, largura / 2, altura);
  return `M${x},${y + altura} V${y + r} Q${x},${y} ${x + r},${y} H${x + largura - r} Q${x + largura},${y} ${x + largura},${y + r} V${y + altura} Z`;
}

const rotuloDia = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

// Série única: sem legenda (o título diz o que é), grade fina, rótulo só no pico, tooltip + tabela.
// serie: [{ dia: 'AAAA-MM-DD', valor: número plotado, texto: detalhe do tooltip/tabela }]
export default function GraficoColunas({ serie, titulo, nomeValor = 'Valor' }) {
  const caixa = useRef(null);
  const [largura, setLargura] = useState(0);
  const [ativo, setAtivo] = useState(null);

  useEffect(() => {
    const observador = new ResizeObserver(([entrada]) => setLargura(entrada.contentRect.width));
    observador.observe(caixa.current);
    return () => observador.disconnect();
  }, []);

  const maximo = maximoRedondo(Math.max(...serie.map((p) => p.valor), 0));
  const areaL = Math.max(0, largura - MARGEM.esquerda - MARGEM.direita);
  const areaA = ALTURA - MARGEM.topo - MARGEM.base;
  const faixa = serie.length ? areaL / serie.length : 0;
  const espessura = Math.min(ESPESSURA_MAX, faixa * 0.6);
  const yDe = (valor) => MARGEM.topo + areaA - (valor / maximo) * areaA;
  const indicePico = serie.reduce((melhor, p, i) => (p.valor > serie[melhor].valor ? i : melhor), 0);
  const passoRotulo = faixa < 34 ? 2 : 1;
  const marcas = [0, 1, 2, 3, 4].map((i) => (maximo / 4) * i);

  const pontoAtivo = ativo != null ? serie[ativo] : null;

  return (
    <figure className="grafico">
      <figcaption className="grafico-titulo">{titulo}</figcaption>
      <div className="grafico-area" ref={caixa}>
        {largura > 0 && (
          <svg width={largura} height={ALTURA} role="img" aria-label={`${titulo}. Use a tabela abaixo para ver os valores.`}>
            {marcas.map((m) => (
              <g key={m}>
                <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={yDe(m)} y2={yDe(m)} className="grafico-grade" />
                <text x={MARGEM.esquerda - 6} y={yDe(m) + 4} textAnchor="end" className="grafico-eixo">{Math.round(m)}</text>
              </g>
            ))}

            {serie.map((ponto, i) => {
              const x0 = MARGEM.esquerda + i * faixa;
              const altura = (ponto.valor / maximo) * areaA;
              const x = x0 + (faixa - espessura) / 2;
              return (
                <g key={ponto.dia}>
                  {ponto.valor > 0 && (
                    <path d={caminhoColuna(x, yDe(ponto.valor), espessura, altura)} className={`grafico-coluna ${ativo === i ? 'ativo' : ''}`} />
                  )}
                  {i % passoRotulo === 0 && (
                    <text x={x0 + faixa / 2} y={ALTURA - 8} textAnchor="middle" className="grafico-eixo">{rotuloDia(ponto.dia)}</text>
                  )}
                  {i === indicePico && ponto.valor > 0 && (
                    <text x={x0 + faixa / 2} y={yDe(ponto.valor) - 6} textAnchor="middle" className="grafico-pico">{ponto.valor}</text>
                  )}
                  {/* alvo de hover/toque: a faixa inteira, bem maior que a coluna */}
                  <rect
                    x={x0} y={MARGEM.topo} width={faixa} height={areaA + MARGEM.base} fill="transparent"
                    onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)}
                    onTouchStart={() => setAtivo(i)}
                  />
                </g>
              );
            })}
          </svg>
        )}

        {pontoAtivo && (
          <div
            className="grafico-tooltip"
            style={{ left: Math.min(Math.max(MARGEM.esquerda + (ativo + 0.5) * faixa, 70), largura - 70) }}
          >
            <strong>{rotuloDia(pontoAtivo.dia)}</strong>
            <span>{pontoAtivo.texto}</span>
          </div>
        )}
      </div>

      <details className="grafico-tabela">
        <summary>Ver como tabela</summary>
        <table>
          <thead><tr><th>Dia</th><th>{nomeValor}</th><th>Detalhe</th></tr></thead>
          <tbody>
            {serie.map((p) => (
              <tr key={p.dia}><td>{rotuloDia(p.dia)}</td><td className="mono">{p.valor}</td><td>{p.texto}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
