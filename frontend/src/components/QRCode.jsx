import { useState } from 'react';

// QR já vem como imagem do servidor. `texto` é o Pix copia-e-cola (com botão de copiar).
export default function QRCode({ imagem, texto, alt = 'QR code' }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // clipboard exige HTTPS; no WiFi local (http) usamos o método antigo
      const campo = document.createElement('textarea');
      campo.value = texto;
      document.body.appendChild(campo);
      campo.select();
      document.execCommand('copy');
      campo.remove();
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="qrcode">
      <img src={imagem} alt={alt} width="260" height="260" />
      {texto && (
        <>
          <code className="qrcode-texto">{texto}</code>
          <button className="btn btn-ciano" onClick={copiar}>{copiado ? '✔ COPIADO' : 'COPIAR CÓDIGO PIX'}</button>
        </>
      )}
    </div>
  );
}
