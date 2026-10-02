import cron from 'node-cron';
import { fazerBackup, garantirBackupDoDia } from '../services/backup.js';

function executar(funcao) {
  try {
    const backup = funcao();
    if (backup) console.log(`[backup] ${backup.arquivo} (${Math.round(backup.bytes / 1024)} KB)`);
  } catch (erro) {
    console.error('[backup] falhou:', erro.message);
  }
}

export function iniciarBackups() {
  // Na subida: se o notebook estava desligado às 4h, ainda garante o backup de hoje.
  executar(garantirBackupDoDia);
  cron.schedule('0 4 * * *', () => executar(fazerBackup));
}
