import { useCallback, useEffect, useState } from 'react';
import { formatarReais } from '../../api.js';

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const ROTULOS = { exibido: '✅ Foi ao ar', recusado: '🚫 Recusado (reembolsado)', expirado: '⌛ Expirou (reembolsado)' };

function Configuracao({ chamar, config, aoSalvar }) {
  const [form, setForm] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setForm({ ativo: config.ativo, preco: String(config.preco), segundos: String(config.segundos), moderacao: config.moderacao, bloqueadas: config.bloqueadas });
  }, [config]);

  if (!form) return null;
  const numero = (campo) => (
    <input className="campo mono" inputMode="numeric" value={form[campo]}
      onChange={(e) => setForm({ ...form, [campo]: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
  );

  async function salvar(e) {
    e.preventDefault();
    setMensagem(null);
    setSalvando(true);
    try {
      await chamar('/admin/recados/config', {
        metodo: 'PUT',
        corpo: { ativo: form.ativo, preco: Number(form.preco), segundos: Number(form.segundos), moderacao: form.moderacao, bloqueadas: form.bloqueadas },
      });
      setMensagem({ tipo: 'ok', texto: '✔ Ajustes salvos. A tela do jukebox já foi atualizada.' });
      aoSalvar();
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="admin-form recados-config" onSubmit={salvar}>
      <label className="interruptor">
        <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
        <span className="interruptor-trilho" aria-hidden="true" />
        <span>
          <strong>Aceitar recados pagos no telão</strong>
          <small>O cliente paga com créditos e a mensagem aparece no monitor (/tela). O dinheiro só entra no faturamento quando o recado vai ao ar; se for recusado ou não passar, volta para o cliente.</small>
        </span>
      </label>
      <div className="admin-form-linha">
        <label>Preço (créditos)
          {numero('preco')}
        </label>
        <label>Tempo no telão (segundos)
          {numero('segundos')}
        </label>
      </div>
      <label className="interruptor">
        <input type="checkbox" checked={form.moderacao} onChange={(e) => setForm({ ...form, moderacao: e.target.checked })} />
        <span className="interruptor-trilho" aria-hidden="true" />
        <span>
          <strong>Eu aprovo cada recado antes de ir ao ar</strong>
          <small>Recomendado. Desligado, o recado vai ao ar na hora (você ainda pode tirar do ar e reembolsar).</small>
        </span>
      </label>
      <label>Palavras proibidas (separadas por vírgula)
        <textarea className="campo" rows={2} value={form.bloqueadas} placeholder="Ex.: palavra1, palavra2"
          onChange={(e) => setForm({ ...form, bloqueadas: e.target.value })} />
        <small>O recado com alguma dessas palavras é recusado na hora, sem cobrar (vale também com acento, maiúscula e letras trocadas por números).</small>
      </label>
      {mensagem && <p className={`aviso ${mensagem.tipo === 'erro' ? 'aviso-erro' : 'aviso-ok'}`}>{mensagem.texto}</p>}
      <button className="btn" disabled={salvando}>{salvando ? 'SALVANDO…' : 'SALVAR AJUSTES'}</button>
    </form>
  );
}

export default function Recados({ chamar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState('');

  const carregar = useCallback(() => chamar('/admin/recados').then((d) => { setDados(d); setErro(''); }).catch((e) => setErro(e.message)), [chamar]);

  useEffect(() => {
    carregar();
    const id = setInterval(carregar, 4000);
    const eventos = new EventSource('/api/eventos');
    eventos.addEventListener('recados', carregar);
    return () => { clearInterval(id); eventos.close(); };
  }, [carregar]);

  async function decidir(recado, acao) {
    if (acao === 'recusar' && recado.status === 'exibindo' && !window.confirm('Tirar este recado do telão agora e devolver os créditos ao cliente?')) return;
    setOcupado(recado.id);
    try {
      await chamar(`/admin/recados/${recado.id}/${acao}`, { metodo: 'POST' });
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado('');
    }
  }

  if (!dados) return erro ? <p className="aviso aviso-erro">{erro}</p> : <div className="estado"><span className="carregando" /></div>;
  const { config } = dados;

  return (
    <>
      <h2>💬 Recados no telão</h2>
      {erro && <p className="aviso aviso-erro">{erro}</p>}

      <div className={`sistema-item ${dados.telao_online ? 'sistema-ok' : 'sistema-erro'}`}>
        <span className="sistema-icone" aria-hidden="true">{dados.telao_online ? '🟢' : '🔴'}</span>
        <div>
          <strong>{dados.telao_online ? `Telão ligado (${dados.telas} ${dados.telas === 1 ? 'tela' : 'telas'})` : 'Nenhum telão ligado'}</strong>
          <div className="sistema-detalhe">
            {dados.telao_online
              ? 'Os recados aprovados aparecem no monitor, um de cada vez.'
              : <>Abra <b>/tela</b> no monitor da casa. Sem telão ligado os clientes não conseguem mandar recado e os aprovados esperam.</>}
          </div>
        </div>
      </div>

      <div className="tiles recados-hoje">
        <div className="tile">
          <span className="rotulo">Recados hoje</span>
          <div className="tile-valor">{dados.hoje.exibidos}</div>
          <small>{formatarReais(dados.hoje.bruto)} faturados{dados.hoje.cortesia > 0 ? ` · ${dados.hoje.cortesia} créd. de cortesia` : ''}</small>
        </div>
      </div>

      {dados.no_ar && (
        <div className="card recado-no-ar">
          <span className="selo selo-rosa">📺 NO AR AGORA</span>
          <p className="recado-no-ar-texto">{dados.no_ar.texto}</p>
          <small>{dados.no_ar.quem}</small>
          <div className="admin-acoes">
            <button className="btn btn-perigo btn-pequeno" disabled={ocupado === dados.no_ar.id} onClick={() => decidir(dados.no_ar, 'recusar')}>Tirar do ar e reembolsar</button>
          </div>
        </div>
      )}

      <h2>Esperando sua aprovação ({dados.pendentes.length})</h2>
      {dados.pendentes.length === 0 && <p className="vazio">Nenhum recado esperando.</p>}
      <ul className="admin-lista">
        {dados.pendentes.map((r) => (
          <li key={r.id} className="admin-linha">
            <div className="admin-linha-info">
              <strong className="recado-admin-texto">{r.texto}</strong>
              <span>{r.quem} · {hora(r.criado_em)} · {r.creditos} {r.creditos === 1 ? 'crédito' : 'créditos'}</span>
            </div>
            <div className="admin-acoes">
              <button className="btn btn-pequeno" disabled={ocupado === r.id} onClick={() => decidir(r, 'aprovar')}>✔ Aprovar</button>
              <button className="btn btn-perigo btn-pequeno" disabled={ocupado === r.id} onClick={() => decidir(r, 'recusar')}>✕ Recusar</button>
            </div>
          </li>
        ))}
      </ul>

      {dados.aprovados.length > 0 && (
        <>
          <h2>Aprovados, esperando a vez no telão ({dados.aprovados.length})</h2>
          <ul className="admin-lista">
            {dados.aprovados.map((r) => (
              <li key={r.id} className="admin-linha">
                <div className="admin-linha-info">
                  <strong className="recado-admin-texto">{r.texto}</strong>
                  <span>{r.quem} · aprovado {hora(r.decidido_em ?? r.criado_em)}</span>
                </div>
                <div className="admin-acoes">
                  <button className="btn btn-perigo btn-pequeno" disabled={ocupado === r.id} onClick={() => decidir(r, 'recusar')}>Cancelar e reembolsar</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {dados.recentes.length > 0 && (
        <>
          <h2>Últimos recados</h2>
          <ul className="historico">
            {dados.recentes.map((r) => (
              <li key={r.id}>
                <span className="mono">{hora(r.exibido_em ?? r.decidido_em ?? r.criado_em)}</span>
                <b className={`evento ${r.status === 'exibido' ? 'evento-criado' : 'evento-removido'}`}>{ROTULOS[r.status] ?? r.status}</b>
                <span>“{r.texto}” — {r.quem}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>⚙ Ajustes</h2>
      <Configuracao chamar={chamar} config={config} aoSalvar={carregar} />
    </>
  );
}
