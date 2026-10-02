import { useCallback, useEffect, useState } from 'react';
import { textoDias } from '../../api.js';

const DIA_MS = 24 * 60 * 60 * 1000;

function LinhaCd({ cd, categorias, artistas, chamar, aoMudar }) {
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({});
  const [erro, setErro] = useState('');

  // `preco` vazio = não mexer nos preços atuais (as músicas do CD podem ter preços diferentes).
  const abrir = () => {
    setForm({ titulo: cd.titulo, ano: cd.ano ?? '', categoria_id: cd.categoria_id, artista_id: cd.artista_id, status: cd.status, preco: '' });
    setEditando(true);
  };

  const salvar = async () => {
    try {
      const corpo = { ...form };
      if (corpo.preco === '') delete corpo.preco; else corpo.preco = Number(corpo.preco);
      await chamar(`/admin/cds/${cd.id}`, { metodo: 'PUT', corpo });
      setErro('');
      setEditando(false);
      aoMudar();
    } catch (e) { setErro(e.message); }
  };

  const preco = cd.preco_min === cd.preco_max ? `${cd.preco_max}` : `${cd.preco_min} a ${cd.preco_max}`;

  // Oculto some do app e da playlist automática; dá pra mostrar de novo a qualquer momento.
  const alternarOculto = async () => {
    try {
      await chamar(`/admin/cds/${cd.id}`, { metodo: 'PUT', corpo: { oculto: !cd.oculto } });
      aoMudar();
    } catch (e) { setErro(e.message); }
  };

  const excluir = async () => {
    if (!window.confirm(`Excluir "${cd.titulo}" e todas as ${cd.total_musicas} músicas?\nMúsicas dele que estão na fila serão reembolsadas.`)) return;
    try {
      await chamar(`/admin/cds/${cd.id}`, { metodo: 'DELETE' });
      aoMudar();
    } catch (e) { setErro(e.message); }
  };

  const diasRestantes = Math.max(0, Math.ceil((Date.parse(cd.data_lancamento) - Date.now()) / DIA_MS));

  return (
    <li className="admin-linha">
      <div className="admin-linha-info">
        <strong>{cd.titulo}</strong>
        <span>{cd.artista} · {cd.icone} {cd.categoria} · {cd.total_musicas} músicas · {cd.vezes_tocadas}x tocadas · 💰 {preco} {cd.preco_max === 1 ? 'crédito' : 'créditos'}/música</span>
        <span className={`selo ${cd.status === 'novo' ? 'selo-rosa' : 'selo-ciano'}`}>
          {cd.status === 'novo' ? `🆕 Lançamento · ${textoDias(diasRestantes)}` : 'Na categoria'}
        </span>
        {Boolean(cd.oculto) && <span className="selo selo-rosa">🙈 Oculto do app</span>}
      </div>
      <div className="admin-acoes">
        <button className="btn btn-fantasma btn-pequeno" onClick={editando ? () => setEditando(false) : abrir}>{editando ? 'Fechar' : 'Editar'}</button>
        <button className="btn btn-fantasma btn-pequeno" onClick={alternarOculto}>{cd.oculto ? 'Mostrar' : 'Ocultar'}</button>
        <button className="btn btn-perigo btn-pequeno" onClick={excluir}>Excluir</button>
      </div>

      {editando && (
        <div className="admin-form-inline">
          <label>Título<input className="campo" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} /></label>
          <label>Ano<input className="campo mono" inputMode="numeric" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })} /></label>
          <label>Categoria
            <select className="campo" value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}>
              {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label>Artista
            <select className="campo" value={form.artista_id} onChange={(e) => setForm({ ...form, artista_id: e.target.value })}>
              {artistas.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </label>
          <label>Status
            <select className="campo" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="novo">Lançamento (novo)</option>
              <option value="lancado">Na categoria</option>
            </select>
          </label>
          <label>Preço de TODAS as músicas (créditos)
            <input className="campo mono" inputMode="numeric" placeholder={`não mudar (${preco})`} value={form.preco}
              onChange={(e) => setForm({ ...form, preco: e.target.value.replace(/\D/g, '').slice(0, 2) })} />
          </label>
          <button className="btn" onClick={salvar}>SALVAR</button>
        </div>
      )}
      {erro && <p className="aviso aviso-erro admin-linha-erro">{erro}</p>}
    </li>
  );
}

export default function Biblioteca({ chamar, versao }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      const [biblioteca, cadastros, movimentacoes] = await Promise.all([
        chamar('/admin/biblioteca'),
        chamar('/admin/cadastros'),
        chamar('/admin/movimentacoes'),
      ]);
      setDados({ ...biblioteca, ...cadastros, ...movimentacoes });
    } catch (e) { setErro(e.message); }
  }, [chamar]);

  useEffect(() => { carregar(); }, [carregar, versao]);

  if (erro) return <p className="aviso aviso-erro">{erro}</p>;
  if (!dados) return <div className="estado"><span className="carregando" /></div>;

  return (
    <>
      <h2>{dados.cds.length} CDs na biblioteca</h2>
      <ul className="admin-lista">
        {dados.cds.map((cd) => (
          <LinhaCd key={cd.id} cd={cd} categorias={dados.categorias} artistas={dados.artistas} chamar={chamar} aoMudar={carregar} />
        ))}
      </ul>

      <section className="secao">
        <h2>Histórico de movimentações</h2>
        <ul className="historico">
          {dados.movimentacoes.map((m) => (
            <li key={m.id}>
              <span className="mono">{new Date(m.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <b className={`evento evento-${m.evento}`}>{m.evento}</b>
              <span>{m.titulo}{m.detalhe ? ` — ${m.detalhe}` : ''}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
