import { useEffect, useRef } from 'react';
import { useSessao } from '../context/Sessao.jsx';
import { useToast } from '../context/Toast.jsx';

function vibrar(padrao) {
  try { navigator.vibrate?.(padrao); } catch { /* aparelho sem vibração */ }
}

// Avisa o cliente quando a música dele é a próxima e quando começa a tocar (sem renderizar nada).
export default function Avisos() {
  const { fila } = useSessao();
  const mostrar = useToast();
  const anterior = useRef({ proxima: null, tocando: null });

  useEffect(() => {
    const proxima = fila.fila[0]?.minha ? fila.fila[0].id : null;
    const tocando = fila.agora_tocando?.minha ? fila.agora_tocando.id : null;

    if (proxima && proxima !== anterior.current.proxima) {
      mostrar('🎶 Sua música é a próxima!', { tipo: 'ok' });
      vibrar(200);
    }
    if (tocando && tocando !== anterior.current.tocando) {
      mostrar('▶ Sua música começou a tocar!', { tipo: 'ok' });
      vibrar([120, 60, 120]);
    }
    anterior.current = { proxima, tocando };
  }, [fila, mostrar]);

  return null;
}
