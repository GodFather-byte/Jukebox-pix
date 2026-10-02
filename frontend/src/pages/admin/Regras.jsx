import { useCallback, useEffect, useState } from 'react';

const LIMITE_AVISO = 140;

function paraFormulario(r) {
  return {
    max_pedidos_por_pessoa: String(r.max_pedidos_por_pessoa),
    bloquear_repeticao_min: String(r.bloquear_repeticao_min),
    prioridade_ativa: r.prioridade.ativa,
    prioridade_extra: String(r.prioridade.extra),
    prioridade_limite: String(r.prioridade.limite),
    vendas_agenda_ativa: r.vendas.agenda.ativa,
    vendas_abre: r.vendas.agenda.abre,
    vendas_fecha: r.vendas.agenda.fecha,
    bonus_ativo: r.bonus.ativo,
    bonus_faixas: r.bonus.faixas.map((f) => ({ valor: String(f.valor), bonus: String(f.bonus) })),
    aviso: r.aviso,
  };
}

const estadoDasVendas = (r) => {
  if (r.vendas_abertas) return '🟢 Vendas de créditos abertas agora';
  return r.vendas.motivo_fechada === 'horario' ? '🔴 Vendas encerradas agora (fora do horário)' : '🔴 Vendas de créditos encerradas (chave desligada)';
};

