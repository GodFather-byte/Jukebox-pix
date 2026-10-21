// O processo utilitário já inclui Node; não depende de ELECTRON_RUN_AS_NODE nem de Node instalado.
import('../backend/server.js').catch(() => {
  process.parentPort.postMessage({ type: 'startup-error', code: 'CONFIG_OR_RUNTIME' });
  process.exit(1);
});
