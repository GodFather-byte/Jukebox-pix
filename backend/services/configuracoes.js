import { db } from '../database.js';
import { ErroApi } from '../erros.js';

// Ajustes que o dono muda pelo admin e que precisam sobreviver a reinício (ao contrário do .env).
const PADROES = {
  automatico: '1', // toca música aleatória quando a fila está vazia
  automatico_interrompe: '0', // corta a aleatória assim que alguém pede uma música
  automatico_categorias: '[]', // categorias sorteadas ([] = todas)
  automatico_agenda: '[]', // [{ inicio, fim, categorias }]: por horário, a primeira janela que casa vale
  vendas_abertas: '1', // chave manual: desligado, não gera Pix novo (quem já tem crédito continua usando)
  vendas_agenda: '{"ativa":false,"abre":"20:00","fecha":"05:00"}', // abre/fecha sozinho
  max_pedidos_por_pessoa: '0', // 0 = sem limite de pedidos simultâneos na fila
  bloquear_repeticao_min: '0', // 0 = desligado; senão, não aceita música que está na fila ou tocou há X min
  prioridade_ativa: '0', // permite pagar extra para tocar a seguir
  prioridade_extra: '2', // créditos extras cobrados pela prioridade
  prioridade_limite: '3', // máximo de pedidos prioritários esperando ao mesmo tempo
  bonus_ativo: '0', // bônus de recarga
  bonus_faixas: '[]', // [{ valor, bonus }]
  volume: '100', // 0 a 100
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

function lerJson(chave) {
  try {
    return JSON.parse(ler(chave));
  } catch {
    return JSON.parse(PADROES[chave]);
  }
}

// ---------- Horários ("HH:MM", relógio do notebook) ----------

const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;
const emMinutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const minutosDe = (data) => data.getHours() * 60 + data.getMinutes();

// Janela que atravessa a meia-noite (ex.: 20:00 a 05:00) também funciona. Início = fim vale o dia todo.
export function dentroDaJanela(inicio, fim, data = new Date()) {
  const agora = minutosDe(data);
  const a = emMinutos(inicio);
  const b = emMinutos(fim);
  if (a === b) return true;
  return a < b ? agora >= a && agora < b : agora >= a || agora < b;
}

function validarHora(valor, nome) {
  if (!HORA_VALIDA.test(String(valor))) throw new ErroApi(400, `${nome}: use o formato HH:MM (ex.: 20:00).`);
  return String(valor);
}

function categoriasValidas(lista, nome) {
  if (!Array.isArray(lista)) throw new ErroApi(400, `${nome}: envie uma lista de categorias.`);
  const existentes = new Set(db.prepare('SELECT id FROM categorias').all().map((c) => c.id));
  const unicas = [...new Set(lista.map(String))];
  const invalida = unicas.find((id) => !existentes.has(id));
  if (invalida) throw new ErroApi(400, `${nome}: categoria desconhecida (${invalida}).`);
  return unicas;
}

// ---------- Playlist automática ----------

export const automaticoAtivo = () => lerBool('automatico');
export const automaticoInterrompe = () => lerBool('automatico_interrompe');

export const lerAutomatico = () => ({
  ativo: automaticoAtivo(),
  interrompe: automaticoInterrompe(),
  categorias: lerJson('automatico_categorias'),
  agenda: lerJson('automatico_agenda'),
});

export function salvarAutomatico({ ativo, interrompe, categorias, agenda } = {}) {
  const novos = {};
  if (ativo !== undefined) novos.automatico = ativo ? '1' : '0';
  if (interrompe !== undefined) novos.automatico_interrompe = interrompe ? '1' : '0';
  if (categorias !== undefined) novos.automatico_categorias = JSON.stringify(categoriasValidas(categorias, 'Categorias da playlist'));
  if (agenda !== undefined) {
    if (!Array.isArray(agenda) || agenda.length > 10) throw new ErroApi(400, 'A agenda aceita até 10 janelas de horário.');
    novos.automatico_agenda = JSON.stringify(agenda.map((regra, i) => ({
      inicio: validarHora(regra?.inicio, `Janela ${i + 1}, início`),
      fim: validarHora(regra?.fim, `Janela ${i + 1}, fim`),
      categorias: categoriasValidas(regra?.categorias ?? [], `Janela ${i + 1}`),
    })));
  }
  db.transaction(() => {
    for (const [chave, valor] of Object.entries(novos)) gravar(chave, valor);
  })();
  return lerAutomatico();
}

// Categorias que a playlist automática pode sortear agora ([] = qualquer uma).
export function categoriasDaAutomatica(data = new Date()) {
  const regra = lerJson('automatico_agenda').find((r) => dentroDaJanela(r.inicio, r.fim, data));
  return regra ? regra.categorias : lerJson('automatico_categorias');
}

// ---------- Vendas ----------

// A venda está aberta quando a chave manual está ligada E (sem agenda ou dentro do horário).
export function lerVendas(data = new Date()) {
  const manual = lerBool('vendas_abertas');
  const agenda = lerJson('vendas_agenda');
  const noHorario = !agenda.ativa || dentroDaJanela(agenda.abre, agenda.fecha, data);
  return {
    aberta: manual && noHorario,
    manual,
    agenda,
    motivo_fechada: !manual ? 'manual' : !noHorario ? 'horario' : null,
  };
}

// ---------- Bônus de recarga ----------

// Maior faixa que o valor pago alcança (não acumula). O bônus entra como cortesia da casa.
export function bonusPara(valor) {
  if (!lerBool('bonus_ativo')) return 0;
  const faixa = lerJson('bonus_faixas')
    .filter((f) => valor >= f.valor)
    .sort((a, b) => b.valor - a.valor)[0];
  return faixa ? faixa.bonus : 0;
}

// ---------- Volume ----------

export const lerVolume = () => Math.min(100, Math.max(0, lerInt('volume')));

export function salvarVolume(valor) {
  const volume = Number(valor);
  if (!Number.isInteger(volume) || volume < 0 || volume > 100) throw new ErroApi(400, 'Volume: informe um número inteiro de 0 a 100.');
  gravar('volume', volume);
  return volume;
}

// ---------- Regras da casa (públicas: o app do cliente precisa conhecê-las) ----------

export function lerRegras() {
  const vendas = lerVendas();
  return {
    vendas_abertas: vendas.aberta,
    vendas: { manual: vendas.manual, agenda: vendas.agenda, motivo_fechada: vendas.motivo_fechada },
    max_pedidos_por_pessoa: lerInt('max_pedidos_por_pessoa'),
    bloquear_repeticao_min: lerInt('bloquear_repeticao_min'),
    prioridade: {
      ativa: lerBool('prioridade_ativa'),
      extra: lerInt('prioridade_extra'),
      limite: lerInt('prioridade_limite'),
    },
    bonus: { ativo: lerBool('bonus_ativo'), faixas: lerJson('bonus_faixas') },
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

function validarFaixasDeBonus(faixas) {
  if (!Array.isArray(faixas) || faixas.length > 6) throw new ErroApi(400, 'O bônus aceita até 6 faixas.');
  const limpas = faixas.map((f, i) => {
    const valor = inteiroEntre(f?.valor, 1, 500, `Faixa ${i + 1}, valor da recarga`);
    const bonus = inteiroEntre(f?.bonus, 1, 500, `Faixa ${i + 1}, bônus`);
    if (bonus > valor) throw new ErroApi(400, `Faixa ${i + 1}: o bônus não pode ser maior que o valor da recarga.`);
    return { valor, bonus };
  });
  if (new Set(limpas.map((f) => f.valor)).size !== limpas.length) throw new ErroApi(400, 'Há duas faixas com o mesmo valor de recarga.');
  return limpas.sort((a, b) => a.valor - b.valor);
}

// Atualização parcial: só mexe no que veio na requisição.
export function salvarRegras(entrada = {}) {
  const novos = {};
  if (entrada.vendas_abertas !== undefined) novos.vendas_abertas = entrada.vendas_abertas ? '1' : '0';
  if (entrada.vendas_agenda !== undefined) {
    const agenda = entrada.vendas_agenda ?? {};
    novos.vendas_agenda = JSON.stringify({
      ativa: Boolean(agenda.ativa),
      abre: validarHora(agenda.abre, 'Horário de abrir'),
      fecha: validarHora(agenda.fecha, 'Horário de fechar'),
    });
  }
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
  const bonus = entrada.bonus ?? {};
  if (bonus.ativo !== undefined) novos.bonus_ativo = bonus.ativo ? '1' : '0';
  if (bonus.faixas !== undefined) novos.bonus_faixas = JSON.stringify(validarFaixasDeBonus(bonus.faixas));
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
