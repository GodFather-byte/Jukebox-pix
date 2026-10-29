// Botões da máquina. Os botões físicos ficam ligados numa placa que imita um teclado (encoder de fliperama ou
// Arduino), então cada botão é uma tecla. Várias teclas por botão para servir às placas mais comuns.
export const TECLAS = {
  ritmo: ['r', 'R', 'Home', 'F1'],
  anterior: ['ArrowLeft', 'a', 'A', 'PageUp'],
  proxima: ['ArrowRight', 'd', 'D', 'PageDown'],
  descer: ['ArrowDown', 's', 'S'],
  subir: ['ArrowUp', 'w', 'W'],
  tocar: ['Enter', ' ', 't', 'T', 'NumpadEnter'],
  creditos: ['c', 'C', 'Insert', 'F2'],
  voltar: ['Escape', 'Backspace'],
};

const PORTECLA = new Map(Object.entries(TECLAS).flatMap(([botao, teclas]) => teclas.map((t) => [t, botao])));

export const botaoDaTecla = (evento) => PORTECLA.get(evento.key) ?? PORTECLA.get(evento.code) ?? null;
