import { useCallback, useEffect, useState } from 'react';

const lufs = (n) => `${Number(n).toFixed(1).replace('.', ',')} LUFS`;

// Volume parelho: o ffmpeg mede o volume de cada música uma vez e o player corrige as que destoam.
export default function VolumeParelho({ chamar }) {
  const [d, setD] = useState(null);
  const [alvo, setAlvo] = useState('');
  const [mensagem, setMensagem] = useState(null);

  const carregar = useCallback(() => chamar('/admin/volume-parelho').then((dados) => {
    setD(dados);
    setAlvo((atual) => (atual === '' && dados.alvo !== null ? String(dados.alvo) : atual));
  }).catch((e) => setMensagem({ tipo: 'erro', texto: e.message })), [chamar]);

  useEffect(() => { carregar(); }, [carregar]);
  // Enquanto mede, acompanha o andamento.
  useEffect(() => {
    if (!d?.analise.rodando) return undefined;
    const id = setInterval(carregar, 1500);
    return () => clearInterval(id);
  }, [d?.analise.rodando, carregar]);

  async function agir(caminho, metodo, corpo) {
    setMensagem(null);
    try {
      setD(await chamar(caminho, { metodo, corpo }));
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message });
    }
  }

  if (!d) return null;
  const { ffmpeg, cobertura, analise } = d;
  const pct = analise.total > 0 ? Math.min(100, Math.round((analise.feitas / analise.total) * 100)) : 0;
  const manual = d.alvo !== null;

  return (
    <div className="card volume-parelho">
      <label className="interruptor">
        <input type="checkbox" checked={d.ativa} onChange={(e) => agir('/admin/volume-parelho', 'PUT', { ativa: e.target.checked })} />
        <span className="interruptor-trilho" aria-hidden="true" />
        <span>
          <strong>🎚 Volume parelho entre as músicas</strong>
          <small>CDs diferentes têm volumes diferentes. Com isto ligado, cada música é medida uma vez e o player sobe ou desce o volume dela até o mesmo nível (sem distorcer: sobe no máximo 6 dB e respeita o limite da faixa).</small>
        </span>
      </label>

      <div className={`sistema-item ${ffmpeg.disponivel ? 'sistema-ok' : 'sistema-atencao'}`}>
        <span className="sistema-icone" aria-hidden="true">{ffmpeg.disponivel ? '🟢' : '🟡'}</span>
        <div>
          <strong>{ffmpeg.disponivel ? `ffmpeg encontrado (${ffmpeg.versao})` : 'ffmpeg não encontrado'}</strong>
          <div className="sistema-detalhe">
            {ffmpeg.disponivel
              ? `${cobertura.analisadas} de ${cobertura.total} músicas já medidas.`
              : <>Sem ele não dá para medir. No PowerShell: <code>winget install Gyan.FFmpeg</code>, depois feche o terminal, abra de novo e reinicie o servidor (ou aponte <code>FFMPEG_PATH</code> no <b>.env</b>).</>}
          </div>
        </div>
      </div>

      {d.ativa && (
        <>
          <div className="volume-parelho-alvo">
            <label className="marcar">
              <input type="radio" name="alvo" checked={!manual} onChange={() => { setAlvo(''); agir('/admin/volume-parelho', 'PUT', { alvo: null }); }} />
              <span>
                <strong>Automático</strong>
                <small>{d.alvo_efetivo !== null && !manual ? `usa o volume típico do seu acervo (${lufs(d.alvo_efetivo)}): o volume geral quase não muda` : 'precisa de músicas medidas'}</small>
              </span>
            </label>
            <label className="marcar">
              <input type="radio" name="alvo" checked={manual} onChange={() => { setAlvo('-14'); agir('/admin/volume-parelho', 'PUT', { alvo: -14 }); }} />
              <span>
                <strong>Escolher o nível</strong>
                <small>de −24 (mais baixo) a −6 (mais alto). Streaming costuma usar −14.</small>
              </span>
            </label>
            {manual && (
              <label className="volume-linha">
                <input type="range" min="-24" max="-6" step="1" value={alvo === '' ? d.alvo : Number(alvo)}
                  onChange={(e) => setAlvo(e.target.value)}
                  onMouseUp={() => agir('/admin/volume-parelho', 'PUT', { alvo: Number(alvo) })}
                  onTouchEnd={() => agir('/admin/volume-parelho', 'PUT', { alvo: Number(alvo) })}
                  onKeyUp={() => agir('/admin/volume-parelho', 'PUT', { alvo: Number(alvo) })} />
                <b className="mono">{alvo === '' ? d.alvo : alvo} LUFS</b>
              </label>
            )}
          </div>

          {analise.rodando && (
            <div className="volume-parelho-progresso">
              <div className="progresso" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="progresso-barra" style={{ width: `${pct}%` }} /></div>
              <small>Medindo o acervo: {analise.feitas} de {analise.total}{analise.falhas > 0 ? ` · ${analise.falhas} com problema` : ''}. Pode usar o sistema normalmente.</small>
            </div>
          )}
          {analise.ultima_falha && !analise.rodando && <p className="aviso aviso-erro">Última falha ao medir: {analise.ultima_falha}</p>}

          <div className="admin-acoes">
            {!analise.rodando
              ? <button className="btn btn-ciano btn-pequeno" disabled={!ffmpeg.disponivel || cobertura.analisadas === cobertura.total} onClick={() => agir('/admin/volume-parelho/analisar', 'POST')}>
                {cobertura.analisadas === cobertura.total ? '✔ Acervo todo medido' : '📏 Medir o acervo agora'}
              </button>
              : <button className="btn btn-perigo btn-pequeno" onClick={() => agir('/admin/volume-parelho/cancelar', 'POST')}>Cancelar medição</button>}
          </div>
          <small>CDs novos são medidos sozinhos. Se mudar o volume geral do computador depois, ajuste o volume mestre acima.</small>
        </>
      )}
      {mensagem && <p className={`aviso ${mensagem.tipo === 'erro' ? 'aviso-erro' : 'aviso-ok'}`}>{mensagem.texto}</p>}
    </div>
  );
}
