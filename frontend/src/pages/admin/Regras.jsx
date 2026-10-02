import { useCallback, useEffect, useState } from 'react';

const LIMITE_AVISO = 140;

export default function Regras({ chamar }) {
  const [regras, setRegras] = useState(null);
  const [form, setForm] = useState(null);
  const [mensagem, setMensagem] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const dados = await chamar('/admin/regras');
    setRegras(dados);
    setForm({
      max_pedidos_por_pessoa: String(dados.max_pedidos_por_pessoa),
      bloquear_repeticao_min: String(dados.bloquear_repeticao_min),
      prioridade_ativa: dados.prioridade.ativa,
      prioridade_extra: String(dados.prioridade.extra),
      prioridade_limite: String(dados.prioridade.limite),
      aviso: dados.aviso,
    });
  }, [chamar]);

  useEffect(() => { carregar().catch((e) => setMensagem({ tipo: 'erro', texto: e.message })); }, [carregar]);

  // Abrir/encerrar vendas vale na hora: é o botão que você aperta quando a casa vai fechar.
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
          aviso: form.aviso,
        },
      });
      setRegras(salvo);
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

  return (
    <div className="admin-form regras">
      <h2>⚙ Regras da casa</h2>

      <div className="card">
        <label className="interruptor">
          <input type="checkbox" checked={regras.vendas_abertas} onChange={(e) => alternarVendas(e.target.checked)} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>{regras.vendas_abertas ? '🟢 Vendas de créditos abertas' : '🔴 Vendas de créditos encerradas'}</strong>
            <small>Desligue quando a casa for fechar. Ninguém gera Pix novo, mas quem já tem créditos continua pedindo músicas. Vale na hora.</small>
          </span>
        </label>
      </div>

      <form className="admin-form" onSubmit={salvar}>
        <label>📣 Aviso (aparece no app e no monitor; deixe vazio para ocultar)
          <input className="campo" maxLength={LIMITE_AVISO} placeholder="Ex.: Happy hour até 23h!" value={form.aviso}
            onChange={(e) => setForm({ ...form, aviso: e.target.value })} />
          <small>{form.aviso.length}/{LIMITE_AVISO}</small>
        </label>

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
