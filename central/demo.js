// Banco de DEMONSTRAÇÃO para apresentar o app: 30 máquinas com 40 dias de movimento inventado (perto de
// R$ 1.800 por mês cada, como a máquina analisada) e os três tipos de acesso. Usa um banco separado
// (dados/demo.db por padrão): nunca rode apontando para o banco de verdade.
//   node demo.js            → cria dados/demo.db
//   CENTRAL_DB=dados/demo.db node server.js
import path from 'node:path';

process.env.CENTRAL_DB ||= path.resolve('dados', 'demo.db');
if (/central\.db$/.test(process.env.CENTRAL_DB)) {
  console.error('Recusado: isto apaga e inventa dados. Use um banco só de demonstração (ex.: dados/demo.db).');
  process.exit(1);
}

const { db, agora, hashToken, novoId } = await import('./db.js');
const { hashSenha, novoTokenDeMaquina } = await import('./auth.js');

const SENHA = process.env.DEMO_SENHA || 'demo-jukebox-2026';
db.exec('DELETE FROM relatorios; DELETE FROM maquinas; DELETE FROM usuarios;');

const usuario = (nome, login, papel) => {
  const id = novoId();
  db.prepare('INSERT INTO usuarios (id, nome, login, senha_hash, papel, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, nome, login, hashSenha(SENHA), papel, agora());
  return id;
};
usuario('Você (dono)', 'dono', 'dono');
const parceiro = usuario('Parceiro (dono das máquinas)', 'parceiro', 'parceiro');
const ponto = usuario('Dono da Boate Estrela', 'boate', 'ponto');

const BOATES = ['Boate Estrela', 'Bar do Zé', 'Toca do Forró', 'Recanto Sertanejo', 'Bar da Praça', 'Pagode da Vila',
  'Arena Show', 'Bar Central', 'Clube do Arrocha', 'Choperia Avenida', 'Boteco do Nego', 'Espaço Brega',
  'Bar Ponto Certo', 'Casa de Shows Lua', 'Bar do Gaúcho', 'Galpão Funk', 'Bar Esquina', 'Cantinho do Samba',
  'Bar Beira Rio', 'Rancho Bar', 'Bar Bom Gosto', 'Pub da Esquina', 'Bar Encontro', 'Boate Neon', 'Bar Amigos',
  'Forró do Pé', 'Bar Real', 'Bar da Serra', 'Bar Sol Nascente', 'Bar Parada Obrigatória'];
const MUSICAS = [['300 No 7', 'MC GP'], ['Lets go 4', 'Funk 2024'], ['Toma Pipoca', 'MC Pipokinha'], ['A Maior Saudade', 'Henrique e Juliano'],
  ['Rasteira', 'Henrique e Juliano'], ['Fumadão', 'MC GW'], ['365 Dias', "MC's"], ['Coração de Rua', 'Henrique e Juliano']];

const diaLocal = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
let semente = 7;
const aleatorio = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };

BOATES.forEach((local, i) => {
  const id = novoId();
  const nome = `Máquina ${224 + i}`;
  db.prepare('INSERT INTO maquinas (id, nome, local, parceiro_id, ponto_id, token_hash, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, nome, local, parceiro, i === 0 ? ponto : null, hashToken(novoTokenDeMaquina()), agora());

  const porte = 0.6 + aleatorio() * 0.9; // umas faturam mais que outras
  const dias = [];
  for (let d = 39; d >= 0; d--) {
    const data = new Date(Date.now() - d * 86_400_000);
    const fimDeSemana = [5, 6].includes(data.getDay()) ? 1.8 : 1;
    const entrou = d === 0 ? Math.round(30 * porte * aleatorio()) : Math.round(60 * porte * fimDeSemana * (0.6 + aleatorio() * 0.8));
    const pix = Math.round(entrou * (0.5 + aleatorio() * 0.2));
    const cartao = Math.round((entrou - pix) * 0.15);
    dias.push({ dia: diaLocal(data), entrou, pix, cartao, nota: entrou - pix - cartao, tocadas: Math.round(entrou * 0.9) });
  }
  const soma = (lista, campo) => lista.reduce((t, x) => t + x[campo], 0);
  const parcialDias = dias.slice(-6);
  const montar = (lista, desde) => {
    const entrou = soma(lista, 'entrou');
    return { desde, entrou, por_metodo: { pix: soma(lista, 'pix'), nota: soma(lista, 'nota'), cartao: soma(lista, 'cartao') }, tocadas: soma(lista, 'tocadas'), gratis: Math.round(entrou * 0.3), empresa: entrou / 2, ponto: entrou / 2 };
  };
  const fechamentoEm = new Date(Date.now() - 6 * 86_400_000).toISOString();
  const anterior = montar(dias.slice(-13, -6), new Date(Date.now() - 13 * 86_400_000).toISOString());
  const relatorio = {
    versao: '1.0.0',
    enviado_em: agora(),
    nome_local: local,
    relogio: {
      porcentagem_empresa: 50,
      total: montar(dias),
      parcial: montar(parcialDias, fechamentoEm),
      ultimo_fechamento: { em: fechamentoEm, ...anterior },
    },
    dias,
    top: MUSICAS.slice(0, 5).map(([titulo, artista], n) => ({ titulo, artista, vezes: Math.round((40 - n * 6) * porte) })),
    status: { noteiro: { ativo: true, conectado: true }, disco_livre_pct: Math.round(40 + aleatorio() * 40) },
  };
  // Duas máquinas "sem enviar" para mostrar o alerta.
  const horasAtras = i === 7 || i === 19 ? 9 + i : aleatorio() * 5;
  const quando = new Date(Date.now() - horasAtras * 3_600_000).toISOString();
  const json = JSON.stringify(relatorio);
  db.prepare('INSERT INTO relatorios (maquina_id, recebido_em, dados) VALUES (?, ?, ?)').run(id, quando, json);
  db.prepare('UPDATE maquinas SET ultimo_em = ?, ultimo = ? WHERE id = ?').run(quando, json, id);
});

console.log(`Demonstração pronta em ${process.env.CENTRAL_DB}: ${BOATES.length} máquinas.`);
console.log(`Logins (senha "${SENHA}"): dono · parceiro · boate`);
