// Mesma regra do servidor: vale a maior faixa que o valor pago alcança (não acumula).
// `bonus.ativo` já vem do servidor como "vale agora" (chave ligada E dentro do horário).
export function bonusPara(valor, bonus) {
  if (!bonus?.ativo || !Number.isFinite(valor)) return 0;
  const faixa = [...bonus.faixas].sort((a, b) => b.valor - a.valor).find((f) => valor >= f.valor);
  return faixa ? faixa.bonus : 0;
}

// "20:00 às 22:00" ou "20:00 às 22:00 e 23:30 às 01:00".
export const textoDasJanelas = (agenda = []) => agenda.map((j) => `${j.inicio} às ${j.fim}`).join(' e ');
