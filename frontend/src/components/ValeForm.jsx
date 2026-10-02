import { useState } from 'react';
import { api } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';
import { useToast } from '../context/Toast.jsx';

// "Tenho um vale-música": o cliente digita o código do cartão e ganha créditos de cortesia.
export default function ValeForm() {
  const { sessao, atualizarSessao } = useSessao();
  const mostrarToast = useToast();
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function resgatar(e) {
    e.preventDefault();
    if (!codigo.trim() || enviando) return;
    setEnviando(true);
    try {
      const r = await api('/vales/resgatar', { metodo: 'POST', corpo: { session_id: sessao.id, codigo } });
      atualizarSessao({ saldo: r.saldo });
      mostrarToast(`🎁 Vale resgatado: +${r.creditos} ${r.creditos === 1 ? 'crédito' : 'créditos'} de cortesia!`, { tipo: 'ok' });
      setCodigo('');
    } catch (erro) {
      mostrarToast(erro.message, { tipo: 'erro' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <details className="vale-box">
      <summary>🎟 Tenho um vale-música</summary>
      <form className="vale-form" onSubmit={resgatar}>
        <input
          className="campo mono"
          placeholder="Código do vale (ex.: AB3D-EF7H)"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck="false"
          maxLength={12}
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        />
        <button className="btn" disabled={!codigo.trim() || enviando}>{enviando ? 'CONFERINDO…' : 'RESGATAR'}</button>
      </form>
    </details>
  );
}
