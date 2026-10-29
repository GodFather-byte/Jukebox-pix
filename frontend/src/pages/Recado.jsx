import { useCallback, useEffect, useState } from 'react';
import { abrirCreditos, api } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';
import { useToast } from '../context/Toast.jsx';

const SITUACOES = {
  pendente: ['⏳', 'Aguardando a casa aprovar'],
  aprovado: ['🕒', 'Aprovado, esperando a vez no telão'],
  exibindo: ['📺', 'No telão agora!'],
  exibido: ['✅', 'Já passou no telão'],
  recusado: ['🚫', 'Não foi ao ar (créditos devolvidos)'],
  expirado: ['⌛', 'Não deu tempo (créditos devolvidos)'],
};
const EM_ANDAMENTO = new Set(['pendente', 'aprovado', 'exibindo']);

// Recado pago para o telão da casa. O dono pode aprovar antes; se não for ao ar, os créditos voltam.
export default function Recado() {
  const { sessao, config, saldo, atualizarSessao } = useSessao();
  const mostrarToast = useToast();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [meus, setMeus] = useState([]);

  const { ativo, preco, max_caracteres: maximo, telao_online: telaoOnline } = config.recados;
  const sessionId = sessao?.id;

  const carregar = useCallback(() => {
    if (!sessionId) return;
    api(`/recados/sessao/${sessionId}`).then((d) => setMeus(d.recados)).catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    carregar();
    window.addEventListener('jukebox:recado', carregar);
    const id = setInterval(carregar, 8000); // rede de segurança caso o SSE caia
    return () => { window.removeEventListener('jukebox:recado', carregar); clearInterval(id); };
  }, [carregar]);

  async function enviar(e) {
    e.preventDefault();
    if (enviando || texto.trim().length < 3) return;
    setEnviando(true);
    try {
      const r = await api('/recados', { metodo: 'POST', corpo: { session_id: sessionId, texto } });
      atualizarSessao({ saldo: r.saldo });
      setTexto('');
      mostrarToast(r.status === 'pendente' ? '💬 Recado enviado! Agora é só esperar a casa aprovar.' : '💬 Recado enviado! Você será avisado quando for ao ar.', { tipo: 'ok' });
      carregar();
    } catch (erro) {
      mostrarToast(erro.message, {
        tipo: 'erro',
        acao: erro.codigo === 'SALDO_INSUFICIENTE' ? { texto: 'PAGAR', aoClicar: abrirCreditos } : undefined,
      });
    } finally {
      setEnviando(false);
    }
  }

  const indisponivel = !ativo ? 'Os recados no telão estão desativados.' : !telaoOnline ? 'O telão está desligado agora. Tente de novo mais tarde.' : '';
  const emAndamento = meus.filter((r) => EM_ANDAMENTO.has(r.status)).length;

  return (
    <>
      <h1>💬 Recado no telão</h1>
      <p className="subtitulo">
        Escreva uma mensagem curta (parabéns, brinde, aviso…) e ela aparece na tela grande da casa por alguns segundos.
        Custa <b className="mono">{preco}</b> {preco === 1 ? 'crédito' : 'créditos'}. Se não for ao ar, os créditos voltam para você.
      </p>

      {indisponivel && <p className="aviso aviso-erro">{indisponivel}</p>}

      <form className="recado-form" onSubmit={enviar}>
        <label className="campo-rotulo">
          Seu recado
          <textarea
            className="campo recado-texto"
            rows={3}
            maxLength={maximo}
            placeholder="Ex.: Parabéns, Ana! 🎉"
            value={texto}
            disabled={Boolean(indisponivel)}
            onChange={(e) => setTexto(e.target.value.replace(/\s*\n\s*/g, ' '))}
          />
          <small className="recado-contador mono">{texto.length}/{maximo}</small>
        </label>

        <p className="recado-saldo">Seus créditos: <b className="mono">{saldo}</b>{saldo < preco && ' (falta saldo para este recado)'}</p>

        <button className="btn btn-grande" disabled={Boolean(indisponivel) || enviando || texto.trim().length < 3 || emAndamento >= 2}>
          {enviando ? 'ENVIANDO…' : emAndamento >= 2 ? 'AGUARDE SEUS RECADOS PASSAREM' : `ENVIAR POR ${preco} ${preco === 1 ? 'CRÉDITO' : 'CRÉDITOS'}`}
        </button>
        {saldo < preco && <button type="button" className="btn btn-ciano btn-grande" onClick={abrirCreditos}>ADICIONAR CRÉDITOS</button>}
      </form>

      {meus.length > 0 && (
        <section className="secao">
          <h2>Seus recados</h2>
          <ul className="recado-lista">
            {meus.map((r) => {
              const [icone, rotulo] = SITUACOES[r.status] ?? ['•', r.status];
              return (
                <li key={r.id} className={`recado-item recado-${r.status}`}>
                  <span aria-hidden="true">{icone}</span>
                  <div>
                    <strong>{r.texto}</strong>
                    <small>{rotulo}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
