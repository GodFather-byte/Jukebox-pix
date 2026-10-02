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
    bonus_ativo: r.bonus.habilitado, // a chave do dono (o `ativo` do servidor já considera o horário)
    bonus_faixas: r.bonus.faixas.map((f) => ({ valor: String(f.valor), bonus: String(f.bonus) })),
    bonus_agenda: r.bonus.agenda.map((j) => ({ inicio: j.inicio, fim: j.fim })),
    preco_lancamento: String(r.precos.lancamento),
    aviso: r.aviso,
  };
}

const estadoDoBonus = (r) => {
  if (!r.bonus.habilitado) return '⚪ Bônus desligado';
  if (r.bonus.ativo) return '🟢 Bônus valendo agora';
  return '🟡 Bônus ligado, mas fora do horário agora';
};

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
          bonus: {
            ativo: form.bonus_ativo,
            faixas: form.bonus_faixas.map((f) => ({ valor: Number(f.valor), bonus: Number(f.bonus) })),
            agenda: form.bonus_agenda,
          },
          precos: { lancamento: Number(form.preco_lancamento) },
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
  const mudarJanela = (i, campo, valor) => setForm({
    ...form,
    bonus_agenda: form.bonus_agenda.map((j, k) => (k === i ? { ...j, [campo]: valor } : j)),
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

        <h2>💰 Preço dos lançamentos</h2>
        <label>Músicas de CDs em LANÇAMENTOS custam pelo menos (créditos; 0 = cada música usa o próprio preço)
          {numero('preco_lancamento')}
          <small>Quando o CD sai de LANÇAMENTOS (após alguns dias) volta sozinho ao preço normal. O preço de cada CD ou música se define em Biblioteca, Novo CD, Importar e Console.</small>
        </label>

        <h2>🎁 Bônus de recarga</h2>
        <p className="aviso">{estadoDoBonus(regras)}</p>
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

        <strong>🕒 Só nestes horários (opcional)</strong>
        <small>Sem nenhum horário, o bônus vale o dia todo. Com horários (ex.: 20:00 às 22:00 para encher a casa cedo), só vale dentro deles; fora, os clientes veem “bônus das 20:00 às 22:00” como convite. O bônus vale o que estava na tela quando o Pix foi gerado.</small>
        {form.bonus_agenda.map((janela, i) => (
          <div key={i} className="agenda-janela">
            <div className="agenda-horas">
              <label>Das<input className="campo mono" type="time" value={janela.inicio} onChange={(e) => mudarJanela(i, 'inicio', e.target.value)} /></label>
              <label>Às<input className="campo mono" type="time" value={janela.fim} onChange={(e) => mudarJanela(i, 'fim', e.target.value)} /></label>
              <button type="button" className="btn btn-perigo btn-pequeno" onClick={() => setForm({ ...form, bonus_agenda: form.bonus_agenda.filter((_, k) => k !== i) })}>Remover</button>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-fantasma btn-pequeno" disabled={form.bonus_agenda.length >= 6}
          onClick={() => setForm({ ...form, bonus_agenda: [...form.bonus_agenda, { inicio: '20:00', fim: '22:00' }] })}>+ Adicionar horário</button>

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
