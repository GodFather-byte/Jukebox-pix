// Mesma regra do servidor: vale a maior faixa que o valor pago alcança (não acumula).
export function bonusPara(valor, bonus) {
  if (!bonus?.ativo || !Number.isFinite(valor)) return 0;
  const faixa = [...bonus.faixas].sort((a, b) => b.valor - a.valor).find((f) => valor >= f.valor);
  return faixa ? faixa.bonus : 0;
}
