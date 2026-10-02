import cron from 'node-cron';
import { avisar } from '../services/alertas.js';
import { fazerBackup, garantirBackupDoDia } from '../services/backup.js';

function executar(funcao) {
  try {
    const backup = funcao();
    if (backup) {
      console.log(`[backup] ${backup.arquivo} (${Math.round(backup.bytes / 1024)} KB)`);
      if (backup.copia && !backup.copia.ok) {
        avisar('backup', `⚠️ O backup de hoje foi feito, mas a cópia extra falhou (${backup.copia.erro}). Confira a pasta ${backup.copia.pasta}.`, { intervaloMin: 12 * 60, chave: 'backup-copia' });
      }
    }
  } catch (erro) {
    console.error('[backup] falhou:', erro.message);
    avisar('backup', `❌ O backup do banco falhou: ${erro.message}`, { intervaloMin: 6 * 60 });
  }
}

export function iniciarBackups() {
  // Na subida: se o notebook estava desligado às 4h, ainda garante o backup de hoje.
  executar(garantirBackupDoDia);
  cron.schedule('0 4 * * *', () => executar(fazerBackup));
}
