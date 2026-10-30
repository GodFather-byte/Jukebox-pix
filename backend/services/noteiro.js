import { config } from '../config.js';
import * as alertas from './alertas.js';
import { registrarNota } from './pagamentos.js';
import { sessaoDoQuiosque } from './quiosque.js';

// Noteiro ligado por uma placa na porta serial (Arduino ou a interface do próprio noteiro). Cada linha recebida é:
//   "10"  -> uma nota de R$ 10 (a placa já sabe o valor)
//   "P"   -> um pulso; pulsos seguidos viram uma nota só (NOTEIRO_REAIS_POR_PULSO reais cada)
// Protocolo e exemplo de placa em docs/NOTEIRO.md.
const { noteiro: cfg } = config;
const JANELA_PULSOS_MS = 600; // pulsos de uma mesma nota chegam em sequência; depois disso a nota fechou
const RECONECTAR_MS = 10_000;

let estado = { tipo: cfg.tipo, porta: cfg.porta, conectado: false, erro: null, ultima: null };
let porta = null;
let pulsos = 0;
let relogioPulsos = null;
let encerrando = false;

export const situacaoNoteiro = () => ({
  ...estado,
  ativo: cfg.tipo !== 'desligado',
  conectado: cfg.tipo === 'teclado' || estado.conectado, // a tecla chega pela tela: não há porta para cair
});

// Entradas dos últimos 10 minutos, para o alerta de dinheiro demais. Não bloqueia: nota aceita é dinheiro de
// verdade e não volta, então o crédito entra e o dono é avisado para conferir.
const JANELA_ALERTA_MS = 10 * 60_000;
let recentes = [];

function vigiar(valor) {
  const agora = Date.now();
  recentes = [...recentes.filter((e) => agora - e.em < JANELA_ALERTA_MS), { valor, em: agora }];
  const total = recentes.reduce((soma, e) => soma + e.valor, 0);
  if (config.creditoAlerta10Min > 0 && total > config.creditoAlerta10Min) {
    console.warn(`[noteiro] R$ ${total} em 10 minutos: acima do normal`);
    alertas.avisar('credito', `🚨 Entraram R$ ${total} em dinheiro nos últimos 10 minutos (o normal é até R$ ${config.creditoAlerta10Min}). Confira a máquina: alguém com um teclado ou a placa com defeito?`, { intervaloMin: 30 });
    return true;
  }
  return false;
}

// Credita a nota na sessão do jukebox. Usado pela placa e pelo botão de teste.
export function creditarNota(valor) {
  const pagamento = registrarNota(sessaoDoQuiosque().id, valor);
  estado.ultima = { valor, em: new Date().toISOString(), suspeito: vigiar(valor) };
  return pagamento;
}

function fecharPulsos() {
  relogioPulsos = null;
  const valor = Math.round(pulsos * cfg.reaisPorPulso);
  pulsos = 0;
  if (valor > 0) creditarSeguro(valor);
}

function creditarSeguro(valor) {
  try {
    creditarNota(valor);
  } catch (erro) {
    console.error(`[noteiro] não foi possível creditar R$ ${valor}: ${erro.message}`);
  }
}

// Um pulso que chegou como tecla na tela do jukebox (NOTEIRO=teclado). Agrupa igual aos pulsos da serial.
export function pulsoDeTeclado() {
  if (cfg.tipo !== 'teclado') return null;
  return lerLinha('P');
}

// Interpreta uma linha da placa. Exportada para os testes.
export function lerLinha(linha) {
  const texto = String(linha).trim().toUpperCase();
  if (texto === 'P') {
    pulsos += 1;
    clearTimeout(relogioPulsos);
    relogioPulsos = setTimeout(fecharPulsos, JANELA_PULSOS_MS);
    return 'pulso';
  }
  if (/^\d{1,3}$/.test(texto) && Number(texto) > 0) {
    creditarSeguro(Number(texto));
    return 'nota';
  }
  return null; // linha de diagnóstico da placa: ignora
}

async function conectar() {
  if (encerrando) return;
  try {
    // Só carrega a biblioteca da serial quando há noteiro: o resto do jukebox não depende dela.
    const { SerialPort } = await import('serialport');
    const { ReadlineParser } = await import('@serialport/parser-readline');
    porta = new SerialPort({ path: cfg.porta, baudRate: cfg.baud });
    porta.pipe(new ReadlineParser({ delimiter: '\n' })).on('data', lerLinha);
    porta.on('open', () => {
      estado = { ...estado, conectado: true, erro: null };
      console.log(`[noteiro] conectado em ${cfg.porta}`);
    });
    const perdeu = (erro) => {
      estado = { ...estado, conectado: false, erro: erro?.message || 'desconectado' };
      porta = null;
      if (!encerrando) setTimeout(conectar, RECONECTAR_MS).unref();
    };
    porta.on('error', perdeu);
    porta.on('close', () => perdeu());
  } catch (erro) {
    estado = { ...estado, conectado: false, erro: erro.message };
    if (!encerrando) setTimeout(conectar, RECONECTAR_MS).unref();
  }
}

export function iniciarNoteiro() {
  if (cfg.tipo === 'desligado' || cfg.tipo === 'teclado') return; // teclado: os pulsos chegam por /api/quiosque/pulso
  if (cfg.tipo !== 'serial' || !cfg.porta) {
    estado.erro = 'Configure NOTEIRO=serial e NOTEIRO_PORTA (ex.: COM3).';
    console.warn(`[noteiro] ${estado.erro}`);
    return;
  }
  conectar();
}

export function encerrarNoteiro() {
  encerrando = true;
  if (relogioPulsos) {
    clearTimeout(relogioPulsos);
    fecharPulsos();
  }
  try { porta?.close(); } catch { /* já fechada */ }
}
