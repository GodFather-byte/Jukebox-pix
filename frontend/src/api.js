export async function api(caminho, { metodo = 'GET', corpo, token } = {}) {
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo && !(corpo instanceof FormData) && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: !corpo ? undefined : corpo instanceof FormData ? corpo : JSON.stringify(corpo),
    });
  } catch {
    throw Object.assign(new Error('Sem conexão com a jukebox. Confira o WiFi.'), { status: 0 });
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw Object.assign(new Error(dados.erro || 'Algo deu errado. Tente de novo.'), {
      status: resposta.status,
      codigo: dados.codigo,
    });
  }
  return dados;
}

export const capaUrl = (capa) => (capa ? `/capas/${capa}` : null);

export function formatarDuracao(segundos) {
  if (!segundos) return '--:--';
  const m = Math.floor(segundos / 60);
  const s = String(Math.round(segundos % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

export const formatarReais = (valor) =>
  Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function textoDias(dias) {
  if (dias <= 0) return 'Sai hoje';
  return dias === 1 ? 'Sai em 1 dia' : `Sai em ${dias} dias`;
}

// Baixa um arquivo que exige o token do admin (um link comum não consegue enviar o cabeçalho).
export async function baixar(caminho, token, nomeArquivo) {
  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw Object.assign(new Error('Sem conexão com a jukebox.'), { status: 0 });
  }
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => ({}));
    throw Object.assign(new Error(dados.erro || 'Não foi possível baixar o arquivo.'), { status: resposta.status });
  }

  const url = URL.createObjectURL(await resposta.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}