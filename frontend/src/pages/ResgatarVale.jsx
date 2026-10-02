import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useSessao } from '../context/Sessao.jsx';

// Destino do QR code do cartão: abre o app e resgata o vale sozinho.
export default function ResgatarVale() {
  const { codigo } = useParams();
  const { sessao, atualizarSessao } = useSessao();
  const navigate = useNavigate();
  const [resultado, setResultado] = useState(null); // { creditos } | { erro }
  const jaTentou = useRef(false);

  useEffect(() => {
    if (!sessao?.id || jaTentou.current) return;
    jaTentou.current = true; // o QR vale uma vez: nunca tenta duas
    api('/vales/resgatar', { metodo: 'POST', corpo: { session_id: sessao.id, codigo } })
      .then((r) => { atualizarSessao({ saldo: r.saldo }); setResultado({ creditos: r.creditos }); })
      .catch((erro) => setResultado({ erro: erro.message }));
  }, [sessao?.id, codigo, atualizarSessao]);

  if (!resultado) return <div className="estado"><span className="carregando" /><p>Conferindo seu vale…</p></div>;

  return (
    <section className="card pagamento-ok">
      <div className="pagamento-icone">{resultado.erro ? '😕' : '🎁'}</div>
      {resultado.erro ? (
        <>
          <h1>Não deu para usar este vale</h1>
          <p>{resultado.erro}</p>
        </>
      ) : (
        <>
          <h1>Vale resgatado!</h1>
          <p>Você ganhou <b className="mono">{resultado.creditos}</b> {resultado.creditos === 1 ? 'música grátis' : 'músicas grátis'}.</p>
          <p className="nota">Use logo: os créditos vencem se ficarem um tempo sem uso.</p>
        </>
      )}
      <button className="btn btn-grande" onClick={() => navigate('/', { replace: true })}>{resultado.erro ? 'VOLTAR AO INÍCIO' : 'ESCOLHER MÚSICAS'}</button>
    </section>
  );
}
