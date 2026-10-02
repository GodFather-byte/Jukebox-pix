import { useCallback, useEffect, useRef, useState } from 'react';

const dataBr = (dia) => (dia ? dia.split('-').reverse().join('/') : null);
const soNumeros = (valor, tamanho = 3) => valor.replace(/\D/g, '').slice(0, tamanho);

function Mensagem({ mensagem }) {
  return mensagem ? <p className={`aviso ${mensagem.tipo === 'erro' ? 'aviso-erro' : 'aviso-ok'}`}>{mensagem.texto}</p> : null;
}

// ---------- Vinhetas de áudio ----------

function Vinhetas({ chamar, ouvirArquivo }) {
  const [dados, setDados] = useState(null);
  const [config, setConfig] = useState({ ativo: false, a_cada: '5' });
  const [titulo, setTitulo] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [tocando, setTocando] = useState(null);
  const audio = useRef(null);
  const campoArquivo = useRef(null);

  const carregar = useCallback(async () => {
    const d = await chamar('/admin/vinhetas');
    setDados(d);
    setConfig({ ativo: d.config.ativo, a_cada: String(d.config.a_cada) });
  }, [chamar]);

  useEffect(() => { carregar().catch((e) => setMensagem({ tipo: 'erro', texto: e.message })); }, [carregar]);
  useEffect(() => () => audio.current?.pause(), []);

  async function salvarConfig(novo) {
    setMensagem(null);
    try {
      await chamar('/admin/vinhetas/config', { metodo: 'PUT', corpo: { ativo: novo.ativo, a_cada: Number(novo.a_cada) } });
      setMensagem({ tipo: 'ok', texto: '✔ Ajuste salvo.' });
      await carregar();
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message });
    }
  }

  async function enviar(e) {
    e.preventDefault();
    setMensagem(null);
    setEnviando(true);
    try {
      const corpo = new FormData();
      corpo.append('titulo', titulo);
      corpo.append('arquivo', arquivo);
      await chamar('/admin/vinhetas', { metodo: 'POST', corpo });
      setTitulo('');
      setArquivo(null);
      if (campoArquivo.current) campoArquivo.current.value = '';
      setMensagem({ tipo: 'ok', texto: '✔ Vinheta cadastrada. Ligue o interruptor acima para ela tocar.' });
      await carregar();
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setEnviando(false);
    }
  }

  async function alternar(v) {
    try { await chamar(`/admin/vinhetas/${v.id}`, { metodo: 'PUT', corpo: { ativa: !v.ativa } }); await carregar(); } catch (e) { setMensagem({ tipo: 'erro', texto: e.message }); }
  }

  async function apagar(v) {
    if (!window.confirm(`Apagar a vinheta “${v.titulo}”?`)) return;
    try { await chamar(`/admin/vinhetas/${v.id}`, { metodo: 'DELETE' }); await carregar(); } catch (e) { setMensagem({ tipo: 'erro', texto: e.message }); }
  }

  // Toca no navegador de quem está no painel, só para conferir o que foi enviado.
  async function ouvir(v) {
    audio.current?.pause();
    if (tocando === v.id) { setTocando(null); return; }
    try {
      const url = await ouvirArquivo(`/admin/vinhetas/${v.id}/audio`);
      const novo = new Audio(url);
      novo.onended = () => { setTocando(null); URL.revokeObjectURL(url); };
      audio.current = novo;
      await novo.play();
      setTocando(v.id);
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message });
    }
  }

  if (!dados) return <div className="estado"><span className="carregando" /></div>;

  return (
    <>
      <h2>📢 Vinhetas de áudio</h2>
      <p className="nota">
        Áudios curtos seus (“Peça a sua música pelo QR Code!”, “Happy hour até as 23h!”) que tocam <b>entre duas músicas</b>, a cada tantas músicas.
        Não custam crédito e não entram no ranking nem no faturamento. Aceita MP3, M4A, WAV, FLAC ou OGG de até 2 minutos.
      </p>

      <div className="card divulgacao-config">
        <label className="interruptor">
          <input type="checkbox" checked={config.ativo} onChange={(e) => { const novo = { ...config, ativo: e.target.checked }; setConfig(novo); salvarConfig(novo); }} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>Tocar vinhetas</strong>
            <small>Com várias ativas, elas se revezam. A contagem começa quando você liga.</small>
          </span>
        </label>
        <label className="divulgacao-campo">A cada quantas músicas
          <input className="campo mono" inputMode="numeric" value={config.a_cada}
            onChange={(e) => setConfig({ ...config, a_cada: soNumeros(e.target.value, 2) })}
            onBlur={() => salvarConfig(config)} />
        </label>
      </div>

      <form className="admin-form" onSubmit={enviar}>
        <div className="admin-form-linha">
          <label>Nome (só você vê)
            <input className="campo" required maxLength={80} placeholder="Ex.: Peça pelo QR Code" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </label>
          <label>Arquivo de áudio
            <input ref={campoArquivo} className="campo" type="file" required accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg" onChange={(e) => setArquivo(e.target.files[0] ?? null)} />
          </label>
        </div>
        <button className="btn" disabled={enviando || !arquivo}>{enviando ? 'ENVIANDO…' : '➕ ADICIONAR VINHETA'}</button>
      </form>
      <Mensagem mensagem={mensagem} />

      {dados.vinhetas.length === 0 && <p className="vazio">Nenhuma vinheta cadastrada.</p>}
      <ul className="admin-lista">
        {dados.vinhetas.map((v) => (
          <li key={v.id} className={`admin-linha ${v.ativa ? '' : 'oculta'}`}>
            <div className="admin-linha-info">
              <strong>{v.titulo}</strong>
              <span>{v.duracao ? `${v.duracao} s` : 'duração desconhecida'} · {v.ativa ? 'ativa' : 'desativada'}</span>
            </div>
            <div className="admin-acoes">
              <button className="btn btn-ciano btn-pequeno" onClick={() => ouvir(v)}>{tocando === v.id ? '⏹ Parar' : '▶ Ouvir'}</button>
              <button className="btn btn-fantasma btn-pequeno" onClick={() => alternar(v)}>{v.ativa ? 'Desativar' : 'Ativar'}</button>
              <button className="btn btn-perigo btn-pequeno" onClick={() => apagar(v)}>Apagar</button>
            </div>
          </li>
        ))}
      </ul>
      {dados.vinhetas.length > 0 && <small>“Ouvir” toca no aparelho em que você está usando o painel.</small>}
    </>
  );
}

