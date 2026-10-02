// Popula o banco com um acervo FICTÍCIO pra testar o sistema.
// Uso: npm run seed            (recusa se já houver acervo)
//      npm run seed -- --force (APAGA acervo e histórico de reprodução antes)
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { agora, db, novoId, registrarLogCd, slug } from './database.js';

const DIA = 24 * 60 * 60_000;
const ARQUIVO_DEMO = '_demo.wav';

const catalogo = [
  { id: 'funk', nome: 'Funk', icone: '🎤', cor: '#FF1493', artistas: [
    { nome: 'MC Neon', cds: [{ titulo: 'Baile do Neon', ano: 2025 }, { titulo: 'Madrugada Estourada', ano: 2026, novoEmDias: 2 }] },
    { nome: 'DJ Pulso', cds: [{ titulo: 'Pulso Contínuo', ano: 2024 }] },
    { nome: 'Tropa da Quebrada', cds: [{ titulo: 'Fluxo Pesado', ano: 2025 }] },
  ] },
  { id: 'forro', nome: 'Forró', icone: '💃', cor: '#FF8A00', artistas: [
    { nome: 'Sanfona de Ouro', cds: [{ titulo: 'Xote na Fogueira', ano: 2024 }, { titulo: 'Arrasta-pé Total', ano: 2026, novoEmDias: 5 }] },
    { nome: 'Trio Mandacaru', cds: [{ titulo: 'Sertão em Festa', ano: 2025 }] },
  ] },
  { id: 'sertanejo', nome: 'Sertanejo', icone: '🤠', cor: '#F5B700', artistas: [
    { nome: 'Dupla Estrada Real', cds: [{ titulo: 'Poeira e Saudade', ano: 2025 }, { titulo: 'Ao Vivo no Rodeio', ano: 2026 }] },
    { nome: 'Marina Campos', cds: [{ titulo: 'Coração de Peão', ano: 2024 }] },
  ] },
  { id: 'pop', nome: 'Pop', icone: '✨', cor: '#A855F7', artistas: [
    { nome: 'Luna Vega', cds: [{ titulo: 'Brilho Neon', ano: 2025 }] },
    { nome: 'Os Cometas', cds: [{ titulo: 'Verão Infinito', ano: 2024 }, { titulo: 'Órbita', ano: 2026, novoEmDias: 7 }] },
  ] },
  { id: 'trap', nome: 'Trap', icone: '🔥', cor: '#EF4444', artistas: [
    { nome: 'Kaos 77', cds: [{ titulo: 'Sem Freio', ano: 2025 }] },
    { nome: 'Vandal', cds: [{ titulo: 'Rua e Estúdio', ano: 2026 }] },
  ] },
  { id: 'pagode', nome: 'Pagode', icone: '🥁', cor: '#22C55E', artistas: [
    { nome: 'Grupo Roda de Quintal', cds: [{ titulo: 'Samba no Quintal', ano: 2025 }] },
    { nome: 'Renato Cavaco', cds: [{ titulo: 'Cavaquinho de Domingo', ano: 2024 }] },
  ] },
  { id: 'eletronica', nome: 'Eletrônica', icone: '🎧', cor: '#00D4FF', artistas: [
    { nome: 'Synthwave Club', cds: [{ titulo: 'After Hours', ano: 2025 }] },
    { nome: 'Bassline', cds: [{ titulo: 'Drop Zone', ano: 2026, novoEmDias: 1 }] },
  ] },
  { id: 'rock', nome: 'Rock', icone: '🎸', cor: '#6366F1', artistas: [
    { nome: 'Rodovia 116', cds: [{ titulo: 'Pé na Estrada', ano: 2024 }] },
    { nome: 'Eletro Mantra', cds: [{ titulo: 'Amplificador', ano: 2025 }] },
  ] },
];

const INICIOS = ['Noite', 'Fogo', 'Coração', 'Madrugada', 'Saudade', 'Verão', 'Beijo', 'Estrada', 'Luz', 'Sonho', 'Chuva', 'Festa', 'Destino', 'Vício', 'Paixão', 'Ciúme', 'Rolê', 'Domingo'];
const FINAIS = ['de Sábado', 'Sem Fim', 'Proibido', 'na Cidade', 'Perdido', 'em Chamas', 'da Gente', 'Até Amanhecer', 'Sem Você', 'pra Dançar', 'Eterno', 'Demais', 'Vermelho', 'Azul'];

// Gerador pseudo-aleatório com semente: o seed sempre produz o mesmo acervo.
function criarRng(semente) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const rng = criarRng(2026);
const sortear = (lista) => lista[Math.floor(rng() * lista.length)];

