import { useEffect, useState } from 'react';
import { formatarDuracao } from '../../api.js';
import { useDebounce } from '../../hooks.js';

export default function Console({ chamar }) {
  const [texto, setTexto] = useState('');
  const termo = useDebounce(texto.trim(), 300);
  const [resultados, setResultados] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [ocupado, setOcupado] = useState('');

  useEffect(() => {
    if (termo.length < 2) { setResultados(null); return undefined; }
    let ativo = true;
    chamar(`/admin/musicas?q=${encodeURIComponent(termo)}`)
      .then((d) => ativo && setResultados(d.musicas))
      .catch((e) => ativo && setMensagem({ tipo: 'erro', texto: e.message }));
    return () => { ativo = false; };
  }, [termo, chamar]);

  async function pedir(musica, modo) {
    if (modo === 'agora' && !window.confirm('Isso corta a música que está tocando agora (ela conta como tocada, sem reembolso). Continuar?')) return;
    setOcupado(`${musica.id}:${modo}`);
    try {
      await chamar('/admin/fila/casa', { metodo: 'POST', corpo: { musica_id: musica.id, modo } });
      const textos = { fila: 'entrou no fim da fila', seguir: 'vai tocar a seguir', agora: 'está começando' };
      setMensagem({ tipo: 'ok', texto: `✔ “${musica.titulo}” ${textos[modo]} (pedido da casa: grátis e fora do faturamento).` });
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message });
    } finally {
      setOcupado('');
    }
  }

  async function alternarOculta(musica) {
    try {
      const r = await chamar(`/admin/musicas/${musica.id}/oculta`, { metodo: 'PUT', corpo: { oculta: !musica.oculta } });
      setResultados((lista) => lista.map((m) => (m.id === musica.id ? { ...m, oculta: r.oculta ? 1 : 0 } : m)));
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message });
    }
  }

  return (
    <>
      <h2>🎛 Console do dono</h2>
      <p className="nota">
        Procure qualquer música e ponha na fila como <b>pedido da casa</b>: não gasta crédito e não entra no faturamento nem no ranking.
        A fila e o que está tocando ficam na aba <b>Player</b>. Música oculta some do app (e da playlist automática), mas aparece aqui para você reexibir.
      </p>

      <input className="campo" type="search" placeholder="Música, artista, CD ou gênero…" value={texto}
        onChange={(e) => setTexto(e.target.value)} autoComplete="off" />

      {mensagem && <p className={`aviso importar-espaco ${mensagem.tipo === 'erro' ? 'aviso-erro' : 'aviso-ok'}`}>{mensagem.texto}</p>}
      {termo.length >= 2 && resultados && resultados.length === 0 && <p className="vazio">Nada encontrado.</p>}

      <ul className="admin-lista console-lista">
        {resultados?.map((m) => {
          const escondida = Boolean(m.oculta || m.cd_oculto);
          return (
            <li key={m.id} className={`admin-linha ${escondida ? 'oculta' : ''}`}>
              <div className="admin-linha-info">
                <strong>{m.titulo}</strong>
                <span>{m.artista} · {m.cd} · <span className="mono">{formatarDuracao(m.duracao)}</span> · {m.vezes_tocada}x tocada</span>
                {escondida && <span className="selo selo-rosa">🙈 {m.cd_oculto ? 'CD oculto' : 'Oculta'} no app</span>}
              </div>
              <div className="admin-acoes">
                <button className="btn btn-pequeno" disabled={ocupado === `${m.id}:fila`} onClick={() => pedir(m, 'fila')}>+ Fila</button>
                <button className="btn btn-ciano btn-pequeno" disabled={ocupado === `${m.id}:seguir`} onClick={() => pedir(m, 'seguir')}>⚡ A seguir</button>
                <button className="btn btn-perigo btn-pequeno" disabled={ocupado === `${m.id}:agora`} onClick={() => pedir(m, 'agora')}>▶ Agora</button>
                <button className="btn btn-fantasma btn-pequeno" onClick={() => alternarOculta(m)}>{m.oculta ? 'Mostrar' : 'Ocultar'}</button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