// ---------- Cartazes do monitor ----------

function Cartazes({ chamar }) {
  const [dados, setDados] = useState(null);
  const [config, setConfig] = useState({ ativo: false, intervalo: '90' });
  const [form, setForm] = useState({ titulo: '', legenda: '', segundos: '10', inicio_em: '', fim_em: '' });
  const [imagem, setImagem] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const campoImagem = useRef(null);

  const carregar = useCallback(async () => {
    const d = await chamar('/admin/cartazes');
    setDados(d);
    setConfig({ ativo: d.config.ativo, intervalo: String(d.config.intervalo) });
  }, [chamar]);

  useEffect(() => { carregar().catch((e) => setMensagem({ tipo: 'erro', texto: e.message })); }, [carregar]);

  async function salvarConfig(novo) {
    setMensagem(null);
    try {
      await chamar('/admin/cartazes/config', { metodo: 'PUT', corpo: { ativo: novo.ativo, intervalo: Number(novo.intervalo) } });
      setMensagem({ tipo: 'ok', texto: '✔ Ajuste salvo. O monitor atualiza sozinho.' });
      await carregar();
    } catch (e) {
      setMensagem({ tipo: 'erro', texto: e.message });
    }
  }

  async function enviar(e) {
    e.preventDefault();
    setMensagem(null);
    setEnviando(true);
    try {
      const corpo = new FormData();
      for (const [campo, valor] of Object.entries(form)) if (valor !== '') corpo.append(campo, valor);
      corpo.append('imagem', imagem);
      await chamar('/admin/cartazes', { metodo: 'POST', corpo });
      setForm({ titulo: '', legenda: '', segundos: '10', inicio_em: '', fim_em: '' });
      setImagem(null);
      if (campoImagem.current) campoImagem.current.value = '';
      setMensagem({ tipo: 'ok', texto: '✔ Cartaz cadastrado. Ligue “Mostrar cartazes” para ele aparecer no monitor.' });
      await carregar();
    } catch (erro) {
      setMensagem({ tipo: 'erro', texto: erro.message });
    } finally {
      setEnviando(false);
    }
  }

  async function atualizar(c, mudancas) {
    try { await chamar(`/admin/cartazes/${c.id}`, { metodo: 'PUT', corpo: mudancas }); await carregar(); } catch (e) { setMensagem({ tipo: 'erro', texto: e.message }); }
  }

  async function apagar(c) {
    if (!window.confirm(`Apagar o cartaz “${c.titulo}”?`)) return;
    try { await chamar(`/admin/cartazes/${c.id}`, { metodo: 'DELETE' }); await carregar(); } catch (e) { setMensagem({ tipo: 'erro', texto: e.message }); }
  }

  if (!dados) return <div className="estado"><span className="carregando" /></div>;

  return (
    <>
      <h2>🖼 Cartazes no monitor</h2>
      <p className="nota">
        Imagens (patrocinadores, promoções, avisos) que ocupam o monitor (/tela) por alguns segundos, em rodízio. Dá para vender o espaço:
        o painel conta quantas vezes cada cartaz foi exibido, e você pode definir o período em que ele vale.
      </p>

      <div className="card divulgacao-config">
        <label className="interruptor">
          <input type="checkbox" checked={config.ativo} onChange={(e) => { const novo = { ...config, ativo: e.target.checked }; setConfig(novo); salvarConfig(novo); }} />
          <span className="interruptor-trilho" aria-hidden="true" />
          <span>
            <strong>Mostrar cartazes no monitor</strong>
            <small>Só aparecem os cartazes ativos e dentro do período. O recado pago sempre passa por cima.</small>
          </span>
        </label>
        <label className="divulgacao-campo">Segundos entre um cartaz e outro (20 a 900)
          <input className="campo mono" inputMode="numeric" value={config.intervalo}
            onChange={(e) => setConfig({ ...config, intervalo: soNumeros(e.target.value) })}
            onBlur={() => salvarConfig(config)} />
        </label>
      </div>

      <form className="admin-form" onSubmit={enviar}>
        <div className="admin-form-linha">
          <label>Nome (só você vê)
            <input className="campo" required maxLength={80} placeholder="Ex.: Pizzaria do Zé" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </label>
          <label>Segundos na tela (5 a 60)
            <input className="campo mono" inputMode="numeric" value={form.segundos} onChange={(e) => setForm({ ...form, segundos: soNumeros(e.target.value, 2) })} />
          </label>
        </div>
        <label>Imagem (JPG, PNG ou WebP, até 6 MB — de preferência na horizontal)
          <input ref={campoImagem} className="campo" type="file" required accept="image/jpeg,image/png,image/webp" onChange={(e) => setImagem(e.target.files[0] ?? null)} />
        </label>
        <label>Legenda embaixo da imagem (opcional)
          <input className="campo" maxLength={120} placeholder="Ex.: Peça com 10% de desconto mostrando esta tela" value={form.legenda} onChange={(e) => setForm({ ...form, legenda: e.target.value })} />
        </label>
        <div className="admin-form-linha">
          <label>Vale a partir de (opcional)
            <input className="campo" type="date" value={form.inicio_em} onChange={(e) => setForm({ ...form, inicio_em: e.target.value })} />
          </label>
          <label>Vale até (opcional)
            <input className="campo" type="date" value={form.fim_em} min={form.inicio_em || undefined} onChange={(e) => setForm({ ...form, fim_em: e.target.value })} />
          </label>
        </div>
        <button className="btn" disabled={enviando || !imagem}>{enviando ? 'ENVIANDO…' : '➕ ADICIONAR CARTAZ'}</button>
      </form>
      <Mensagem mensagem={mensagem} />

      {dados.cartazes.length === 0 && <p className="vazio">Nenhum cartaz cadastrado.</p>}
      <ul className="admin-lista">
        {dados.cartazes.map((c) => (
          <li key={c.id} className={`admin-linha cartaz-linha ${c.ativo ? '' : 'oculta'}`}>
            <img className="cartaz-miniatura" src={c.url} alt={c.titulo} loading="lazy" />
            <div className="admin-linha-info">
              <strong>{c.titulo}</strong>
              <span>
                {c.segundos} s na tela · {c.no_ar ? '🟢 no ar' : c.ativo ? '⏸ fora do período' : '⚪ desativado'}
                {(c.inicio_em || c.fim_em) && ` · ${c.inicio_em ? `de ${dataBr(c.inicio_em)}` : ''} ${c.fim_em ? `até ${dataBr(c.fim_em)}` : ''}`}
              </span>
              <span>Exibido <b className="mono">{c.exibicoes}</b> {c.exibicoes === 1 ? 'vez' : 'vezes'}{c.legenda ? ` · “${c.legenda}”` : ''}</span>
            </div>
            <div className="admin-acoes">
              <button className="btn btn-fantasma btn-pequeno" onClick={() => atualizar(c, { ativo: !c.ativo })}>{c.ativo ? 'Desativar' : 'Ativar'}</button>
              <button className="btn btn-perigo btn-pequeno" onClick={() => apagar(c)}>Apagar</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Divulgacao({ chamar, ouvirArquivo }) {
  return (
    <div className="divulgacao">
      <Vinhetas chamar={chamar} ouvirArquivo={ouvirArquivo} />
      <Cartazes chamar={chamar} />
    </div>
  );
}
