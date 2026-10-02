// Testa se o provedor de Pix está alcançável daqui (usado pelo diagnóstico e pelo vigia de alertas).
export async function provedorOnline() {
  try {
    await fetch('https://api.mercadopago.com', { method: 'HEAD', signal: AbortSignal.timeout(4000) });
    return true;
  } catch {
    return false;
  }
}
