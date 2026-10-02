import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Biblioteca from './admin/Biblioteca.jsx';
import Cadastros from './admin/Cadastros.jsx';
import Cortesia from './admin/Cortesia.jsx';
import Importar from './admin/Importar.jsx';
import NovoCd from './admin/NovoCd.jsx';
import PlayerAdmin from './admin/PlayerAdmin.jsx';
import Resumo from './admin/Resumo.jsx';

const CHAVE = 'jukebox_admin';
const lerToken = () => { try { return sessionStorage.getItem(CHAVE); } catch { return null; } };
const gravarToken = (t) => { try { t ? sessionStorage.setItem(CHAVE, t) : sessionStorage.removeItem(CHAVE); } catch { /* sem storage */ } };

const ABAS = [
  ['resumo', '📊 Resumo'],
  ['player', '▶ Player'],
  ['biblioteca', '💿 Biblioteca'],
  ['novo', '➕ Novo CD'],
  ['importar', '📥 Importar'],
  ['cortesia', '🎁 Cortesia'],
  ['cadastros', '🏷 Cadastros'],
];

function Login({ aoEntrar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');

  async function entrar(e) {
    e.preventDefault();
    try {
      const { token } = await api('/admin/login', { metodo: 'POST', corpo: { senha } });
      gravarToken(token);
      aoEntrar(token);
    } catch (erroApi) { setErro(erroApi.message); }
  }

  return (
    <form className="admin-login card" onSubmit={entrar}>
      <h1>🔒 Admin</h1>
      <input className="campo" type="password" placeholder="Senha" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)} />
      {erro && <p className="aviso aviso-erro">{erro}</p>}
      <button className="btn btn-grande" disabled={!senha}>ENTRAR</button>
    </form>
  );
}

export default function AdminPanel() {
  const [token, setToken] = useState(lerToken);
  const [aba, setAba] = useState('resumo');
  const [versao, setVersao] = useState(0);

  const sair = useCallback(() => { gravarToken(null); setToken(null); }, []);

  // Token vencido ou inválido derruba pra tela de login.
  const chamar = useCallback((caminho, opcoes = {}) => api(caminho, { ...opcoes, token }).catch((erro) => {
    if (erro.status === 401) sair();
    throw erro;
  }), [token, sair]);

  useEffect(() => {
    if (!token) return undefined;
    const eventos = new EventSource('/api/eventos');
    for (const nome of ['fila', 'top', 'lancamentos']) eventos.addEventListener(nome, () => setVersao((v) => v + 1));
    return () => eventos.close();
  }, [token]);

  if (!token) return <main className="admin"><Login aoEntrar={setToken} /></main>;

  return (
    <main className="admin">
      <header className="admin-topo">
        <h1>🎵 Admin</h1>
        <div>
          <Link to="/tela" className="btn btn-fantasma btn-pequeno">Monitor</Link>
          <Link to="/" className="btn btn-fantasma btn-pequeno">App</Link>
          <button className="btn btn-fantasma btn-pequeno" onClick={sair}>Sair</button>
        </div>
      </header>

      <nav className="abas" role="tablist">
        {ABAS.map(([chave, rotulo]) => (
          <button key={chave} role="tab" aria-selected={aba === chave} className={`aba ${aba === chave ? 'ativa' : ''}`} onClick={() => setAba(chave)}>{rotulo}</button>
        ))}
      </nav>

      <section className="admin-conteudo">
        {aba === 'resumo' && <Resumo chamar={chamar} />}
        {aba === 'player' && <PlayerAdmin chamar={chamar} versao={versao} />}
        {aba === 'biblioteca' && <Biblioteca chamar={chamar} versao={versao} />}
        {aba === 'novo' && <NovoCd chamar={chamar} aoCriar={() => setAba('biblioteca')} />}
        {aba === 'importar' && <Importar chamar={chamar} aoImportar={() => setVersao((v) => v + 1)} />}
        {aba === 'cortesia' && <Cortesia chamar={chamar} />}
        {aba === 'cadastros' && <Cadastros chamar={chamar} />}
      </section>
    </main>
  );
}
