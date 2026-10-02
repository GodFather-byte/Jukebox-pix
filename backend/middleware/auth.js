import crypto from 'node:crypto';
import { config } from '../config.js';
import { ErroApi } from '../erros.js';

const VALIDADE_MS = 12 * 60 * 60 * 1000;

const assinar = (texto) =>
  crypto.createHmac('sha256', config.admin.segredo).update(texto).digest('hex');

const iguais = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

export const senhaConfere = (senha) => iguais(senha ?? '', config.admin.senha);

export function criarToken() {
  const expira = Date.now() + VALIDADE_MS;
  return `${expira}.${assinar(String(expira))}`;
}

function tokenValido(token) {
  const [expira, assinatura] = String(token ?? '').split('.');
  if (!expira || !assinatura || Number(expira) < Date.now()) return false;
  return iguais(assinatura, assinar(expira));
}

export function exigirAdmin(req, res, next) {
  const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tokenValido(token)) throw new ErroApi(401, 'Acesso restrito ao administrador');
  next();
}

// Limite simples contra tentativa de senha por força bruta (memória; zera ao reiniciar).
const tentativas = new Map();
export function limitarLogin(req, res, next) {
  const chave = req.ip;
  const agora = Date.now();
  const atual = tentativas.get(chave);
  if (!atual || atual.libera < agora) {
    tentativas.set(chave, { total: 1, libera: agora + 60_000 });
    return next();
  }
  atual.total += 1;
  if (atual.total > 5) throw new ErroApi(429, 'Muitas tentativas. Aguarde um minuto.');
  next();
}
