import { useEffect, useState } from 'react';

// Teclado na tela para o jukebox de toque: aparece quando um campo de texto recebe o foco e digita nele.
// Funciona com qualquer <input>/<textarea> das telas (busca, recado, vale) sem cada uma precisar saber dele.
const LINHAS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '!', '?'],
];
const TIPOS_TEXTO = new Set(['text', 'search', '']);

const ehCampoDeTexto = (el) => el instanceof HTMLTextAreaElement
  || (el instanceof HTMLInputElement && TIPOS_TEXTO.has(el.getAttribute('type') ?? '') && !el.readOnly);

// Escreve como se fosse o teclado de verdade, para o React perceber a mudança.
function escrever(el, valor) {
  const prototipo = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototipo, 'value').set.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export default function Teclado() {
  const [campo, setCampo] = useState(null);
  const [maiusculas, setMaiusculas] = useState(true);

  useEffect(() => {
    const aoFocar = (e) => { if (ehCampoDeTexto(e.target)) setCampo(e.target); };
    const aoSair = () => setTimeout(() => { if (!ehCampoDeTexto(document.activeElement)) setCampo(null); }, 0);
    document.addEventListener('focusin', aoFocar);
    document.addEventListener('focusout', aoSair);
    return () => { document.removeEventListener('focusin', aoFocar); document.removeEventListener('focusout', aoSair); };
  }, []);

  if (!campo || !document.contains(campo)) return null;

  const tecla = (texto) => {
    const limite = campo.maxLength > 0 ? campo.maxLength : Infinity;
    if (campo.value.length >= limite) return;
    escrever(campo, campo.value + (maiusculas ? texto : texto.toLowerCase()));
  };
  const apagar = () => escrever(campo, campo.value.slice(0, -1));
  const confirmar = () => {
    if (campo.form) campo.form.requestSubmit();
    campo.blur();
  };
  // Tocar no teclado não pode tirar o foco do campo.
  const segurar = (e) => e.preventDefault();

  return (
    <div className="qk-teclado" onPointerDown={segurar} onMouseDown={segurar} role="group" aria-label="Teclado">
      {LINHAS.map((linha) => (
        <div key={linha.join('')} className="qk-teclado-linha">
          {linha.map((t) => (
            <button key={t} type="button" tabIndex={-1} onClick={() => tecla(t)}>{maiusculas ? t : t.toLowerCase()}</button>
          ))}
        </div>
      ))}
      <div className="qk-teclado-linha">
        <button type="button" tabIndex={-1} className="largo" onClick={() => setMaiusculas((m) => !m)}>{maiusculas ? 'abc' : 'ABC'}</button>
        <button type="button" tabIndex={-1} className="espaco" onClick={() => tecla(' ')}>espaço</button>
        <button type="button" tabIndex={-1} className="largo" onClick={apagar} aria-label="Apagar">⌫</button>
        <button type="button" tabIndex={-1} className="largo destaque" onClick={confirmar}>OK</button>
        <button type="button" tabIndex={-1} className="largo" onClick={() => campo.blur()} aria-label="Esconder teclado">⌄</button>
      </div>
    </div>
  );
}
