import { trechos } from '../destaque.js';

export default function Destaque({ texto, termo }) {
  return trechos(texto, termo).map((parte, i) => (
    parte.marca ? <mark key={i}>{parte.texto}</mark> : <span key={i}>{parte.texto}</span>
  ));
}
