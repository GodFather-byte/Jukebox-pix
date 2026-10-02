import { useCallback, useEffect, useState } from 'react';

function LinhaCategoria({ categoria, chamar, aoMudar }) {
  const [form, setForm] = useState(categoria);
  const [erro, setErro] = useState('');
  const alterado = JSON.stringify(form) !== JSON.stringify(categoria);

  const salvar = () => chamar(`/admin/categorias/${categoria.id}`, { metodo: 'PUT', corpo: form }).then(aoMudar).catch((e) => setErro(e.message));

  return (
    <li className="admin-linha-edicao">
      <input className="campo campo-icone" value={form.icone ?? ''} onChange={(e) => setForm({ ...form, icone: e.target.value })} aria-label="Ícone" />
      <input className="campo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} aria-label="Nome" />
      <input className="campo-cor" type="color" value={form.cor ?? '#FF1493'} onChange={(e) => setForm({ ...form, cor: e.target.value })} aria-label="Cor" />
      <button className="btn btn-pequeno" onClick={salvar} disabled={!alterado}>Salvar</button>
      {erro && <small className="erro-inline">{erro}</small>}
    </li>
  );
}

function LinhaArtista({ artista, categorias, chamar, aoMudar }) {
  const [form, setForm] = useState(artista);
  const [erro, setErro] = useState('');
  const alterado = form.nome !== artista.nome || form.categoria_id !== artista.categoria_id;

  const salvar = () => chamar(`/admin/artistas/${artista.id}`, { metodo: 'PUT', corpo: { nome: form.nome, categoria_id: form.categoria_id } }).then(aoMudar).catch((e) => setErro(e.message));

  return (
    <li className="admin-linha-edicao">
      <input className="campo" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} aria-label="Nome" />
      <select className="campo" value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value })} aria-label="Categoria">
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      </select>
      <button className="btn btn-pequeno" onClick={salvar} disabled={!alterado}>Salvar</button>
      {erro && <small className="erro-inline">{erro}</small>}
    </li>
  );
}

export default function Cadastros({ chamar }) {
  const [dados, setDados] = useState(null);
  const [novaCategoria, setNovaCategoria] = useState({ nome: '', icone: '🎵', cor: '#FF1493' });
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => chamar('/admin/cadastros').then(setDados).catch((e) => setErro(e.message)), [chamar]);
  useEffect(() => { carregar(); }, [carregar]);

  async function criarCategoria(e) {
    e.preventDefault();
    setErro('');
    try {
      await chamar('/admin/categorias', { metodo: 'POST', corpo: novaCategoria });
      setNovaCategoria({ nome: '', icone: '🎵', cor: '#FF1493' });
      carregar();
    } catch (erroApi) { setErro(erroApi.message); }
  }

  if (!dados) return erro ? <p className="aviso aviso-erro">{erro}</p> : <div className="estado"><span className="carregando" /></div>;

  return (
    <>
      <h2>Categorias</h2>
      <ul className="admin-lista">
        {dados.categorias.map((c) => <LinhaCategoria key={`${c.id}-${c.nome}-${c.icone}-${c.cor}`} categoria={c} chamar={chamar} aoMudar={carregar} />)}
      </ul>
      <form className="admin-linha-edicao" onSubmit={criarCategoria}>
        <input className="campo campo-icone" value={novaCategoria.icone} onChange={(e) => setNovaCategoria({ ...novaCategoria, icone: e.target.value })} aria-label="Ícone" />
        <input className="campo" placeholder="Nova categoria" required value={novaCategoria.nome} onChange={(e) => setNovaCategoria({ ...novaCategoria, nome: e.target.value })} />
        <input className="campo-cor" type="color" value={novaCategoria.cor} onChange={(e) => setNovaCategoria({ ...novaCategoria, cor: e.target.value })} aria-label="Cor" />
        <button className="btn btn-pequeno">Criar</button>
      </form>
      {erro && <p className="aviso aviso-erro">{erro}</p>}

      <h2>Artistas</h2>
      <p className="nota">Artistas novos são criados ao adicionar um CD.</p>
      <ul className="admin-lista">
        {dados.artistas.map((a) => <LinhaArtista key={`${a.id}-${a.nome}-${a.categoria_id}`} artista={a} categorias={dados.categorias} chamar={chamar} aoMudar={carregar} />)}
      </ul>
    </>
  );
}