function gerarWavDemo(destino, segundos = 8) {
  const taxa = 22050;
  const amostras = taxa * segundos;
  const buffer = Buffer.alloc(44 + amostras * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + amostras * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(taxa, 24);
  buffer.writeUInt32LE(taxa * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(amostras * 2, 40);

  const notas = [261.63, 329.63, 392.0, 523.25];
  for (let i = 0; i < amostras; i++) {
    const t = i / taxa;
    const envelope = Math.min(1, t / 0.2, (segundos - t) / 0.5) * (1 - ((t * 2) % 1) * 0.6);
    const frequencia = notas[Math.floor(t * 2) % notas.length];
    buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequencia * t) * 0.25 * envelope * 32767), 44 + i * 2);
  }
  fs.writeFileSync(destino, buffer);
}

const forcar = process.argv.includes('--force');
const { total } = db.prepare('SELECT (SELECT COUNT(*) FROM categorias) + (SELECT COUNT(*) FROM musicas) AS total').get();

if (total > 0 && !forcar) {
  console.error('O banco já tem acervo. Nada foi alterado.\nUse "npm run seed -- --force" para APAGAR o acervo e o histórico de reprodução e recriar o acervo de teste.');
  process.exit(1);
}

fs.mkdirSync(config.musicasDir, { recursive: true });
gerarWavDemo(path.join(config.musicasDir, ARQUIVO_DEMO));

const agoraMs = Date.now();
const semear = db.transaction(() => {
  if (forcar) {
    db.exec('DELETE FROM historico_reproducao; DELETE FROM musicas; DELETE FROM cds; DELETE FROM artistas; DELETE FROM categorias; DELETE FROM log_cds;');
  }

  const inserirCategoria = db.prepare('INSERT INTO categorias (id, nome, icone, cor) VALUES (?, ?, ?, ?)');
  const inserirArtista = db.prepare('INSERT INTO artistas (id, nome, categoria_id, criado_em) VALUES (?, ?, ?, ?)');
  const inserirCd = db.prepare(`
    INSERT INTO cds (id, titulo, artista_id, categoria_id, ano, status, data_criacao, data_lancamento, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const inserirMusica = db.prepare(`
    INSERT INTO musicas (id, titulo, cd_id, duracao, creditos, arquivo, vezes_tocada, criado_em)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
  `);
  const inserirHistorico = db.prepare('INSERT INTO historico_reproducao (id, musica_id, creditos, tocado_em) VALUES (?, ?, 1, ?)');

  let totalMusicas = 0;
  for (const categoria of catalogo) {
    inserirCategoria.run(categoria.id, categoria.nome, categoria.icone, categoria.cor);

    for (const artista of categoria.artistas) {
      const artistaId = slug(artista.nome);
      inserirArtista.run(artistaId, artista.nome, categoria.id, agora());

      for (const cd of artista.cds) {
        const cdId = novoId();
        const novo = Boolean(cd.novoEmDias);
        const criadoEm = new Date(agoraMs - (novo ? (7 - cd.novoEmDias) * DIA : 30 * DIA)).toISOString();
        const lancaEm = new Date(agoraMs + (novo ? cd.novoEmDias * DIA : -23 * DIA)).toISOString();
        inserirCd.run(cdId, cd.titulo, artistaId, categoria.id, cd.ano, novo ? 'novo' : 'lancado', criadoEm, lancaEm, criadoEm);
        registrarLogCd(cdId, cd.titulo, 'criado', 'seed de teste');

        const usados = new Set();
        const faixas = 5 + Math.floor(rng() * 2);
        for (let i = 0; i < faixas; i++) {
          let titulo;
          do { titulo = `${sortear(INICIOS)} ${sortear(FINAIS)}`; } while (usados.has(titulo));
          usados.add(titulo);

          const vezes = novo ? 0 : Math.floor(rng() ** 3 * 60);
          const musicaId = novoId();
          inserirMusica.run(musicaId, titulo, cdId, 150 + Math.floor(rng() * 110), ARQUIVO_DEMO, vezes, criadoEm);
          totalMusicas += 1;

          // Histórico espalhado pelos últimos 14 dias, pra o painel de estatísticas ter o que mostrar.
          for (let v = 0; v < vezes; v++) {
            inserirHistorico.run(novoId(), musicaId, new Date(agoraMs - Math.floor(rng() * 14 * DIA)).toISOString());
          }
        }
      }
    }
  }
  return totalMusicas;
});

const totalMusicas = semear();
console.log(`Seed concluído: ${catalogo.length} categorias, ${totalMusicas} músicas (todas apontam para ${ARQUIVO_DEMO}, um áudio de teste de 8s).`);
