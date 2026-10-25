import { useEffect, useState } from 'react';

const CHAVE = 'jukebox_favoritos';
const MAX = 24;

const ler = () => {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE) || '[]');
    if (!Array.isArray(lista)) return [];
    return lista.filter((id) => typeof id === 'string' && id.length > 0 && id.length <= 80).slice(0, MAX);
  } catch {
    return [];
  }
};

const gravar = (ids) => {
  try { localStorage.setItem(CHAVE, JSON.stringify(ids)); } catch { /* modo privado */ }
  window.dispatchEvent(new Event('jukebox:favoritos'));
};

export function alternarFavorito(id) {
  const atual = ler();
  const proximo = atual.includes(id) ? atual.filter((item) => item !== id) : [id, ...atual].slice(0, MAX);
  gravar(proximo);
  return proximo;
}

export function esquecerFavoritos(ids) {
  const remover = new Set(ids);
  const proximo = ler().filter((id) => !remover.has(id));
  gravar(proximo);
  return proximo;
}

export function useFavoritos() {
  const [ids, setIds] = useState(ler);

  useEffect(() => {
    const sync = () => setIds(ler());
    window.addEventListener('jukebox:favoritos', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('jukebox:favoritos', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return {
    ids,
    tem: (id) => ids.includes(id),
    alternar: (id) => setIds(alternarFavorito(id)),
  };
}
