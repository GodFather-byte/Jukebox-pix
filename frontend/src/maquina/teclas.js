// Botões da máquina. Os botões físicos ficam ligados numa placa que imita um teclado (encoder de fliperama ou
// Arduino), então cada botão é uma tecla. Só teclas de controle, para as letras ficarem livres na busca.
export const TECLAS = {
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

const PORTECLA = new Map(Object.entries(TECLAS).flatMap(([botao, teclas]) => teclas.map((t) => [t, botao])));

export const botaoDaTecla = (evento) => PORTECLA.get(evento.key) ?? PORTECLA.get(evento.code) ?? null;
