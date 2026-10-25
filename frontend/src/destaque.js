const semAcento = (texto) => String(texto ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Parte o texto em trechos, marcando o que casa com o termo mesmo sem acento ("forro" acha "Forró").
export function trechos(texto, termo) {
  const bruto = String(texto ?? '');
  const alvos = [...new Set(
    String(termo ?? '').trim().split(/\s+/).map(semAcento).filter((p) => p.length >= 2),
  )];
  if (!bruto || alvos.length === 0) return [{ texto: bruto, marca: false }];

  let base = '';
  const origem = [];
  for (let i = 0; i < bruto.length;) {
    const ch = String.fromCodePoint(bruto.codePointAt(i));
    for (const c of semAcento(ch)) {
      base += c;
      origem.push(i);
    }
    i += ch.length;
  }
  origem.push(bruto.length);

  const letra = (i) => i >= 0 && i < bruto.length && /[\p{L}\p{N}]/u.test(bruto[i]);
  const marcas = Array(bruto.length).fill(false);
  for (const alvo of alvos) {
    let de = 0;
    while (de <= base.length - alvo.length) {
      const achou = base.indexOf(alvo, de);
      if (achou < 0) break;
      // Estende até a palavra inteira: "chita" marca "Chitãozinho", não só o pedaço.
      let ini = origem[achou];
      let fim = origem[achou + alvo.length];
      while (letra(ini - 1)) ini -= 1;
      while (letra(fim)) fim += 1;
      for (let i = ini; i < fim; i++) marcas[i] = true;
      de = achou + Math.max(1, alvo.length);
    }
  }

  const partes = [];
  let atual = '';
  let flag = marcas[0] ?? false;
  for (let i = 0; i < bruto.length; i++) {
    if (marcas[i] !== flag) {
      partes.push({ texto: atual, marca: flag });
      atual = '';
      flag = marcas[i];
    }
    atual += bruto[i];
  }
  if (atual) partes.push({ texto: atual, marca: flag });
  return partes.length ? partes : [{ texto: bruto, marca: false }];
}
