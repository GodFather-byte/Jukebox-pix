import { db } from '../database.js';
import { ErroApi } from '../erros.js';

// Ajustes que o dono muda pelo admin e que precisam sobreviver a reinício (ao contrário do .env).
const PADROES = {
  automatico: '1', // toca música aleatória quando a fila está vazia
  automatico_interrompe: '0', // corta a aleatória assim que alguém pede uma música
  vendas_abertas: '1', // desligado: não gera Pix novo (quem já tem crédito continua usando)
  max_pedidos_por_pessoa: '0', // 0 = sem limite de pedidos simultâneos na fila
  bloquear_repeticao_min: '0', // 0 = desligado; senão, não aceita música que está na fila ou tocou há X min
  prioridade_ativa: '0', // permite pagar extra para tocar a seguir
  prioridade_extra: '2', // créditos extras cobrados pela prioridade
  prioridade_limite: '3', // máximo de pedidos prioritários esperando ao mesmo tempo
  aviso: '', // mural exibido no app e no monitor
};

function ler(chave) {
  const linha = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
  return linha?.valor ?? PADROES[chave];
}

function gravar(chave, valor) {
  db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(chave, String(valor));
}

const lerBool = (chave) => ler(chave) === '1';
const lerInt = (chave) => Number.parseInt(ler(chave), 10) || 0;

// ---------- Playlist automática ----------

export const automaticoAtivo = () => lerBool('automatico');
export const automaticoInterrompe = () => lerBool('automatico_interrompe');

export const lerAutomatico = () => ({ ativo: automaticoAtivo(), interrompe: automaticoInterrompe() });

export function salvarAutomatico({ ativo, interrompe }) {
  if (ativo !== undefined) gravar('automatico', ativo ? '1' : '0');
  if (interrompe !== undefined) gravar('automatico_interrompe', interrompe ? '1' : '0');
  return lerAutomatico();
}

// ---------- Regras da casa (públicas: o app do cliente precisa conhecê-las) ----------

export function lerRegras() {
  return {
    vendas_abertas: lerBool('vendas_abertas'),
    max_pedidos_por_pessoa: lerInt('max_pedidos_por_pessoa'),
    bloquear_repeticao_min: lerInt('bloquear_repeticao_min'),
    prioridade: {
      ativa: lerBool('prioridade_ativa'),
      extra: lerInt('prioridade_extra'),
      limite: lerInt('prioridade_limite'),
    },
    aviso: ler('aviso'),
  };
}

function inteiroEntre(valor, minimo, maximo, nome) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < minimo || n > maximo) {
    throw new ErroApi(400, `${nome}: informe um número inteiro de ${minimo} a ${maximo}.`);
  }
  return n;
}

// Atualização parcial: só mexe no que veio na requisição.
export function salvarRegras(entrada = {}) {
  const novos = {};
  if (entrada.vendas_abertas !== undefined) novos.vendas_abertas = entrada.vendas_abertas ? '1' : '0';
  if (entrada.max_pedidos_por_pessoa !== undefined) {
    novos.max_pedidos_por_pessoa = inteiroEntre(entrada.max_pedidos_por_pessoa, 0, 50, 'Pedidos por pessoa');
  }
  if (entrada.bloquear_repeticao_min !== undefined) {
    novos.bloquear_repeticao_min = inteiroEntre(entrada.bloquear_repeticao_min, 0, 240, 'Minutos sem repetir');
  }
  const prioridade = entrada.prioridade ?? {};
  if (prioridade.ativa !== undefined) novos.prioridade_ativa = prioridade.ativa ? '1' : '0';
  if (prioridade.extra !== undefined) novos.prioridade_extra = inteiroEntre(prioridade.extra, 1, 20, 'Créditos extras da prioridade');
  if (prioridade.limite !== undefined) novos.prioridade_limite = inteiroEntre(prioridade.limite, 1, 20, 'Limite de prioritários');
  if (entrada.aviso !== undefined) {
    const aviso = String(entrada.aviso).replace(/\s+/g, ' ').trim();
    if (aviso.length > 140) throw new ErroApi(400, 'O aviso pode ter no máximo 140 caracteres.');
    novos.aviso = aviso;
  }

  db.transaction(() => {
    for (const [chave, valor] of Object.entries(novos)) gravar(chave, valor);
  })();
  return lerRegras();
}
