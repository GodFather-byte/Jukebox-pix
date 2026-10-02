import { useCallback, useEffect, useState } from 'react';
import GraficoColunas from './GraficoColunas.jsx';
import { formatarReais } from '../../api.js';

const dia = (data) => data.toLocaleDateString('sv-SE');
const dataBr = (iso) => iso.split('-').reverse().join('/');

function atalhos() {
  const hoje = new Date();
  const seteDias = new Date(hoje); seteDias.setDate(hoje.getDate() - 6);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const mesPassadoInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const mesPassadoFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
  return [
    ['Hoje', dia(hoje), dia(hoje)],
    ['Últimos 7 dias', dia(seteDias), dia(hoje)],
    ['Este mês', dia(inicioMes), dia(hoje)],
    ['Mês passado', dia(mesPassadoInicio), dia(mesPassadoFim)],
  ];
}

export default function Relatorio({ chamar, baixarArquivo }) {
  const padrao = atalhos()[2];
  const [de, setDe] = useState(padrao[1]);
  const [ate, setAte] = useState(padrao[2]);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const gerar = useCallback(async (inicio, fim) => {
    setErro('');
    setCarregando(true);
    try {
      setDados(await chamar(`/admin/relatorio?de=${inicio}&ate=${fim}`));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [chamar]);

  useEffect(() => { gerar(padrao[1], padrao[2]); }, [gerar]); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicar = (inicio, fim) => { setDe(inicio); setAte(fim); gerar(inicio, fim); };
  const baixarCsv = () => baixarArquivo(`/admin/relatorio.csv?de=${dados.de}&ate=${dados.ate}`, `relatorio-${dados.de}_${dados.ate}.csv`).catch((e) => setErro(e.message));

  const t = dados?.totais;

  return (
    <div className="relatorio">
      <h2 className="so-tela">📈 Relatório e fechamento</h2>

      <div className="relatorio-filtros so-tela">
        <div className="chips">
          {atalhos().map(([rotulo, inicio, fim]) => (
            <button key={rotulo} className={`chip ${de === inicio && ate === fim ? 'ativo' : ''}`} onClick={() => aplicar(inicio, fim)}>{rotulo}</button>
          ))}
        </div>
        <div className="relatorio-datas">
          <label>De<input className="campo" type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} /></label>
          <label>Até<input className="campo" type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} /></label>
          <button className="btn" onClick={() => gerar(de, ate)} disabled={carregando || !de || !ate}>{carregando ? 'GERANDO…' : 'GERAR'}</button>
        </div>
      </div>

      {erro && <p className="aviso aviso-erro importar-espaco">{erro}</p>}

      {dados && (
        <>
          <h2 className="so-impressao">Fechamento de {dataBr(dados.de)} a {dataBr(dados.ate)}</h2>

          <div className="tiles">
            <div className="tile">
              <span className="rotulo">Faturado (músicas pagas tocadas)</span>
              <div className="tile-valor">{formatarReais(t.bruto)}</div>
              <small>{t.tocadas} músicas tocadas{t.cortesia > 0 ? `, ${t.cortesia} de cortesia` : ''}</small>
            </div>
            <div className="tile">
              <span className="rotulo">Sua parte ({dados.divisao_usuario}%)</span>
              <div className="tile-valor">{formatarReais(t.usuario)}</div>
              <small>a receber neste período</small>
            </div>
            <div className="tile">
              <span className="rotulo">Parte da boate ({100 - dados.divisao_usuario}%)</span>
              <div className="tile-valor">{formatarReais(t.boate)}</div>
              <small>a repassar neste período</small>
            </div>
          </div>

          <dl className="relatorio-extras">
            <div><dt>Pix recebido no período</dt><dd className="mono">{formatarReais(t.arrecadado)}</dd></div>
            <div><dt>Pagamentos</dt><dd className="mono">{t.pagamentos}</dd></div>
            <div><dt>Ticket médio</dt><dd className="mono">{formatarReais(t.ticket_medio)}</dd></div>
            <div><dt>Horário de pico</dt><dd className="mono">{dados.horario_de_pico == null ? '—' : `${dados.horario_de_pico}h`}</dd></div>
          </dl>
          <p className="nota">A divisão considera só as músicas pagas efetivamente tocadas. Cortesia e playlist automática ficam de fora, e “Pix recebido” inclui créditos ainda não usados ou vencidos.</p>

          <div className="relatorio-acoes so-tela">
            <button className="btn btn-ciano" onClick={baixarCsv}>⬇ Baixar CSV (Excel)</button>
            <button className="btn btn-fantasma" onClick={() => window.print()}>🖨 Imprimir fechamento</button>
          </div>

          <GraficoColunas
            titulo="Músicas tocadas por hora do dia (somando o período)"
            nomeValor="Músicas"
            nomeEixo="Hora"
            formatarRotulo={(h) => `${h}h`}
            serie={dados.por_hora.map((h) => ({ dia: String(h.hora), valor: h.tocadas, texto: `${h.tocadas} músicas às ${h.hora}h` }))}
          />

          <h2>Dia a dia</h2>
          <div className="tabela-rolavel">
            <table className="tabela-relatorio">
              <thead>
                <tr><th>Dia</th><th>Tocadas</th><th>Faturado</th><th>Sua parte</th><th>Boate</th><th>Pix recebido</th></tr>
              </thead>
              <tbody>
                {dados.por_dia.map((d) => (
                  <tr key={d.dia} className={d.tocadas === 0 && d.arrecadado === 0 ? 'zerado' : ''}>
                    <td>{dataBr(d.dia)}</td>
                    <td className="mono">{d.tocadas}</td>
                    <td className="mono">{formatarReais(d.bruto)}</td>
                    <td className="mono">{formatarReais(d.usuario)}</td>
                    <td className="mono">{formatarReais(d.boate)}</td>
                    <td className="mono">{formatarReais(d.arrecadado)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th>Total</th><th className="mono">{t.tocadas}</th><th className="mono">{formatarReais(t.bruto)}</th><th className="mono">{formatarReais(t.usuario)}</th><th className="mono">{formatarReais(t.boate)}</th><th className="mono">{formatarReais(t.arrecadado)}</th></tr>
              </tfoot>
            </table>
          </div>

          <div className="destaques relatorio-tops">
            <div className="card">
              <span className="rotulo">Músicas mais tocadas</span>
              <ol className="ranking">
                {dados.top_musicas.map((m) => <li key={`${m.titulo}-${m.artista}`}><span>{m.titulo} <small>{m.artista}</small></span><b className="mono">{m.tocadas}x</b></li>)}
                {dados.top_musicas.length === 0 && <li className="vazio">Sem dados no período.</li>}
              </ol>
            </div>
            <div className="card">
              <span className="rotulo">Artistas mais tocados</span>
              <ol className="ranking">
                {dados.top_artistas.map((a) => <li key={a.nome}><span>{a.nome}</span><b className="mono">{a.tocadas}x</b></li>)}
                {dados.top_artistas.length === 0 && <li className="vazio">Sem dados no período.</li>}
              </ol>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