export default function Regras({ chamar }) {
  const [regras, setRegras] = useState(null);
  const [form, setForm] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const dados = await chamar('/admin/regras');
    setRegras(dados);
    setForm(paraFormulario(dados));
  }, [chamar]);

  useEffect(() => { carregar().catch((e) => setMensagem({ tipo: 'erro', texto: e.message })); }, [carregar]);

  // A chave manual vale na hora: é o botão que você aperta quando a casa vai fechar.
  async function alternarVendas(aberta) {
    try {
      setRegras(await chamar('/admin/regras', { metodo: 'PUT', corpo: { vendas_abertas: aberta } }));
    } catch (e) { setMensagem({ tipo: 'erro', texto: e.message }); }
  }

  async function salvar(e) {
    e.preventDefault();
    setMensagem(null);
    setSalvando(true);
    try {
      const salvo = await chamar('/admin/regras', {
        metodo: 'PUT',
        corpo: {
          max_pedidos_por_pessoa: Number(form.max_pedidos_por_pessoa),
          bloquear_repeticao_min: Number(form.bloquear_repeticao_min),
          prioridade: { ativa: form.prioridade_ativa, extra: Number(form.prioridade_extra), limite: Number(form.prioridade_limite) },
          vendas_agenda: { ativa: form.vendas_agenda_ativa, abre: form.vendas_abre, fecha: form.vendas_fecha },
          bonus: { ativo: form.bonus_ativo, faixas: form.bonus_faixas.map((f) => ({ valor: Number(f.valor), bonus: Number(f.bonus) })) },
          aviso: form.aviso,
        },
      });
      setRegras(salvo);
      setForm(paraFormulario(salvo));
      setMensagem({ tipo: 'ok', texto: '✔ Regras salvas. Os celulares já foram atualizados.' });
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setSalvando(false);
    }
  }

  if (!form || !regras) return mensagem ? <p className="aviso aviso-erro">{mensagem.texto}</p> : <div className="estado"><span className="carregando" /></div>;

  const numero = (campo) => (
    <input className="campo mono" inputMode="numeric" value={form[campo]}
      onChange={(e) => setForm({ ...form, [campo]: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
  );
  const mudarFaixa = (i, campo, valor) => setForm({
    ...form,
    bonus_faixas: form.bonus_faixas.map((f, j) => (j === i ? { ...f, [campo]: valor.replace(/\D/g, '').slice(0, 3) } : f)),
  });

  return (
    <div className="admin-form regras">
      <h2>⚙ Regras da casa</h2>

      <div className="card">
        <label className="interruptor">
          <input type="checkbox" checked={regras.vendas.manual} onChange={(e) => alternarVendas(e.target.checked)} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>{estadoDasVendas(regras)}</strong>
            <small>Esta chave desliga as vendas na hora (quem já tem créditos continua pedindo músicas). Para abrir e fechar sozinho, use o horário abaixo.</small>
          </span>
        </label>
      </div>

      <form className="admin-form" onSubmit={salvar}>
        <h2>🕒 Horário das vendas</h2>
        <label className="interruptor">
          <input type="checkbox" checked={form.vendas_agenda_ativa} onChange={(e) => setForm({ ...form, vendas_agenda_ativa: e.target.checked })} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>Abrir e fechar as vendas sozinho</strong>
            <small>Fora do horário ninguém gera Pix novo, e os celulares atualizam na virada. Pode passar da meia-noite (ex.: 20:00 às 05:00).</small>
          </span>
        </label>
        <div className="admin-form-linha">
          <label>Abre às<input className="campo mono" type="time" value={form.vendas_abre} onChange={(e) => setForm({ ...form, vendas_abre: e.target.value })} /></label>
          <label>Fecha às<input className="campo mono" type="time" value={form.vendas_fecha} onChange={(e) => setForm({ ...form, vendas_fecha: e.target.value })} /></label>
        </div>

        <h2>📣 Mural</h2>
        <label>Aviso (aparece no app e no monitor; deixe vazio para ocultar)
          <input className="campo" maxLength={LIMITE_AVISO} placeholder="Ex.: Happy hour até 23h!" value={form.aviso}
            onChange={(e) => setForm({ ...form, aviso: e.target.value })} />
          <small>{form.aviso.length}/{LIMITE_AVISO}</small>
        </label>

        <h2>🎁 Bônus de recarga</h2>
        <label className="interruptor">
          <input type="checkbox" checked={form.bonus_ativo} onChange={(e) => setForm({ ...form, bonus_ativo: e.target.checked })} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>Dar créditos de bônus em recargas maiores</strong>
            <small>Vale a maior faixa alcançada (não acumula) e aparece para o cliente antes de pagar. <b>O bônus é custo seu</b>: entra como cortesia, então não aumenta a parte da boate nem entra no faturamento dividido.</small>
          </span>
        </label>
        {form.bonus_faixas.map((faixa, i) => (
          <div key={i} className="faixa-bonus">
            <label>Recarga de R$<input className="campo mono" inputMode="numeric" value={faixa.valor} onChange={(e) => mudarFaixa(i, 'valor', e.target.value)} /></label>
            <label>ganha + créditos<input className="campo mono" inputMode="numeric" value={faixa.bonus} onChange={(e) => mudarFaixa(i, 'bonus', e.target.value)} /></label>
            <button type="button" className="btn btn-perigo btn-pequeno" onClick={() => setForm({ ...form, bonus_faixas: form.bonus_faixas.filter((_, j) => j !== i) })}>Remover</button>
          </div>
        ))}
        <button type="button" className="btn btn-fantasma btn-pequeno" disabled={form.bonus_faixas.length >= 6}
          onClick={() => setForm({ ...form, bonus_faixas: [...form.bonus_faixas, { valor: '20', bonus: '2' }] })}>+ Adicionar faixa</button>

        <h2>Proteção contra abuso</h2>
        <label>Máximo de músicas de uma pessoa na fila ao mesmo tempo (0 = sem limite)
          {numero('max_pedidos_por_pessoa')}
        </label>
        <label>Não aceitar música que está na fila ou tocou há X minutos (0 = desligado)
          {numero('bloquear_repeticao_min')}
        </label>

        <h2>⚡ Furar a fila (tocar a seguir)</h2>
        <label className="interruptor">
          <input type="checkbox" checked={form.prioridade_ativa} onChange={(e) => setForm({ ...form, prioridade_ativa: e.target.checked })} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>Permitir pagar a mais para tocar a seguir</strong>
            <small>Entra à frente dos pedidos normais (os prioritários seguem a ordem entre si). O valor extra conta no faturamento.</small>
          </span>
        </label>
        <div className="admin-form-linha">
          <label>Créditos extras cobrados
            {numero('prioridade_extra')}
          </label>
          <label>Máx. prioritários esperando
            {numero('prioridade_limite')}
          </label>
        </div>

        {mensagem && <p className={`aviso ${mensagem.tipo === 'erro' ? 'aviso-erro' : 'aviso-ok'}`}>{mensagem.texto}</p>}
        <button className="btn btn-grande" disabled={salvando}>{salvando ? 'SALVANDO…' : 'SALVAR REGRAS'}</button>
      </form>
    </div>
  );
}
