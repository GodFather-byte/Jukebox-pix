import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';

const dataBr = (dia) => dia.split('-').reverse().join('/');

// A cortesia cai no saldo do jukebox, o mesmo que aparece na tela dele.
const sessaoDoJukebox = () => api('/quiosque').then((q) => q.sessao.id);

export default function Cortesia({ chamar }) {
  const [estado, setEstado] = useState(null);
  const [quantidade, setQuantidade] = useState('10');
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState(null);

  const carregar = useCallback(() => chamar('/admin/cortesia').then(setEstado).catch((e) => setMensagem({ tipo: 'erro', texto: e.message })), [chamar]);
  useEffect(() => { carregar(); }, [carregar]);

  async function conceder(e) {
    e.preventDefault();
    setMensagem(null);
    setEnviando(true);
    try {
      // Os créditos vão pra sessão deste navegador, a mesma que o app do cliente usa neste endereço.
      const r = await chamar('/admin/cortesia', {
        metodo: 'POST',
        corpo: { quantidade: Number(quantidade), session_id: await sessaoDoJukebox() },
      });
      setMensagem({ tipo: 'ok', texto: `✔ ${quantidade} créditos de cortesia adicionados no jukebox.` });
      carregar();
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
      carregar();
    } finally {
      setEnviando(false);
    }
  }

  if (!estado) return mensagem ? <p className="aviso aviso-erro">{mensagem.texto}</p> : <div className="estado"><span className="carregando" /></div>;

  const valida = Number.isInteger(Number(quantidade)) && Number(quantidade) >= 1 && Number(quantidade) <= estado.maximo;
  const liberaEm = new Date(estado.libera_em).toLocaleString('pt-BR', { weekday: 'long', hour: '2-digit', minute: '2-digit' });

  return (
    <form className="admin-form" onSubmit={conceder}>
      <h2>🎁 Créditos de cortesia do dono</h2>
      <p className="nota">
        Adiciona créditos <b>sem pagamento</b>, <b>uma vez por dia</b> (renova à meia-noite), até {estado.maximo} créditos.
        Eles caem no saldo <b>da tela do jukebox</b>.
      </p>
      <p className="nota">
        Músicas tocadas com cortesia <b>não entram no faturamento nem na divisão com a boate</b>.
        Como os demais créditos, vencem após alguns minutos sem uso.
      </p>

      {estado.usado_hoje ? (
        <p className="aviso">
          Hoje você já adicionou <b>{estado.hoje.quantidade}</b> créditos. Libera de novo em <b>{liberaEm}</b> (meia-noite).
        </p>
      ) : (
        <label>Quantidade (1 a {estado.maximo})
          <input className="campo mono" inputMode="numeric" value={quantidade}
            onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </label>
      )}

      {mensagem && <p className={`aviso ${mensagem.tipo === 'erro' ? 'aviso-erro' : 'aviso-ok'}`}>{mensagem.texto}</p>}

      <button className="btn btn-grande" disabled={estado.usado_hoje || !valida || enviando}>
        {estado.usado_hoje ? 'JÁ USADO HOJE' : enviando ? 'ADICIONANDO…' : `ADICIONAR ${valida ? quantidade : ''} CRÉDITOS GRÁTIS`}
      </button>

      {estado.historico.length > 0 && (
        <>
          <h2>Últimos usos</h2>
          <ul className="historico">
            {estado.historico.map((h) => (
              <li key={h.dia}>
                <span className="mono">{dataBr(h.dia)}</span>
                <b className="evento evento-criado">+{h.quantidade}</b>
                <span>às {new Date(h.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </form>
  );
}
