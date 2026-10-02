import { useEffect, useState } from 'react';

const chave = (config) => JSON.stringify([config.categorias, config.agenda]);

// Quais categorias a playlist automática pode sortear, no padrão e por horário.
export default function AutomaticaConfig({ chamar, config, aoSalvar }) {
  const [categorias, setCategorias] = useState([]);
  const [padrao, setPadrao] = useState(config.categorias);
  const [agenda, setAgenda] = useState(config.agenda);
  const [mensagem, setMensagem] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { chamar('/admin/cadastros').then((c) => setCategorias(c.categorias)).catch(() => {}); }, [chamar]);
  // Sincroniza com o servidor depois de salvar (ou se outra tela mexeu).
  useEffect(() => { setPadrao(config.categorias); setAgenda(config.agenda); }, [chave(config)]); // eslint-disable-line react-hooks/exhaustive-deps

  const alternar = (lista, id) => (lista.includes(id) ? lista.filter((c) => c !== id) : [...lista, id]);
  const mudarJanela = (indice, campo, valor) => setAgenda((a) => a.map((j, i) => (i === indice ? { ...j, [campo]: valor } : j)));

  async function salvar() {
    setMensagem(null);
    setSalvando(true);
    try {
      await chamar('/admin/automatico', { metodo: 'PUT', corpo: { categorias: padrao, agenda } });
      setMensagem({ tipo: 'ok', texto: '✔ Playlist automática atualizada.' });
      aoSalvar();
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message });
    } finally {
      setSalvando(false);
    }
  }

  const Chips = ({ selecionadas, aoAlternar }) => (
    <div className="chips chips-multi">
      {categorias.map((c) => (
        <button key={c.id} type="button" className={`chip ${selecionadas.includes(c.id) ? 'ativo' : ''}`} onClick={() => aoAlternar(c.id)}>
          {c.icone} {c.nome}
        </button>
      ))}
    </div>
  );

  return (
    <div className="card automatico-config">
      <strong>🎲 O que a playlist automática pode tocar</strong>
      <small>Marque as categorias permitidas (nenhuma marcada = o acervo todo).</small>
      <Chips selecionadas={padrao} aoAlternar={(id) => setPadrao((p) => alternar(p, id))} />

      <strong>🕒 Por horário (opcional)</strong>
      <small>Nas janelas abaixo vale a lista da janela, no lugar da lista acima. Janela que passa da meia-noite (ex.: 22:00 a 04:00) funciona.</small>
      {agenda.map((janela, i) => (
        <div key={i} className="agenda-janela">
          <div className="agenda-horas">
            <label>Das<input className="campo mono" type="time" value={janela.inicio} onChange={(e) => mudarJanela(i, 'inicio', e.target.value)} /></label>
            <label>Às<input className="campo mono" type="time" value={janela.fim} onChange={(e) => mudarJanela(i, 'fim', e.target.value)} /></label>
            <button type="button" className="btn btn-perigo btn-pequeno" onClick={() => setAgenda((a) => a.filter((_, j) => j !== i))}>Remover</button>
          </div>
          <Chips selecionadas={janela.categorias} aoAlternar={(id) => mudarJanela(i, 'categorias', alternar(janela.categorias, id))} />
        </div>
      ))}
      <div className="admin-acoes">
        <button type="button" className="btn btn-fantasma btn-pequeno" disabled={agenda.length >= 10}
          onClick={() => setAgenda((a) => [...a, { inicio: '18:00', fim: '22:00', categorias: [] }])}>+ Adicionar janela</button>
        <button type="button" className="btn btn-pequeno" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
      {mensagem && <p className={`aviso ${mensagem.tipo === 'erro' ? 'aviso-erro' : 'aviso-ok'}`}>{mensagem.texto}</p>}
    </div>
  );
}
