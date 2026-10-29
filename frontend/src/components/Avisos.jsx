import { useEffect } from 'react';
import { useToast } from '../context/Toast.jsx';

// Avisos na tela do jukebox sobre recados e músicas da internet (sem renderizar nada).
export default function Avisos() {
  const mostrar = useToast();

  // Andamento do recado no telão: aprovado, no ar, ou devolvido.
  useEffect(() => {
    const aoRecado = (e) => {
      const { status } = e.detail ?? {};
      if (status === 'aprovado') mostrar('✅ Seu recado foi aprovado! Logo vai ao ar.', { tipo: 'ok' });
      if (status === 'exibindo') {
        mostrar('📺 Seu recado está no telão agora!', { tipo: 'ok' });
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
