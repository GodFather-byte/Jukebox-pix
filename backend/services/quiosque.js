import { db } from '../database.js';
import { criarSessao, obterSessao } from './sessoes.js';

// O jukebox é um aparelho só: todo crédito (Pix, cartão, nota) cai na mesma sessão, a do quiosque.
// Fica guardada no banco para sobreviver ao reinício; se a limpeza apagar, nasce outra.
export function sessaoDoQuiosque() {
  const guardada = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'sessao_quiosque'").get()?.valor;
  const atual = obterSessao(guardada);
  if (atual) return atual;
  const nova = criarSessao();
  db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES ('sessao_quiosque', ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(nova.id);
  return nova;
}
