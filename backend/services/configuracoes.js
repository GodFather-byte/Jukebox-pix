import { db, normalizar } from '../database.js';
import { ErroApi } from '../erros.js';
import { telasConectadas } from '../events.js';
import * as yt from './youtube.js';

// Ajustes que o dono muda pelo admin e que precisam sobreviver a reinício (ao contrário do .env).
const PADROES = {
  automatico: '1', // toca música aleatória quando a fila está vazia
  automatico_interrompe: '0', // corta a aleatória assim que alguém pede uma música
  automatico_intervalo_min: '5', // minutos de silêncio antes de cada aleatória (0 = uma atrás da outra)
  automatico_so_top: '1', // sorteia entre as mais tocadas da casa (sem histórico ainda: o acervo todo)
  automatico_volume: '80', // % do volume mestre na aleatória: mais baixa que a paga, para o cliente querer a dele
  automatico_vinheta: '1', // toca uma vinheta (se houver) antes de cada aleatória: "coloque créditos e escolha"
  automatico_trecho_seg: '0', // palhinha: a aleatória toca só este tanto de segundos (0 = a música inteira)
  sorteio_a_cada: '0', // sorteio de crédito: em média 1 a cada N músicas pagas ganha 1 crédito (0 = desligado)
  limite_30min: '100', // no máximo este tanto de reais em Pix/cartão a cada 30 minutos na máquina (0 = sem limite)
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
  bonus_agenda: '[]', // [{ inicio, fim }]: o bônus só vale dentro dessas janelas ([] = o dia todo)
  preco_lancamento: '0', // preço mínimo (em créditos) das músicas de CDs em LANÇAMENTOS; 0 = desligado
  volume: '100', // 0 a 100
  aviso: '', // mural exibido no app e no monitor
  recados_ativo: '0', // recado pago no telão
  recados_preco: '5', // créditos por recado
  recados_segundos: '15', // tempo de cada recado no telão
  recados_moderacao: '1', // o dono aprova antes de ir ao ar
  recados_bloqueadas: '', // palavras proibidas, separadas por vírgula
  vinhetas_ativo: '0', // toca uma vinheta de áudio de tempos em tempos
  vinhetas_a_cada: '5', // a cada quantas músicas
  cartazes_ativo: '0', // cartazes girando no monitor
  cartazes_intervalo: '90', // segundos entre um cartaz e o próximo
  normalizacao: '{"ativa":false,"alvo":null}', // volume parelho; alvo null = automático (mediana do acervo)
  alertas: '{"player":true,"pix":true,"disco":true,"backup":true,"inicio":false,"youtube":true,"credito":true}', // avisos no Telegram
  fechamento: '{"ativo":false,"hora":"06:00","boate":false}', // fechamento diário no Telegram
  fechamento_ultimo: '', // dia (AAAA-MM-DD) do último fechamento enviado
  youtube_ativo: '0', // o cliente pode pedir músicas da internet (baixadas pelo yt-dlp)
  youtube_aceite: '', // quando o dono confirmou ter lido o aviso de direitos autorais (ISO); vazio = ainda não
  youtube_preco: '3', // créditos por música pedida pela internet
  youtube_max_min: '8', // duração máxima (minutos) de uma música da internet
  youtube_automatica: '0', // músicas da internet também entram na playlist automática
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

// Leitura e gravação avulsas para quem guarda um ajuste próprio (ex.: o último fechamento enviado).
export const lerConfig = ler;
export const gravarConfig = gravar;

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
export const automaticoIntervaloMin = () => Math.min(120, Math.max(0, lerInt('automatico_intervalo_min')));
export const automaticoSoTop = () => lerBool('automatico_so_top');
export const automaticoVolume = () => Math.min(100, Math.max(30, lerInt('automatico_volume') || 100));
export const automaticoVinheta = () => lerBool('automatico_vinheta');
export const automaticoTrechoSeg = () => Math.min(600, Math.max(0, lerInt('automatico_trecho_seg')));

export const lerAutomatico = () => ({
  ativo: automaticoAtivo(),
  interrompe: automaticoInterrompe(),
  intervalo_min: automaticoIntervaloMin(),
  so_top: automaticoSoTop(),
  volume: automaticoVolume(),
  vinheta: automaticoVinheta(),
  trecho_seg: automaticoTrechoSeg(),
  categorias: lerJson('automatico_categorias'),
  agenda: lerJson('automatico_agenda'),
});

export function salvarAutomatico({
  ativo, interrompe, intervalo_min: intervaloMin, so_top: soTop, volume, vinheta, trecho_seg: trechoSeg, categorias, agenda,
} = {}) {
  const novos = {};
  if (ativo !== undefined) novos.automatico = ativo ? '1' : '0';
  if (interrompe !== undefined) novos.automatico_interrompe = interrompe ? '1' : '0';
  if (intervaloMin !== undefined) novos.automatico_intervalo_min = inteiroEntre(intervaloMin, 0, 120, 'Intervalo da playlist automática');
  if (soTop !== undefined) novos.automatico_so_top = soTop ? '1' : '0';
  if (volume !== undefined) novos.automatico_volume = inteiroEntre(volume, 30, 100, 'Volume da aleatória (%)');
  if (vinheta !== undefined) novos.automatico_vinheta = vinheta ? '1' : '0';
  if (trechoSeg !== undefined) novos.automatico_trecho_seg = inteiroEntre(trechoSeg, 0, 600, 'Trecho da aleatória (segundos)');
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

// O bônus vale quando a chave está ligada E (sem horários cadastrados ou dentro de algum deles).
export function bonusAtivoAgora(data = new Date()) {
  if (!lerBool('bonus_ativo')) return false;
  const janelas = lerJson('bonus_agenda');
  return janelas.length === 0 || janelas.some((j) => dentroDaJanela(j.inicio, j.fim, data));
}

// Maior faixa que o valor pago alcança (não acumula). O bônus entra como cortesia da casa.
export function bonusPara(valor) {
  if (!bonusAtivoAgora()) return 0;
  const faixa = lerJson('bonus_faixas')
    .filter((f) => valor >= f.valor)
    .sort((a, b) => b.valor - a.valor)[0];
  return faixa ? faixa.bonus : 0;
}

// ---------- Preço dos lançamentos ----------

// Músicas de CDs ainda em LANÇAMENTOS custam pelo menos isto (0 = cada música usa o próprio preço).
export const lerPrecoLancamento = () => Math.min(20, Math.max(0, lerInt('preco_lancamento')));

// ---------- Volume ----------

export const lerVolume = () => Math.min(100, Math.max(0, lerInt('volume')));

export function salvarVolume(valor) {
  const volume = Number(valor);
  if (!Number.isInteger(volume) || volume < 0 || volume > 100) throw new ErroApi(400, 'Volume: informe um número inteiro de 0 a 100.');
  gravar('volume', volume);
  return volume;
}

// ---------- Recado no telão ----------

export const RECADO_MAX_CARACTERES = 60;
const MAX_PALAVRAS_BLOQUEADAS = 200;

const gravarVarios = (novos) => db.transaction(() => {
  for (const [chave, valor] of Object.entries(novos)) gravar(chave, valor);
})();

export function lerRecados() {
  return {
    ativo: lerBool('recados_ativo'),
    preco: lerInt('recados_preco') || 5,
    segundos: lerInt('recados_segundos') || 15,
    moderacao: lerBool('recados_moderacao'),
    bloqueadas: ler('recados_bloqueadas'),
  };
}

// Palavras proibidas já sem acento/caixa, para comparar com o texto normalizado do recado.
export const palavrasBloqueadas = () => ler('recados_bloqueadas').split(',').map((p) => normalizar(p).trim()).filter(Boolean);

export function salvarRecados(entrada = {}) {
  const novos = {};
  if (entrada.ativo !== undefined) novos.recados_ativo = entrada.ativo ? '1' : '0';
  if (entrada.preco !== undefined) novos.recados_preco = inteiroEntre(entrada.preco, 1, 50, 'Preço do recado');
  if (entrada.segundos !== undefined) novos.recados_segundos = inteiroEntre(entrada.segundos, 5, 60, 'Tempo de cada recado no telão');
  if (entrada.moderacao !== undefined) novos.recados_moderacao = entrada.moderacao ? '1' : '0';
  if (entrada.bloqueadas !== undefined) {
    const lista = String(entrada.bloqueadas).split(',').map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (lista.length > MAX_PALAVRAS_BLOQUEADAS) throw new ErroApi(400, `A lista aceita até ${MAX_PALAVRAS_BLOQUEADAS} palavras.`);
    if (lista.some((p) => p.length > 30)) throw new ErroApi(400, 'Cada palavra bloqueada pode ter no máximo 30 letras.');
    novos.recados_bloqueadas = lista.join(', ');
  }
  gravarVarios(novos);
  return lerRecados();
}

// ---------- Vinhetas de áudio e cartazes do monitor ----------

export const lerVinhetas = () => ({ ativo: lerBool('vinhetas_ativo'), a_cada: lerInt('vinhetas_a_cada') || 5 });

export function salvarVinhetas({ ativo, a_cada: aCada } = {}) {
  const novos = {};
  if (ativo !== undefined) novos.vinhetas_ativo = ativo ? '1' : '0';
  if (aCada !== undefined) novos.vinhetas_a_cada = inteiroEntre(aCada, 1, 50, 'Tocar a vinheta a cada quantas músicas');
  gravarVarios(novos);
  return lerVinhetas();
}

export const lerCartazes = () => ({ ativo: lerBool('cartazes_ativo'), intervalo: lerInt('cartazes_intervalo') || 90 });

export function salvarCartazes({ ativo, intervalo } = {}) {
  const novos = {};
  if (ativo !== undefined) novos.cartazes_ativo = ativo ? '1' : '0';
  if (intervalo !== undefined) novos.cartazes_intervalo = inteiroEntre(intervalo, 20, 900, 'Segundos entre os cartazes');
  gravarVarios(novos);
  return lerCartazes();
}

// ---------- Volume parelho ----------

// alvo = null: o servidor usa a mediana do acervo (o volume geral quase não muda).
export function lerNormalizacao() {
  const n = lerJson('normalizacao');
  return { ativa: Boolean(n.ativa), alvo: Number.isFinite(n.alvo) ? n.alvo : null };
}

export function salvarNormalizacao({ ativa, alvo } = {}) {
  const novo = lerNormalizacao();
  if (ativa !== undefined) novo.ativa = Boolean(ativa);
  if (alvo !== undefined) novo.alvo = alvo === null || alvo === '' ? null : inteiroEntre(alvo, -24, -6, 'Alvo de volume (LUFS)');
  gravar('normalizacao', JSON.stringify(novo));
  return lerNormalizacao();
}

// ---------- Músicas da internet (yt-dlp) ----------

export function lerYoutube() {
  return {
    ativo: lerBool('youtube_ativo'),
    preco: Math.min(20, Math.max(1, lerInt('youtube_preco') || 3)),
    max_min: Math.min(20, Math.max(2, lerInt('youtube_max_min') || 8)),
    automatica: lerBool('youtube_automatica'),
    aceite_em: ler('youtube_aceite') || null,
  };
}

// Ligar pela primeira vez exige a confirmação do aviso (direitos autorais e termos do YouTube); fica registrado quando.
export function salvarYoutube(entrada = {}) {
  const atual = lerYoutube();
  const novos = {};
  if (entrada.preco !== undefined) novos.youtube_preco = inteiroEntre(entrada.preco, 1, 20, 'Preço da música da internet');
  if (entrada.max_min !== undefined) novos.youtube_max_min = inteiroEntre(entrada.max_min, 2, 20, 'Duração máxima da música');
  if (entrada.automatica !== undefined) novos.youtube_automatica = entrada.automatica ? '1' : '0';
  if (entrada.ativo !== undefined) {
    if (entrada.ativo && !atual.aceite_em) {
      if (entrada.aceite !== true) {
        throw new ErroApi(400, 'Para ligar, confirme que você leu o aviso sobre direitos autorais e os termos do YouTube.', 'ACEITE_OBRIGATORIO');
      }
      novos.youtube_aceite = new Date().toISOString();
    }
    novos.youtube_ativo = entrada.ativo ? '1' : '0';
  }
  gravarVarios(novos);
  return lerYoutube();
}

// ---------- Avisos no Telegram ----------

export const TIPOS_DE_ALERTA = ['player', 'pix', 'disco', 'backup', 'inicio', 'youtube', 'credito'];

// Quem salvou os ajustes antes de existir um tipo novo não tem a chave dele: vale o padrão do tipo.
export function lerAlertas() {
  const salvos = lerJson('alertas');
  const padroes = JSON.parse(PADROES.alertas);
  return Object.fromEntries(TIPOS_DE_ALERTA.map((tipo) => [tipo, Boolean(tipo in salvos ? salvos[tipo] : padroes[tipo])]));
}

export function salvarAlertas(entrada = {}) {
  const atuais = lerAlertas();
  for (const tipo of TIPOS_DE_ALERTA) if (entrada[tipo] !== undefined) atuais[tipo] = Boolean(entrada[tipo]);
  gravar('alertas', JSON.stringify(atuais));
  return atuais;
}

export function lerFechamento() {
  const f = lerJson('fechamento');
  return { ativo: Boolean(f.ativo), hora: HORA_VALIDA.test(String(f.hora)) ? f.hora : '06:00', boate: Boolean(f.boate) };
}

export function salvarFechamento(entrada = {}) {
  const novo = lerFechamento();
  if (entrada.ativo !== undefined) novo.ativo = Boolean(entrada.ativo);
  if (entrada.hora !== undefined) novo.hora = validarHora(entrada.hora, 'Hora do fechamento');
  if (entrada.boate !== undefined) novo.boate = Boolean(entrada.boate);
  gravar('fechamento', JSON.stringify(novo));
  return lerFechamento();
}

// ---------- Regras da casa (públicas: o app do cliente precisa conhecê-las) ----------

export function lerRegras() {
  const vendas = lerVendas();
  const recados = lerRecados();
  const internet = lerYoutube();
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
    // `ativo` é o efetivo agora (chave ligada E dentro do horário); `habilitado` é só a chave do dono.
    bonus: { ativo: bonusAtivoAgora(), habilitado: lerBool('bonus_ativo'), agenda: lerJson('bonus_agenda'), faixas: lerJson('bonus_faixas') },
    precos: { lancamento: lerPrecoLancamento() },
    sorteio: { a_cada: lerInt('sorteio_a_cada') },
    limite_30min: lerInt('limite_30min'),
    recados: { ativo: recados.ativo, preco: recados.preco, max_caracteres: RECADO_MAX_CARACTERES, telao_online: telasConectadas() > 0 },
    // O cliente só vê a busca na internet se o dono ligou E o yt-dlp está funcionando neste computador.
    youtube: { ativo: internet.ativo && yt.pronto(), preco: internet.preco, max_min: internet.max_min },
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

function validarJanelasDeBonus(janelas) {
  if (!Array.isArray(janelas) || janelas.length > 6) throw new ErroApi(400, 'O horário do bônus aceita até 6 janelas.');
  return janelas.map((j, i) => {
    const inicio = validarHora(j?.inicio, `Janela ${i + 1} do bônus, início`);
    const fim = validarHora(j?.fim, `Janela ${i + 1} do bônus, fim`);
    if (inicio === fim) throw new ErroApi(400, `Janela ${i + 1} do bônus: o início e o fim não podem ser iguais.`);
    return { inicio, fim };
  });
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
  if (bonus.agenda !== undefined) novos.bonus_agenda = JSON.stringify(validarJanelasDeBonus(bonus.agenda));
  const precos = entrada.precos ?? {};
  if (precos.lancamento !== undefined) novos.preco_lancamento = inteiroEntre(precos.lancamento, 0, 20, 'Preço dos lançamentos');
  if (entrada.sorteio?.a_cada !== undefined) novos.sorteio_a_cada = inteiroEntre(entrada.sorteio.a_cada, 0, 500, 'Sorteio (1 a cada quantas músicas)');
  if (entrada.limite_30min !== undefined) novos.limite_30min = inteiroEntre(entrada.limite_30min, 0, 1000, 'Limite de Pix e cartão a cada 30 minutos');
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
