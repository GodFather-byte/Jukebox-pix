import { useState } from 'react';

// Quando o dono liga "furar a fila", o TOCAR pergunta: fila normal ou tocar a seguir pagando um pouco mais.
// Qualquer seta troca a opção, TOCAR confirma, RITMO/CANCELAR volta sem cobrar.
export default function Escolha({ controle, musica, extra, aoEscolher, aoFechar }) {
  const [proxima, setProxima] = useState(false);
  const preco = musica.creditos ?? 1;
  const opcoes = [
    { prioridade: false, titulo: 'FILA NORMAL', detalhe: `${preco} ${preco === 1 ? 'crédito' : 'créditos'}` },
    { prioridade: true, titulo: '⚡ TOCAR A SEGUIR', detalhe: `${preco + extra} créditos · passa na frente` },
  ];

  controle.current = (botao) => {
    if (botao === 'tocar') aoEscolher(proxima);
    else if (botao === 'ritmo' || botao === 'voltar') aoFechar();
    else setProxima((p) => !p);
  };

  return (
    <div className="pn-janela-fundo" role="dialog" aria-modal="true" aria-label="Como tocar">
      <section className="pn-janela pn-escolha">
        <header>
          <h1>{musica.titulo.toUpperCase()}</h1>
          <span>Como você quer tocar?</span>
          <button type="button" className="pn-fechar" aria-label="Fechar" onClick={aoFechar}>✕</button>
        </header>
        <div className="pn-escolha-opcoes">
          {opcoes.map((o) => (
            <button key={o.titulo} type="button" className={o.prioridade === proxima ? 'ativo' : ''}
              onClick={() => (o.prioridade === proxima ? aoEscolher(o.prioridade) : setProxima(o.prioridade))}>
              <b>{o.titulo}</b><small>{o.detalhe}</small>
            </button>
          ))}
        </div>
        <p className="pn-dica">Setas trocam · TOCAR confirma · RITMO volta</p>
      </section>
    </div>
  );
}
