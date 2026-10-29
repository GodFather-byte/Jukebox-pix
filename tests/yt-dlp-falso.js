// yt-dlp de mentira, só para o teste da capa. Não acessa a rede.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const valor = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : null;
};

if (args.includes('--version')) {
  console.log('2026.10.25');
  process.exit(0);
}
if (args.includes('--help')) {
  console.log('yt-dlp falso para testes');
  process.exit(0);
}

const busca = args.find((arg) => arg.startsWith('ytsearch'));
if (busca) {
  const termo = busca.slice(busca.indexOf(':') + 1) || 'Evidencias';
  console.log(JSON.stringify({
    id: 'abcdefghijk',
    title: `${termo} (Official Video)`,
    channel: 'Chitaozinho',
    duration: 30,
    live_status: 'not_live',
  }));
  process.exit(0);
}

if (args.includes('--dump-single-json')) {
  const id = new URL(args.at(-1)).searchParams.get('v');
  console.log(JSON.stringify({
    id,
    title: 'Evidencias (Official Video)',
    channel: 'Chitaozinho',
    duration: 30,
    live_status: 'not_live',
  }));
  process.exit(0);
}

function pedacoPng(tipo, dados) {
  const nome = Buffer.from(tipo);
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([nome, dados])) >>> 0, 0);
  return Buffer.concat([tamanho, nome, dados, crc]);
}

// Quadrado rosa com um círculo, para a capa aparecer de verdade na tela.
function pngCapa(lado = 96) {
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(lado, 0);
  cabecalho.writeUInt32BE(lado, 4);
  cabecalho[8] = 8;
  cabecalho[9] = 6;
  const cru = Buffer.alloc((lado * 4 + 1) * lado);
  const raio = lado * 0.28;
  for (let y = 0; y < lado; y += 1) {
    const linha = y * (lado * 4 + 1);
    for (let x = 0; x < lado; x += 1) {
      const o = linha + 1 + x * 4;
      const disco = (x - lado / 2) ** 2 + (y - lado / 2) ** 2 < raio ** 2;
      cru[o] = disco ? 10 : 255;
      cru[o + 1] = disco ? 14 : 20;
      cru[o + 2] = disco ? 39 : 147;
      cru[o + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pedacoPng('IHDR', cabecalho),
    pedacoPng('IDAT', zlib.deflateSync(cru)),
    pedacoPng('IEND', Buffer.alloc(0)),
  ]);
}

function wav(segundos) {
  const taxa = 8000;
  const amostras = Math.round(segundos * taxa);
  const dados = Buffer.alloc(amostras * 2);
  const buf = Buffer.alloc(44 + dados.length);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dados.length, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(taxa, 24);
  buf.writeUInt32LE(taxa * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dados.length, 40);
  dados.copy(buf, 44);
  return buf;
}

if (args.includes('--write-thumbnail')) {
  const destino = valor('-o').replace('%(ext)s', process.env.CAPA_RUIM === '1' ? 'jpg' : 'png');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, process.env.CAPA_RUIM === '1' ? Buffer.from('isso nao e imagem, e um texto qualquer maior que o minimo') : pngCapa());
  process.exit(0);
}

if (args.includes('-f')) {
  const destino = valor('-o').replace('%(ext)s', 'wav');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, wav(40));
  process.exit(0);
}

console.error(`comando nao reconhecido: ${args.join(' ')}`);
process.exit(1);
