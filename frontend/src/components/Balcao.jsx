import { useEffect, useState } from 'react';
import Busca from '../pages/Busca.jsx';
import Pagar from '../pages/Pagar.jsx';
import { SessaoProvider, useSessao } from '../context/Sessao.jsx';
import { ToastProvider } from '../context/Toast.jsx';

function Painel({ tocando, onFechar }) {
  const { sessao, saldo, erroConexao, tentarNovamente } = useSessao();
  const [aba, setAba] = useState('pagar');

  useEffect(() => {
    const aoPagar = () => setAba('pagar');
    window.addEventListener('jukebox:pagar', aoPagar);
    return () => window.removeEventListener('jukebox:pagar', aoPagar);
  }, []);

  return (
    <section className="balcao" role="dialog" aria-modal="true" aria-label="Pagar e escolher música nesta tela">
      <header className="balcao-topo">
        <strong className="mono">💰 {saldo} {saldo === 1 ? 'crédito' : 'créditos'}</strong>
        <div className="balcao-abas" role="tablist">
          <button type="button" role="tab" aria-selected={aba === 'pagar'} className={aba === 'pagar' ? 'ativo' : ''} onClick={() => setAba('pagar')}>Pagar</button>
          <button type="button" role="tab" aria-selected={aba === 'buscar'} className={aba === 'buscar' ? 'ativo' : ''} onClick={() => setAba('buscar')}>Escolher música</button>
        </div>
        <button type="button" className="btn btn-fantasma btn-pequeno" onClick={onFechar}>Voltar ao telão</button>
      </header>
      {tocando && <p className="balcao-tocando">Tocando agora: <strong>{tocando.musica.titulo}</strong></p>}
      <div className="balcao-corpo">
        {!sessao ? (
          <div className="estado">
            {erroConexao
              ? <button type="button" className="btn" onClick={tentarNovamente}>Tentar de novo</button>
              : <span className="carregando" aria-label="Carregando" />}
          </div>
        ) : (
          <div className="balcao-miolo">
            {aba === 'pagar'
              ? <Pagar embutido aoEscolher={() => setAba('buscar')} aoVoltar={onFechar} />
              : <Busca />}
          </div>
        )}
      </div>
    </section>
  );
}

// Pagamento e busca por cima do telão, sem sair da rota (o monitor continua ligado para os recados).
export default function Balcao({ tocando, onFechar }) {
  return (
    <SessaoProvider>
      <ToastProvider>
        <Painel tocando={tocando} onFechar={onFechar} />
      </ToastProvider>
    </SessaoProvider>
  );
}
