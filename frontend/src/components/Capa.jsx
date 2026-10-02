import { useState } from 'react';
import { capaUrl } from '../api.js';

// Capa do CD; sem imagem (ou se falhar) mostra o ícone da categoria sobre a cor dela.
export default function Capa({ capa, icone, cor, titulo, className = '' }) {
  const [falhou, setFalhou] = useState(false);

  if (capa && !falhou) {
    return <img className={`capa ${className}`} src={capaUrl(capa)} alt={titulo ?? ''} loading="lazy" onError={() => setFalhou(true)} />;
  }
  return (
    <div className={`capa capa-vazia ${className}`} style={{ '--cor': cor || '#FF1493' }} aria-hidden="true">
      <span>{icone || '🎵'}</span>
    </div>
  );
}
