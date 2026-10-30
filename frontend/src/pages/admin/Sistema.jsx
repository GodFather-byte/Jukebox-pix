import { useCallback, useEffect, useState } from 'react';

function bytes(n) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

function duracao(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

const ICONES = { ok: '🟢', atencao: '🟡', erro: '🔴', neutro: '⚪' };

function Item({ estado, titulo, children }) {
  return (
    <div className={`sistema-item sistema-${estado}`}>
      <span className="sistema-icone" aria-hidden="true">{ICONES[estado]}</span>
      <div><strong>{titulo}</strong><div className="sistema-detalhe">{children}</div></div>
    </div>
  );
}

export default function Sistema({ chamar, baixarArquivo }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setD(await chamar('/admin/sistema'));
      setErro('');
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [chamar]);

  useEffect(() => { carregar(); }, [carregar]);

  async function ocultarSemArquivo() {
    try {
      await chamar('/admin/acervo/ocultar-sem-arquivo', { metodo: 'POST' });
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  async function fazerBackup() {
    setSalvando(true);
    try {
      await chamar('/admin/backups', { metodo: 'POST' });
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!d) return erro ? <p className="aviso aviso-erro">{erro}</p> : <div className="estado"><span className="carregando" /></div>;

  const livrePct = d.disco ? (d.disco.livre / d.disco.total) * 100 : null;
  const faltando = d.acervo.sem_arquivo;
  const ultimoBackup = d.backups[0];
  const horasDesdeBackup = ultimoBackup ? (Date.now() - Date.parse(ultimoBackup.criado_em)) / 3_600_000 : null;

  return (
    <>
      <div className="admin-topo-interno">
        <h2>🖥 Sistema</h2>
        <button className="btn btn-fantasma btn-pequeno" onClick={carregar} disabled={carregando}>{carregando ? 'Atualizando…' : '↻ Atualizar'}</button>
      </div>
      {erro && <p className="aviso aviso-erro">{erro}</p>}

      <div className="sistema">
        <Item estado={d.player.simulado ? 'erro' : 'ok'} titulo={`Player: ${d.player.backend ?? 'parado'}${d.player.pausado ? ' (fila pausada)' : ''}`}>
          {d.player.simulado
            ? <>Simulado: nenhum som sai do computador e cada música “dura” só alguns segundos. Instale o VLC (no PowerShell: <code>winget install VideoLAN.VLC</code>) ou o mpv e <b>reinicie o servidor</b>; ao subir, o terminal deve mostrar “Player: vlc” (ou mpv).</>
            : 'Tocando com áudio real.'}
        </Item>

        <Item estado={d.pagamento.modo_teste ? 'atencao' : d.pagamento.internet ? 'ok' : 'erro'} titulo={`Pagamento: ${d.pagamento.provedor}`}>
          {d.pagamento.modo_teste
            ? 'Modo de teste: o Pix é simulado e ninguém paga de verdade.'
            : d.pagamento.internet
              ? 'Conectado ao provedor de pagamento.'
              : 'Sem conexão com o provedor. A música segue tocando, mas ninguém consegue gerar Pix novo.'}
          {d.pagamento.pendentes > 0 && <> · {d.pagamento.pendentes} Pix aguardando pagamento</>}
        </Item>

        <Item estado={livrePct == null ? 'neutro' : livrePct < 5 ? 'erro' : livrePct < 15 ? 'atencao' : 'ok'} titulo="Espaço em disco">
          {d.disco ? <>{bytes(d.disco.livre)} livres de {bytes(d.disco.total)} ({livrePct.toFixed(0)}%) · músicas: {bytes(d.tamanhos.musicas)} · banco: {bytes(d.tamanhos.banco)}</> : 'Não foi possível medir.'}
        </Item>

        <Item estado={faltando.total === 0 ? 'ok' : 'erro'} titulo={`Acervo: ${d.acervo.cds} CDs, ${d.acervo.musicas} músicas`}>
          {faltando.total === 0
            ? <>Todos os arquivos de áudio estão no lugar{faltando.ocultas > 0 && <> ({faltando.ocultas} sem arquivo, já ocultas do app)</>}.</>
            : <>{faltando.total} {faltando.total === 1 ? 'música está' : 'músicas estão'} sem arquivo (o cliente pagaria e a faixa falharia, com reembolso). Reenvie os arquivos ou oculte do app:
              <ul className="sistema-lista">
                {faltando.exemplos.map((m) => <li key={m.arquivo}>{m.titulo} <small>{m.artista} · {m.cd}</small></li>)}
              </ul>
              <button className="btn btn-pequeno" onClick={ocultarSemArquivo}>🙈 Ocultar todas do app</button></>}
        </Item>

        <Item estado={horasDesdeBackup == null ? 'erro' : horasDesdeBackup > 30 ? 'atencao' : 'ok'} titulo="Backup do banco">
          {ultimoBackup
            ? <>Último: {new Date(ultimoBackup.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Automático todo dia às 4h.</>
            : 'Nenhum backup ainda.'}
        </Item>

        <Item estado={!d.central?.configurada ? 'neutro' : d.central.ultimo_erro && (!d.central.ultimo_envio || d.central.ultimo_erro.em > d.central.ultimo_envio) ? 'erro' : 'ok'} titulo="Central (app de acompanhamento)">
          {!d.central?.configurada
            ? 'Não ligada. Para o dono e o parceiro acompanharem pelo celular, preencha o endereço da central e o token da máquina na tela de configuração (docs/CENTRAL.md).'
            : d.central.ultimo_erro && (!d.central.ultimo_envio || d.central.ultimo_erro.em > d.central.ultimo_envio)
              ? <>O último relatório não foi enviado ({new Date(d.central.ultimo_erro.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}): {d.central.ultimo_erro.motivo}. Tenta de novo sozinho a cada 6 h e em cada fechamento.</>
              : d.central.ultimo_envio
                ? <>Último relatório enviado: {new Date(d.central.ultimo_envio).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Manda a cada 6 h e em cada fechamento.</>
                : 'Ligada. O primeiro relatório sai 1 minuto depois de a jukebox abrir.'}
        </Item>

        <Item estado={!d.backup_copia ? 'atencao' : !d.backup_copia.acessivel || !d.backup_copia.em_dia ? 'erro' : 'ok'} titulo="Cópia extra do backup">
          {!d.backup_copia
            ? 'Não configurada. Os backups ficam só neste computador: defina BACKUP_COPIA_DIR no .env apontando para uma pasta da nuvem (OneDrive/Google Drive) ou um pendrive.'
            : d.backup_copia.em_dia && d.backup_copia.acessivel
              ? <>Em dia: <code>{d.backup_copia.pasta}</code></>
              : <>A pasta <code>{d.backup_copia.pasta}</code> {d.backup_copia.acessivel ? 'não recebeu o último backup' : 'não está acessível (pendrive solto? nuvem offline?)'}.</>}
        </Item>

        <Item estado="neutro" titulo="Agora">
          {d.atividade.fila} na fila · {d.atividade.sessoes_com_saldo} {d.atividade.sessoes_com_saldo === 1 ? 'pessoa' : 'pessoas'} com crédito · ligado há {duracao(d.ligado_ha_segundos)} · Node {d.versao_node}
        </Item>
      </div>

      <h2>💾 Backups</h2>
      <p className="nota">
        O backup guarda o banco (créditos, pagamentos, histórico, cadastros). Os arquivos de música <b>não</b> entram: copie a pasta <b>musicas</b> à parte.
        Pasta dos backups: <code>{d.pasta_backups}</code>
      </p>
      <button className="btn" onClick={fazerBackup} disabled={salvando}>{salvando ? 'GERANDO…' : '💾 FAZER BACKUP AGORA'}</button>

      <ul className="admin-lista backups">
        {d.backups.map((b) => (
          <li key={b.arquivo} className="admin-linha">
            <div className="admin-linha-info">
              <strong className="mono">{b.arquivo}</strong>
              <span>{bytes(b.bytes)} · {new Date(b.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            <div className="admin-acoes">
              <button className="btn btn-fantasma btn-pequeno" onClick={() => baixarArquivo(`/admin/backups/${b.arquivo}`, b.arquivo).catch((e) => setErro(e.message))}>⬇ Baixar</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="nota">Para restaurar: pare o servidor, copie o arquivo do backup por cima de <b>database\jukebox.db</b> (apague os arquivos jukebox.db-wal e jukebox.db-shm, se existirem) e inicie de novo.</p>
    </>
  );
}
