// Botões da máquina. Os botões físicos ficam ligados numa placa que imita um teclado (encoder de fliperama ou
// Arduino), então cada botão é uma tecla. Só teclas de controle, para as letras ficarem livres na busca.
const PADRAO = {
  ritmo: ['Home', 'F1'],
  anterior: ['ArrowLeft', 'PageUp'],
  proxima: ['ArrowRight', 'PageDown'],
  descer: ['ArrowDown'],
  subir: ['ArrowUp'],
  tocar: ['Enter', ' ', 'NumpadEnter'],
  creditos: ['Insert', 'F2'],
  internet: ['F3'],
  voltar: ['Escape', 'Backspace', 'End'],
};

// A placa de botões das jukeboxes JukeLinux (interfaceteclado.txt da máquina): CD+/CD- nas setas ↑/↓,
// Música+ no D, Música- na seta →, Ritmo no R, Cancelar no * e Menu no / do teclado numérico.
const JUKELINUX = {
  ritmo: ['KeyR', 'F1'],
  anterior: ['ArrowDown'],
  proxima: ['ArrowUp'],
  descer: ['KeyD'],
  subir: ['ArrowRight'],
  tocar: ['Enter', 'NumpadEnter'],
  creditos: ['NumpadDivide', 'F2'],
  internet: ['F3'],
  voltar: ['NumpadMultiply', 'Escape'],
};

export const PERFIS = { padrao: PADRAO, jukelinux: JUKELINUX };
export let TECLAS = PADRAO;

const mapa = (teclas) => new Map(Object.entries(teclas).flatMap(([botao, lista]) => lista.map((t) => [t, botao])));
let porTecla = mapa(PADRAO);
let teclaCredito = null;

// Vem do servidor (/api/quiosque): perfil dos botões e a tecla que vale um pulso de crédito.
export function definirTeclado({ perfil, tecla_credito: credito } = {}) {
  TECLAS = PERFIS[perfil] ?? PADRAO;
  porTecla = mapa(TECLAS);
  teclaCredito = credito || null;
}

// O perfil JukeLinux usa letras (D, R): nele vale o código da tecla, não a letra digitada.
export const botaoDaTecla = (evento) => (TECLAS === PADRAO ? porTecla.get(evento.key) : null)
  ?? porTecla.get(evento.code) ?? null;

export const ehTeclaDeCredito = (evento) => Boolean(teclaCredito) && evento.code === teclaCredito;
