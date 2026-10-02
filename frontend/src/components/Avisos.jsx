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

  // Andamento do recado no telão: aprovado, no ar, ou devolvido.
  useEffect(() => {
    const aoRecado = (e) => {
      const { status } = e.detail ?? {};
      if (status === 'aprovado') mostrar('✅ Seu recado foi aprovado! Logo vai ao ar.', { tipo: 'ok' });
      if (status === 'exibindo') {
        mostrar('📺 Seu recado está no telão agora!', { tipo: 'ok' });
        vibrar([120, 60, 120]);
      }
      if (status === 'recusado') mostrar('🚫 Seu recado não foi ao ar. Os créditos voltaram para você.', { tipo: 'erro' });
      if (status === 'expirado') mostrar('⌛ Seu recado não foi ao ar a tempo. Os créditos voltaram.', { tipo: 'erro' });
    };
    window.addEventListener('jukebox:recado', aoRecado);
    return () => window.removeEventListener('jukebox:recado', aoRecado);
  }, [mostrar]);

  // Música da internet: terminou de baixar e entrou na fila, ou falhou (o crédito volta sozinho).
  useEffect(() => {
    const aoYoutube = (e) => {
      const { status, titulo, creditos } = e.detail ?? {};
      if (status === 'na_fila') {
        mostrar(`🎶 “${titulo}” entrou na fila!`, { tipo: 'ok' });
        vibrar(200);
      }
      if (status === 'falhou') {
        mostrar(`Não consegui baixar “${titulo}”. ${creditos === 1 ? 'O crédito voltou' : `Os ${creditos} créditos voltaram`} para você.`, { tipo: 'erro' });
      }
    };
    window.addEventListener('jukebox:youtube', aoYoutube);
    return () => window.removeEventListener('jukebox:youtube', aoYoutube);
  }, [mostrar]);

  return null;
}
