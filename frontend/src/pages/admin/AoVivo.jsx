import { useCallback, useEffect, useState } from 'react';
import Progresso from '../../components/Progresso.jsx';

// Faixa fixa do painel: o que está tocando, pular e pausar, sem trocar de aba.
export default function AoVivo({ chamar, versao }) {
  const [estado, setEstado] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    chamar('/admin/player').then((e) => { setEstado(e); setErro(''); }).catch(() => {});
  }, [chamar]);

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, 8000);
    return () => clearInterval(id);
  }, [carregar, versao]);

  if (!estado) return null;

  const atual = estado.agora_tocando;
  const rotulo = atual ? atual.musica.titulo : estado.vinheta ? 'Tocando vinheta' : estado.pausado ? 'Fila pausada' : 'Nada tocando';

  const acao = (caminho, opcoes) => chamar(caminho, opcoes).then(carregar).catch((e) => setErro(e.message));

  return (
    <div className="admin-aovivo card">
      <div className="admin-aovivo-info">
        <span className="selo selo-ciano">{estado.pausado ? '⏸ PAUSADA' : estado.vinheta ? '📢 VINHETA' : atual ? '▶ NO AR' : '⏹ PARADO'}</span>
        <strong>{rotulo}</strong>
        {atual && <span>{atual.musica.artista} · {atual.quem}</span>}
        {erro && <small className="erro-inline">{erro}</small>}
      </div>
      {atual && <Progresso item={atual} />}
      <div className="admin-acoes">
        <button type="button" className="btn btn-pequeno" onClick={() => acao('/admin/player/pular', { metodo: 'POST' })} disabled={!atual && !estado.vinheta}>⏭ Pular</button>
        {estado.pausado
          ? <button type="button" className="btn btn-ciano btn-pequeno" onClick={() => acao('/admin/player/retomar', { metodo: 'POST' })}>▶ Retomar</button>
          : <button type="button" className="btn btn-fantasma btn-pequeno" onClick={() => acao('/admin/player/pausar', { metodo: 'POST' })}>⏸ Pausar</button>}
      </div>
    </div>
  );
}
