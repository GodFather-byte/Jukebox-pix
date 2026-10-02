import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const mostrar = useCallback((texto, { tipo = 'info', acao } = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((atuais) => [...atuais.slice(-2), { id, texto, tipo, acao }]);
    setTimeout(() => setToasts((atuais) => atuais.filter((t) => t.id !== id)), acao ? 6000 : 3200);
  }, []);

  return (
    <ToastContext.Provider value={mostrar}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tipo}`}>
            <span>{t.texto}</span>
            {t.acao && (
              <button
                className="toast-acao"
                onClick={() => {
                  t.acao.aoClicar();
                  setToasts((atuais) => atuais.filter((x) => x.id !== t.id));
                }}
              >
                {t.acao.texto}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
