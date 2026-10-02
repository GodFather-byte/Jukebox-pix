import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Capa from './Capa.jsx';
import { formatarDuracao } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';
import { useToast } from '../context/Toast.jsx';

// `posicao` mostra a medalha do ranking (🥇🥈🥉 e depois o número).
const MEDALHAS = ['🥇', '🥈', '🥉'];

export default function MusicaItem({ musica, posicao, mostrarCapa = true }) {
  const { adicionarMusica, config } = useSessao();
  const mostrarToast = useToast();
  const navigate = useNavigate();
  const [estado, setEstado] = useState('ocioso'); // ocioso | enviando | ok

  const extra = config.prioridade.extra;
  const preco = musica.creditos ?? 1; // já vem com o preço de lançamento, se houver
  const custoPrioridade = preco + extra;

  async function adicionar(prioridade = false) {
    if (estado !== 'ocioso') return;
    if (prioridade && !window.confirm(`Tocar a seguir custa ${custoPrioridade} créditos (${preco} da música + ${extra} de prioridade). Confirmar?`)) return;

    setEstado('enviando');
    try {
      await adicionarMusica(musica, { prioridade });
      mostrarToast(prioridade ? `⚡ "${musica.titulo}" vai tocar a seguir!` : `"${musica.titulo}" entrou na fila 🎶`, { tipo: 'ok' });
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
          {preco > 1 && <span className="preco-tag" title="créditos cobrados por esta música">💰 {preco} créditos</span>}
        </small>
        {config.prioridade.ativa && (
          <button className="link-prio" title="Tocar a seguir, à frente da fila" onClick={() => adicionar(true)} disabled={estado === 'enviando'}>
            ⚡ A seguir <span className="mono">({custoPrioridade} créd.)</span>
          </button>
        )}
      </div>
      <button
        className={`btn btn-add ${estado === 'ok' ? 'btn-ok' : ''}`}
        onClick={() => adicionar(false)}
        disabled={estado === 'enviando'}
        aria-label={`Adicionar ${musica.titulo} à fila${preco > 1 ? ` por ${preco} créditos` : ''}`}
      >
        {estado === 'ok' ? '✔ NA FILA' : '+ ADICIONAR'}
      </button>
    </li>
  );
}
