import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Capa from './Capa.jsx';
import { formatarDuracao } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';
import { useToast } from '../context/Toast.jsx';

// `posicao` mostra a medalha do ranking (🥇🥈🥉 e depois o número).
const MEDALHAS = ['🥇', '🥈', '🥉'];

export default function MusicaItem({ musica, posicao, mostrarCapa = true }) {
  const { adicionarMusica } = useSessao();
  const mostrarToast = useToast();
  const navigate = useNavigate();
  const [estado, setEstado] = useState('ocioso'); // ocioso | enviando | ok

  async function adicionar() {
    if (estado !== 'ocioso') return;
    setEstado('enviando');
    try {
      await adicionarMusica(musica);
      mostrarToast(`"${musica.titulo}" entrou na fila 🎶`, { tipo: 'ok' });
      setEstado('ok');
      setTimeout(() => setEstado('ocioso'), 1800);
    } catch (erro) {
      setEstado('ocioso');
      mostrarToast(erro.message, {
        tipo: 'erro',
        acao: erro.codigo === 'SALDO_INSUFICIENTE' ? { texto: 'PAGAR', aoClicar: () => navigate('/pagar') } : undefined,
      });
    }
  }

  return (
    <li className="musica">
      {posicao != null && (
        <span className={`musica-pos ${posicao < 3 ? 'medalha' : 'mono'}`}>{MEDALHAS[posicao] ?? posicao + 1}</span>
      )}
      {mostrarCapa && <Capa capa={musica.capa} icone={musica.icone} cor={musica.cor} titulo={musica.cd} className="capa-pequena" />}
      <div className="musica-info">
        <strong>{musica.titulo}</strong>
        <span>{musica.artista ? `${musica.artista} · ${musica.cd}` : ''}</span>
        <small className="musica-meta">
          <span className="mono">{formatarDuracao(musica.duracao)}</span>
          {musica.vezes_tocada > 0 && <span title="vezes tocada">🔥 <span className="mono">{musica.vezes_tocada}</span>x</span>}
        </small>
      </div>
      <button
        className={`btn btn-add ${estado === 'ok' ? 'btn-ok' : ''}`}
        onClick={adicionar}
        disabled={estado === 'enviando'}
        aria-label={`Adicionar ${musica.titulo} à fila`}
      >
        {estado === 'ok' ? '✔ NA FILA' : '+ ADICIONAR'}
      </button>
    </li>
  );
}
