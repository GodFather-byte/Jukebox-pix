import fs from 'node:fs';
import { config } from '../config.js';
import * as configuracoes from './configuracoes.js';
import * as telegram from './telegram.js';

// Avisos automáticos no Telegram do dono. Cada tipo liga/desliga no painel e o mesmo aviso não repete
// antes de `intervaloMin` (um problema que dura horas não vira centenas de mensagens).
const ultimoEnvio = new Map();

const cabecalho = () => `🎵 ${config.nomeLocal}`;

export function avisar(tipo, texto, { intervaloMin = 60, chave = tipo } = {}) {
  if (!telegram.configurado()) return Promise.resolve({ enviado: false, motivo: 'sem_telegram' });
  if (!configuracoes.lerAlertas()[tipo]) return Promise.resolve({ enviado: false, motivo: 'desligado' });

  const agora = Date.now();
  const antes = ultimoEnvio.get(chave);
  if (antes && agora - antes < intervaloMin * 60_000) return Promise.resolve({ enviado: false, motivo: 'repetido' });
  ultimoEnvio.set(chave, agora);

  return telegram.enviar(`${cabecalho()}\n${texto}`).then((resultado) => {
    if (!resultado.ok) console.error(`[telegram] não enviou o aviso "${tipo}": ${resultado.motivo}`);
    return { enviado: resultado.ok, motivo: resultado.motivo };
  });
}

// Zera a memória dos avisos já enviados (usado nos testes).
export const esquecerAvisos = () => ultimoEnvio.clear();

// ---------- Vigia: o que precisa de olho periódico ----------

let provedorCaido = false;
let falhasDoProvedor = 0;

// Dois testes seguidos sem conexão avisam; quando volta, avisa de novo (uma vez).
export function registrarConexaoDoProvedor(online) {
  if (online) {
    falhasDoProvedor = 0;
    if (provedorCaido) {
      provedorCaido = false;
      return avisar('pix', '✅ A conexão com o provedor de Pix voltou. Os pagamentos já funcionam.', { intervaloMin: 0, chave: 'pix-volta' });
    }
    return Promise.resolve({ enviado: false, motivo: 'normal' });
  }
  falhasDoProvedor += 1;
  if (falhasDoProvedor >= 2 && !provedorCaido) {
    provedorCaido = true;
    return avisar('pix', '⚠️ Sem conexão com o provedor de Pix: ninguém consegue pagar. Confira a internet do local. A música continua tocando.', { intervaloMin: 30, chave: 'pix-caiu' });
  }
  return Promise.resolve({ enviado: false, motivo: 'aguardando_confirmar' });
}

const GB = 1024 ** 3;

// Pouco espaço: abaixo de 10% ou de 5 GB livres na unidade das músicas e do banco.
export function verificarDisco() {
  try {
    const { bsize, bavail, blocks } = fs.statfsSync(config.musicasDir);
    const livre = bsize * bavail;
    const total = bsize * blocks;
    if (livre < 5 * GB || livre / total < 0.1) {
      return avisar('disco', `💾 Pouco espaço em disco: ${(livre / GB).toFixed(1)} GB livres (${Math.round((livre / total) * 100)}%). Libere espaço para os backups e os CDs novos.`, { intervaloMin: 24 * 60 });
    }
  } catch { /* não conseguiu medir: sem alerta */ }
  return Promise.resolve({ enviado: false, motivo: 'normal' });
}
