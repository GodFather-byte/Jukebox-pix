import { useEffect, useState } from 'react';

export default function NovoCd({ chamar, aoCriar }) {
  const [cadastros, setCadastros] = useState({ categorias: [], artistas: [] });
  const [form, setForm] = useState({ titulo: '', ano: new Date().getFullYear(), categoria_id: '', artista_id: '', artista_nome: '', status: 'novo' });
  const [capa, setCapa] = useState(null);
  const [arquivos, setArquivos] = useState([]);
  const [titulos, setTitulos] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState(null);

  useEffect(() => {
    chamar('/admin/cadastros').then((c) => {
      setCadastros(c);
      setForm((f) => ({ ...f, categoria_id: f.categoria_id || c.categorias[0]?.id || '' }));
    }).catch(() => {});
  }, [chamar]);

  const artistasDaCategoria = cadastros.artistas.filter((a) => a.categoria_id === form.categoria_id);
  const novoArtista = form.artista_id === '';

  async function enviar(e) {
    e.preventDefault();
    setMensagem(null);
    setEnviando(true);
    try {
      const corpo = new FormData();
      corpo.append('titulo', form.titulo);
      corpo.append('ano', form.ano);
      corpo.append('categoria_id', form.categoria_id);
      corpo.append('status', form.status);
      if (novoArtista) corpo.append('artista_nome', form.artista_nome);
      else corpo.append('artista_id', form.artista_id);
      corpo.append('titulos', JSON.stringify(arquivos.map((_, i) => titulos[i] ?? '')));
      if (capa) corpo.append('capa', capa);
      arquivos.forEach((arquivo) => corpo.append('arquivos', arquivo));

      const resposta = await chamar('/admin/cds/adicionar', { metodo: 'POST', corpo });
      setMensagem({ tipo: 'ok', texto: `CD criado com ${resposta.total_musicas} músicas. Ele aparece em LANÇAMENTOS e vai para a categoria sozinho.` });
      setForm((f) => ({ ...f, titulo: '', artista_nome: '' }));
      setCapa(null);
      setArquivos([]);
      setTitulos({});
      e.target.reset();
      aoCriar();
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={enviar}>
      <h2>Adicionar CD</h2>

      <label>Título do CD
        <input className="campo" required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
      </label>

      <div className="admin-form-linha">
        <label>Categoria
          <select className="campo" required value={form.categoria_id} onChange={(e) => setForm({ ...form, categoria_id: e.target.value, artista_id: '' })}>
            {cadastros.categorias.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
          </select>
        </label>
        <label>Ano
          <input className="campo mono" inputMode="numeric" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
        </label>
      </div>

      <label>Artista
        <select className="campo" value={form.artista_id} onChange={(e) => setForm({ ...form, artista_id: e.target.value })}>
          <option value="">➕ Novo artista…</option>
          {artistasDaCategoria.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </select>
      </label>
      {novoArtista && (
        <label>Nome do novo artista
          <input className="campo" required value={form.artista_nome} onChange={(e) => setForm({ ...form, artista_nome: e.target.value })} />
        </label>
      )}

      <label>Entra como
        <select className="campo" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="novo">Lançamento (7 dias em LANÇAMENTOS)</option>
          <option value="lancado">Direto na categoria</option>
        </select>
      </label>

      <label>Capa (JPG, PNG ou WebP — opcional)
        <input className="campo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCapa(e.target.files[0] ?? null)} />
      </label>

      <label>Músicas (MP3, M4A, WAV, FLAC, OGG)
        <input className="campo" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg" multiple required
          onChange={(e) => { setArquivos([...e.target.files]); setTitulos({}); }} />
      </label>

      {arquivos.length > 0 && (
        <div className="admin-faixas">
          <small>Título e duração são lidos do arquivo. Preencha só pra corrigir.</small>
          {arquivos.map((arquivo, i) => (
            <input key={`${arquivo.name}-${i}`} className="campo" placeholder={arquivo.name}
              value={titulos[i] ?? ''} onChange={(e) => setTitulos({ ...titulos, [i]: e.target.value })} />
          ))}
        </div>
      )}

      {mensagem && <p className={`aviso ${mensagem.tipo === 'erro' ? 'aviso-erro' : 'aviso-ok'}`}>{mensagem.texto}</p>}

      <button className="btn btn-grande" disabled={enviando || !arquivos.length}>
        {enviando ? 'ENVIANDO… (pode demorar)' : `ADICIONAR CD${arquivos.length ? ` COM ${arquivos.length} MÚSICA${arquivos.length > 1 ? 'S' : ''}` : ''}`}
      </button>
    </form>
  );
}
