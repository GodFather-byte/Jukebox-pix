import { useCallback, useEffect, useRef, useState } from 'react';
import Progresso from '../../components/Progresso.jsx';
import { useDebounce } from '../../hooks.js';
import AutomaticaConfig from './AutomaticaConfig.jsx';

// Volume mestre: grava depois de ~0,4 s sem mexer no controle. O mpv muda na hora; o VLC, na próxima faixa.
function Volume({ chamar, estado }) {
  const [volume, setVolume] = useState(estado.volume);
  const [mensagem, setMensagem] = useState('');
  const noServidor = useRef(estado.volume);
  const adiado = useDebounce(volume, 400);

  useEffect(() => {
    if (estado.volume !== noServidor.current) { noServidor.current = estado.volume; setVolume(estado.volume); }
  }, [estado.volume]);

  useEffect(() => {
    if (adiado === noServidor.current) return;
    noServidor.current = adiado;
    chamar('/admin/volume', { metodo: 'PUT', corpo: { volume: adiado } })
      .then((r) => setMensagem(r.aplicado_ao_vivo ? 'Aplicado agora.' : 'Vale a partir da próxima música.'))
      .catch((e) => setMensagem(e.message));
  }, [adiado, chamar]);

  return (
    <div className="card volume">
      <label className="volume-linha">
        <strong>🔊 Volume</strong>
        <input type="range" min="0" max="100" step="5" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
        <b className="mono">{volume}%</b>
      </label>
      <small>
        {estado.volume_ao_vivo ? 'Muda na hora, com a música tocando.' : estado.backend === 'sim' ? 'Player simulado: sem áudio.' : 'Este player só aplica o volume novo a partir da próxima música.'}
        {mensagem && <> · {mensagem}</>}
      </small>
    </div>
  );
}

export default function PlayerAdmin({ chamar, versao }) {
  const [estado, setEstado] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => chamar('/admin/player').then((e) => { setEstado(e); setErro(''); }).catch((e) => setErro(e.message)), [chamar]);

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, 5000);
    return () => clearInterval(id);
  }, [carregar, versao]);

  const acao = (caminho, opcoes) => chamar(caminho, opcoes).then(carregar).catch((e) => setErro(e.message));

  if (!estado) return erro ? <p className="aviso aviso-erro">{erro}</p> : <div className="estado"><span className="carregando" /></div>;
  const atual = estado.agora_tocando;

  return (
    <>
      <h2>Player</h2>
      {estado.backend === 'sim' && <p className="aviso">🧪 Player simulado: nenhum áudio sai do computador. Instale o mpv ou o VLC para tocar de verdade.</p>}
      {erro && <p className="aviso aviso-erro">{erro}</p>}

      <div className="card fila-agora">
        <span className="selo selo-ciano">{estado.pausado ? '⏸ FILA PAUSADA' : atual ? '▶ TOCANDO AGORA' : '⏹ PARADO'} · {estado.backend}</span>
        {atual
          ? <div className="fila-agora-info"><strong>{atual.musica.titulo}</strong><span>{atual.musica.artista} · {atual.quem}</span></div>
          : <p className="vazio">Nada tocando.</p>}
        <Progresso item={atual} />
        <div className="admin-acoes">
          <button className="btn btn-pequeno" onClick={() => acao('/admin/player/pular', { metodo: 'POST' })} disabled={!atual}>⏭ Pular</button>
          {estado.pausado
            ? <button className="btn btn-ciano btn-pequeno" onClick={() => acao('/admin/player/retomar', { metodo: 'POST' })}>▶ Retomar fila</button>
            : <button className="btn btn-fantasma btn-pequeno" onClick={() => acao('/admin/player/pausar', { metodo: 'POST' })}>⏸ Pausar fila</button>}
        </div>
        <small>Pausar não corta a música atual: só impede que a próxima comece. Pular não reembolsa.</small>
      </div>

      <div className="card automatico">
        <label className="interruptor">
          <input type="checkbox" checked={estado.automatico.ativo}
            onChange={(e) => acao('/admin/automatico', { metodo: 'PUT', corpo: { ativo: e.target.checked } })} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>🎲 Playlist automática</strong>
            <small>Quando a fila esvazia, toca uma música aleatória do acervo para o salão não ficar em silêncio. Não conta no ranking nem no faturamento.</small>
          </span>
        </label>
        <label className="interruptor" aria-disabled={!estado.automatico.ativo}>
          <input type="checkbox" checked={estado.automatico.interrompe} disabled={!estado.automatico.ativo}
            onChange={(e) => acao('/admin/automatico', { metodo: 'PUT', corpo: { interrompe: e.target.checked } })} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>Cortar a aleatória quando alguém pedir</strong>
            <small>Desligado: o pedido toca quando a música aleatória terminar. Ligado: ela é cortada na hora e o pedido começa.</small>
          </span>
        </label>
      </div>

      <AutomaticaConfig chamar={chamar} config={estado.automatico} aoSalvar={carregar} />
      <Volume chamar={chamar} estado={estado} />

      <h2>Na fila ({estado.total_aguardando})</h2>
      {estado.fila.length === 0 && <p className="vazio">Fila vazia.</p>}
      <ol className="fila-lista">
        {estado.fila.map((item, i) => (
          <li key={item.id} className="fila-item">
            <span className="fila-pos mono">{i + 1}</span>
            <div className="fila-item-info"><strong>{item.musica.titulo}</strong><span>{item.musica.artista} · {item.quem}</span></div>
            <button className="btn btn-perigo btn-pequeno" onClick={() => acao(`/admin/fila/${item.id}`, { metodo: 'DELETE' })}>{item.casa ? 'Remover da fila' : 'Remover e reembolsar'}</button>
          </li>
        ))}
      </ol>
    </>
  );
}
