import { config } from '../config.js';

// Mensagens no celular do dono (e, se quiser, do contato da boate) pela API de bots do Telegram.
// O token e as conversas vêm do .env e nunca saem do servidor: nenhuma resposta da API do painel os devolve.
const TEMPO_MAXIMO_MS = 10_000;

export const configurado = () => Boolean(config.telegram.token && config.telegram.chatDono);
export const boateConfigurada = () => Boolean(config.telegram.token && config.telegram.chatBoate);

async function chamar(metodo, corpo) {
  const resposta = await fetch(`${config.telegram.api}/bot${config.telegram.token}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok || dados.ok === false) throw new Error(dados.description || `HTTP ${resposta.status}`);
  return dados.result;
}

// Nunca lança: devolve { ok, motivo }. Falha de rede não pode derrubar o que estava acontecendo.
export async function enviar(texto, { para = 'dono' } = {}) {
  const conversa = para === 'boate' ? config.telegram.chatBoate : config.telegram.chatDono;
  if (!config.telegram.token || !conversa) return { ok: false, motivo: 'Telegram não configurado' };
  try {
    await chamar('sendMessage', { chat_id: conversa, text: String(texto).slice(0, 4000), disable_web_page_preview: true });
    return { ok: true };
  } catch (erro) {
    return { ok: false, motivo: erro.name === 'TimeoutError' ? 'tempo esgotado' : erro.message };
  }
}

// Ajuda a achar o "chat id": o dono manda um "oi" ao bot e esta chamada lista quem escreveu.
export async function descobrirConversas() {
  if (!config.telegram.token) throw new Error('Defina TELEGRAM_BOT_TOKEN no .env e reinicie o servidor.');
  const atualizacoes = await chamar('getUpdates', { limit: 50, timeout: 0 });
  const conversas = new Map();
  for (const item of atualizacoes ?? []) {
    const chat = item.message?.chat ?? item.channel_post?.chat ?? item.my_chat_member?.chat;
    if (!chat) continue;
    const nome = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || 'sem nome';
    conversas.set(String(chat.id), { id: String(chat.id), nome, tipo: chat.type });
  }
  return [...conversas.values()];
}
