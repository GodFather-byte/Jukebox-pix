import crypto from 'node:crypto';

// Segredo que assina as sessões do app. Em produção vem do ambiente (CENTRAL_SEGREDO); sem ele, cada reinício
// gera um novo e todo mundo precisa entrar de novo (bom para testes, ruim para a nuvem: o server.js avisa).
export const segredo = process.env.CENTRAL_SEGREDO || crypto.randomBytes(32).toString('hex');
const DURACAO_MS = 30 * 24 * 60 * 60_000; // o app fica logado no celular por 30 dias

export function hashSenha(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(senha), sal, 64).toString('hex');
  return `${sal}:${hash}`;
}

export function conferirSenha(senha, guardado) {
  const [sal, hash] = String(guardado).split(':');
  if (!sal || !hash) return false;
  const tentativa = crypto.scryptSync(String(senha), sal, 64);
  const certo = Buffer.from(hash, 'hex');
  return certo.length === tentativa.length && crypto.timingSafeEqual(certo, tentativa);
}

const assinar = (texto) => crypto.createHmac('sha256', segredo).update(texto).digest('base64url');

export function criarSessao(usuarioId) {
  const corpo = `${usuarioId}.${Date.now() + DURACAO_MS}`;
  return `${corpo}.${assinar(corpo)}`;
}

// Devolve o id do usuário ou null (assinatura errada ou sessão vencida).
export function lerSessao(token) {
  const partes = String(token ?? '').split('.');
  if (partes.length !== 3) return null;
  const [id, vence, assinatura] = partes;
  const esperado = Buffer.from(assinar(`${id}.${vence}`));
  const recebido = Buffer.from(assinatura);
  if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) return null;
  return Number(vence) > Date.now() ? id : null;
}

export const novoTokenDeMaquina = () => `jbx_${crypto.randomBytes(24).toString('base64url')}`;
