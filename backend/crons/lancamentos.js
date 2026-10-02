import cron from 'node-cron';
import { db, agora, registrarLogCd } from '../database.js';
import { emitirTodos } from '../events.js';

export function moverLancamentos() {
  const cds = db.prepare("SELECT id, titulo FROM cds WHERE status = 'novo' AND data_lancamento <= ?").all(agora());
  if (!cds.length) return 0;

  db.transaction(() => {
    for (const cd of cds) {
      db.prepare("UPDATE cds SET status = 'lancado', data_lancamento = ? WHERE id = ?").run(agora(), cd.id);
      registrarLogCd(cd.id, cd.titulo, 'lancado', 'Saiu de LANÇAMENTOS e foi para a categoria');
    }
  })();

  console.log(`[lancamentos] ${cds.length} CD(s) movido(s) para as categorias`);
  emitirTodos('lancamentos');
  return cds.length;
}

export function iniciarCronLancamentos() {
  // Roda já na subida: se o notebook estava desligado à meia-noite, recupera o atraso.
  moverLancamentos();
  cron.schedule('0 0 * * *', moverLancamentos);
}
