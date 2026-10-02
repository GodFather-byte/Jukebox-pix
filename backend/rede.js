import os from 'node:os';
import { config } from './config.js';

const VIRTUAL = /virtual|vmware|vbox|vethernet|wsl|docker|hyper-v|loopback|tailscale|zerotier|bluetooth/i;

// IP do notebook na rede do WiFi da boate (o que o celular do cliente precisa acessar).
export function ipLocal() {
  const candidatos = [];
  for (const [nome, enderecos] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(nome)) continue;
    for (const endereco of enderecos ?? []) {
      if (endereco.family !== 'IPv4' || endereco.internal) continue;
      const peso = endereco.address.startsWith('192.168.') ? 0 : endereco.address.startsWith('10.') ? 1 : 2;
      candidatos.push({ ip: endereco.address, peso });
    }
  }
  candidatos.sort((a, b) => a.peso - b.peso);
  return candidatos[0]?.ip ?? 'localhost';
}

export const urlDoApp = () => config.urlPublica ?? `http://${ipLocal()}:${config.porta}`;
