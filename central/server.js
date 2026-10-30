import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { conferirSenha, criarSessao, hashSenha, lerSessao, novoTokenDeMaquina } from './auth.js';
import { agora, db, hashToken, novoId } from './db.js';
import { painel, detalheDaMaquina, ONLINE_HORAS } from './painel.js';

// Central do Jukebox Pix: as máquinas mandam um relatório (a cada 6 h, ao ligar e em cada fechamento) e o app
// (PWA) mostra para o dono, o parceiro e cada ponto só o que é dele. A central nunca fala com a máquina:
// a máquina continua fechada para a internet, quem chama é sempre ela.
const pasta = path.dirname(fileURLToPath(import.meta.url));
const PAPEIS = ['dono', 'parceiro', 'ponto'];

class ErroApi extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

// Primeiro uso: cria o login do dono a partir do ambiente, se ainda não houver nenhum usuário.
export function garantirDono() {
  const { total } = db.prepare('SELECT COUNT(*) AS total FROM usuarios').get();
  if (total > 0) return false;
  const login = process.env.CENTRAL_DONO_LOGIN;
  const senha = process.env.CENTRAL_DONO_SENHA;
  if (!login || !senha) return false;
  if (senha.length < 10) throw new Error('CENTRAL_DONO_SENHA precisa ter pelo menos 10 caracteres.');
  db.prepare('INSERT INTO usuarios (id, nome, login, senha_hash, papel, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run(novoId(), process.env.CENTRAL_DONO_NOME || 'Dono', login.trim().toLowerCase(), hashSenha(senha), 'dono', agora());
  return true;
}

// Tentativas de login por IP: 10 a cada 15 minutos (senha não se adivinha na força bruta).
const tentativas = new Map();
function limitarLogin(ip) {
  const agoraMs = Date.now();
  const recentes = (tentativas.get(ip) ?? []).filter((t) => agoraMs - t < 15 * 60_000);
  if (recentes.length >= 10) throw new ErroApi(429, 'Muitas tentativas. Espere 15 minutos.');
  tentativas.set(ip, [...recentes, agoraMs]);
}

const texto = (valor, nome, max = 80) => {
  const limpo = String(valor ?? '').replace(/\s+/g, ' ').trim();
  if (!limpo) throw new ErroApi(400, `Informe ${nome}.`);
  if (limpo.length > max) throw new ErroApi(400, `${nome} pode ter no máximo ${max} letras.`);
  return limpo;
};

function usuarioDaSessao(req) {
  const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const id = lerSessao(token);
  const usuario = id && db.prepare('SELECT id, nome, login, papel FROM usuarios WHERE id = ?').get(id);
  if (!usuario) throw new ErroApi(401, 'Entre de novo.');
  return usuario;
}

const exigirDono = (usuario) => { if (usuario.papel !== 'dono') throw new ErroApi(403, 'Só o dono pode fazer isso.'); };

function validarRelatorio(dados) {
  const total = dados?.relogio?.total;
  if (!dados || typeof dados !== 'object' || Array.isArray(dados) || typeof total?.entrou !== 'number') {
    throw new ErroApi(400, 'Relatório inválido.');
  }
  return dados;
}

export function criarApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // atrás do HTTPS do Render/Fly/Nginx
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self'; manifest-src 'self'; worker-src 'self'",
    });
    next();
  });
  app.use(express.json({ limit: '256kb' }));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // ---------- Máquinas mandando relatório ----------
  app.post('/api/maquina/relatorio', (req, res) => {
    const token = (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const maquina = token && db.prepare('SELECT id, nome FROM maquinas WHERE token_hash = ?').get(hashToken(token));
    if (!maquina) throw new ErroApi(401, 'Token de máquina inválido.');
    const dados = validarRelatorio(req.body);
    const momento = agora();
    const json = JSON.stringify(dados);
    db.transaction(() => {
      db.prepare('INSERT INTO relatorios (maquina_id, recebido_em, dados) VALUES (?, ?, ?)').run(maquina.id, momento, json);
      db.prepare('UPDATE maquinas SET ultimo_em = ?, ultimo = ? WHERE id = ?').run(momento, json, maquina.id);
    })();
    res.status(201).json({ ok: true, maquina: maquina.nome, recebido_em: momento });
  });

  // ---------- App ----------
  app.post('/api/login', (req, res) => {
    limitarLogin(req.ip);
    const login = String(req.body?.login ?? '').trim().toLowerCase();
    const usuario = db.prepare('SELECT * FROM usuarios WHERE login = ?').get(login);
    if (!usuario || !conferirSenha(req.body?.senha ?? '', usuario.senha_hash)) throw new ErroApi(401, 'Login ou senha errados.');
    res.json({ token: criarSessao(usuario.id), usuario: { nome: usuario.nome, login: usuario.login, papel: usuario.papel } });
  });

  app.get('/api/eu', (req, res) => {
    const { nome, login, papel } = usuarioDaSessao(req);
    res.json({ nome, login, papel, online_horas: ONLINE_HORAS });
  });

  app.get('/api/painel', (req, res) => res.json(painel(usuarioDaSessao(req))));

  app.get('/api/maquinas/:id', (req, res) => {
    const detalhe = detalheDaMaquina(usuarioDaSessao(req), req.params.id);
    if (!detalhe) throw new ErroApi(404, 'Máquina não encontrada.');
    res.json(detalhe);
  });

  // ---------- Cadastros (só o dono) ----------
  app.get('/api/admin', (req, res) => {
    exigirDono(usuarioDaSessao(req));
    res.json({
      usuarios: db.prepare('SELECT id, nome, login, papel, criado_em FROM usuarios ORDER BY papel, nome').all(),
      maquinas: db.prepare('SELECT id, nome, local, parceiro_id, ponto_id, criado_em, ultimo_em FROM maquinas ORDER BY nome').all(),
    });
  });

  app.post('/api/admin/usuarios', (req, res) => {
    exigirDono(usuarioDaSessao(req));
    const papel = String(req.body?.papel ?? '');
    if (!PAPEIS.includes(papel)) throw new ErroApi(400, 'Escolha o tipo de acesso: dono, parceiro ou ponto.');
    const senha = String(req.body?.senha ?? '');
    if (senha.length < 8) throw new ErroApi(400, 'A senha precisa ter pelo menos 8 caracteres.');
    const login = texto(req.body?.login, 'o login', 40).toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(login)) throw new ErroApi(400, 'O login só pode ter letras sem acento, números, ponto, traço e sublinhado.');
    if (db.prepare('SELECT 1 FROM usuarios WHERE login = ?').get(login)) throw new ErroApi(409, 'Já existe alguém com esse login.');
    const id = novoId();
    db.prepare('INSERT INTO usuarios (id, nome, login, senha_hash, papel, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, texto(req.body?.nome, 'o nome'), login, hashSenha(senha), papel, agora());
    res.status(201).json({ id });
  });

  app.delete('/api/admin/usuarios/:id', (req, res) => {
    const eu = usuarioDaSessao(req);
    exigirDono(eu);
    if (req.params.id === eu.id) throw new ErroApi(400, 'Você não pode apagar o seu próprio acesso.');
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  const papelDe = (id, papel, nome) => {
    if (!id) return null;
    if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ? AND papel = ?').get(id, papel)) throw new ErroApi(400, `${nome} inválido.`);
    return id;
  };

  // O token aparece uma vez só: é ele que vai na tela de configuração da jukebox.
  app.post('/api/admin/maquinas', (req, res) => {
    exigirDono(usuarioDaSessao(req));
    const id = novoId();
    const token = novoTokenDeMaquina();
    db.prepare('INSERT INTO maquinas (id, nome, local, parceiro_id, ponto_id, token_hash, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      id, texto(req.body?.nome, 'o nome da máquina', 40), String(req.body?.local ?? '').trim().slice(0, 80),
      papelDe(req.body?.parceiro_id, 'parceiro', 'Parceiro'), papelDe(req.body?.ponto_id, 'ponto', 'Ponto'), hashToken(token), agora(),
    );
    res.status(201).json({ id, token });
  });

  app.put('/api/admin/maquinas/:id', (req, res) => {
    exigirDono(usuarioDaSessao(req));
    const atual = db.prepare('SELECT * FROM maquinas WHERE id = ?').get(req.params.id);
    if (!atual) throw new ErroApi(404, 'Máquina não encontrada.');
    const b = req.body ?? {};
    db.prepare('UPDATE maquinas SET nome = ?, local = ?, parceiro_id = ?, ponto_id = ? WHERE id = ?').run(
      b.nome !== undefined ? texto(b.nome, 'o nome da máquina', 40) : atual.nome,
      b.local !== undefined ? String(b.local).trim().slice(0, 80) : atual.local,
      b.parceiro_id !== undefined ? papelDe(b.parceiro_id, 'parceiro', 'Parceiro') : atual.parceiro_id,
      b.ponto_id !== undefined ? papelDe(b.ponto_id, 'ponto', 'Ponto') : atual.ponto_id,
      atual.id,
    );
    res.json({ ok: true });
  });

  // Token novo (máquina trocada ou token vazado): o antigo para de valer na hora.
  app.post('/api/admin/maquinas/:id/token', (req, res) => {
    exigirDono(usuarioDaSessao(req));
    const token = novoTokenDeMaquina();
    const { changes } = db.prepare('UPDATE maquinas SET token_hash = ? WHERE id = ?').run(hashToken(token), req.params.id);
    if (!changes) throw new ErroApi(404, 'Máquina não encontrada.');
    res.json({ token });
  });

  app.delete('/api/admin/maquinas/:id', (req, res) => {
    exigirDono(usuarioDaSessao(req));
    db.prepare('DELETE FROM maquinas WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

  // ---------- App (PWA) ----------
  app.use(express.static(path.join(pasta, 'public'), {
    setHeaders: (res, arquivo) => {
      if (/(sw\.js|index\.html|manifest\.webmanifest)$/.test(arquivo)) res.set('Cache-Control', 'no-cache');
    },
  }));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(pasta, 'public', 'index.html')));

  app.use((erro, req, res, _next) => {
    if (erro.type === 'entity.too.large') return res.status(413).json({ erro: 'Relatório grande demais.' });
    if (erro instanceof SyntaxError) return res.status(400).json({ erro: 'JSON inválido.' });
    const status = erro.status ?? 500;
    if (status === 500) console.error('[central]', erro);
    res.status(status).json({ erro: status === 500 ? 'Erro interno.' : erro.message });
  });
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // CENTRAL_DEMO=1: central só de demonstração, que recria as máquinas de exemplo a cada vez que liga.
  if (process.env.CENTRAL_DEMO === '1') await import('./demo.js');
  if (!process.env.CENTRAL_SEGREDO) console.warn('[central] Defina CENTRAL_SEGREDO: sem ele, todos precisam entrar de novo a cada reinício.');
  if (garantirDono()) console.log('[central] Login do dono criado a partir de CENTRAL_DONO_LOGIN.');
  const porta = Number(process.env.PORT || 4000);
  criarApp().listen(porta, () => console.log(`[central] ouvindo na porta ${porta}`));
}
