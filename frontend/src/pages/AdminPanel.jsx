import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, baixar, buscarArquivo } from '../api.js';
import Alertas from './admin/Alertas.jsx';
import Biblioteca from './admin/Biblioteca.jsx';
import Cadastros from './admin/Cadastros.jsx';
import Console from './admin/Console.jsx';
import Cortesia from './admin/Cortesia.jsx';
import Divulgacao from './admin/Divulgacao.jsx';
import Importar from './admin/Importar.jsx';
import Internet from './admin/Internet.jsx';
import NovoCd from './admin/NovoCd.jsx';
import PlayerAdmin from './admin/PlayerAdmin.jsx';
import Recados from './admin/Recados.jsx';
import Regras from './admin/Regras.jsx';
import Relatorio from './admin/Relatorio.jsx';
import Resumo from './admin/Resumo.jsx';
import Sistema from './admin/Sistema.jsx';
import Sugestoes from './admin/Sugestoes.jsx';
import Vales from './admin/Vales.jsx';

const CHAVE = 'jukebox_admin';
const lerToken = () => { try { return sessionStorage.getItem(CHAVE); } catch { return null; } };
const gravarToken = (t) => { try { t ? sessionStorage.setItem(CHAVE, t) : sessionStorage.removeItem(CHAVE); } catch { /* sem storage */ } };

const ABAS = [
  ['resumo', '📊 Resumo'],
  ['relatorio', '📈 Relatório'],
  ['player', '▶ Player'],
  ['console', '🎛 Console'],
  ['recados', '💬 Recados'],
  ['biblioteca', '💿 Biblioteca'],
  ['novo', '➕ Novo CD'],
  ['importar', '📥 Importar'],
  ['internet', '🌐 Internet'],
  ['cortesia', '🎁 Cortesia'],
  ['vales', '🎟 Vales'],
  ['regras', '⚙ Regras'],
  ['divulgacao', '📢 Divulgação'],
  ['sugestoes', '💡 Sugestões'],
  ['alertas', '📲 Alertas'],
  ['sistema', '🖥 Sistema'],
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
  const [saude, setSaude] = useState(null);

  const sair = useCallback(() => { gravarToken(null); setToken(null); }, []);

  // Token vencido ou inválido derruba pra tela de login.
  const chamar = useCallback((caminho, opcoes = {}) => api(caminho, { ...opcoes, token }).catch((erro) => {
    if (erro.status === 401) sair();
    throw erro;
  }), [token, sair]);

  // Com muitas abas no celular, a ativa pode ficar fora da tela: rola até ela.
  useEffect(() => {
    document.querySelector('.aba.ativa')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [aba]);

  // Arquivos protegidos (CSV, backup): baixa com o token e entrega ao navegador.
  const baixarArquivo = useCallback((caminho, nome) => baixar(caminho, token, nome).catch((erro) => {
    if (erro.status === 401) sair();
    throw erro;
  }), [token, sair]);

  // Arquivos protegidos para tocar/mostrar aqui mesmo (ex.: ouvir uma vinheta).
  const ouvirArquivo = useCallback((caminho) => buscarArquivo(caminho, token).catch((erro) => {
    if (erro.status === 401) sair();
    throw erro;
  }), [token, sair]);

  // Avisos fixos do topo (player sem som, recados esperando): consulta leve a cada 10 s e quando algo muda.
  const atualizarSaude = useCallback(() => {
    if (!token) return;
    api('/admin/saude', { token }).then(setSaude).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    atualizarSaude();
    const id = setInterval(atualizarSaude, 10_000);
    const eventos = new EventSource('/api/eventos');
    for (const nome of ['fila', 'top', 'lancamentos']) eventos.addEventListener(nome, () => setVersao((v) => v + 1));
    eventos.addEventListener('recados', atualizarSaude);
    return () => { clearInterval(id); eventos.close(); };
  }, [token, atualizarSaude]);

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

      {saude?.player.simulado && (
        <div className="banner-sem-som" role="alert">
          <span>
            🔇 <b>SEM SOM:</b> o player está simulado, então nenhuma música toca de verdade (e as músicas “passam” em poucos segundos).
            Instale o VLC (<code>winget install VideoLAN.VLC</code>) ou o mpv e reinicie o servidor.
          </span>
          <button className="btn btn-pequeno" onClick={() => setAba('sistema')}>Ver detalhes</button>
        </div>
      )}

      <nav className="abas" role="tablist">
        {ABAS.map(([chave, rotulo]) => (
          <button key={chave} role="tab" aria-selected={aba === chave} className={`aba ${aba === chave ? 'ativa' : ''}`} onClick={() => setAba(chave)}>
            {rotulo}
            {chave === 'recados' && saude?.recados_pendentes > 0 && <b className="aba-badge mono">{saude.recados_pendentes}</b>}
          </button>
        ))}
      </nav>

      <section className="admin-conteudo">
        {aba === 'resumo' && <Resumo chamar={chamar} />}
        {aba === 'relatorio' && <Relatorio chamar={chamar} baixarArquivo={baixarArquivo} />}
        {aba === 'player' && <PlayerAdmin chamar={chamar} versao={versao} />}
        {aba === 'console' && <Console chamar={chamar} />}
        {aba === 'recados' && <Recados chamar={chamar} />}
        {aba === 'biblioteca' && <Biblioteca chamar={chamar} versao={versao} />}
        {aba === 'novo' && <NovoCd chamar={chamar} aoCriar={() => setAba('biblioteca')} />}
        {aba === 'importar' && <Importar chamar={chamar} aoImportar={() => setVersao((v) => v + 1)} />}
        {aba === 'internet' && <Internet chamar={chamar} />}
        {aba === 'cortesia' && <Cortesia chamar={chamar} />}
        {aba === 'vales' && <Vales chamar={chamar} />}
        {aba === 'regras' && <Regras chamar={chamar} />}
        {aba === 'divulgacao' && <Divulgacao chamar={chamar} ouvirArquivo={ouvirArquivo} />}
        {aba === 'sugestoes' && <Sugestoes chamar={chamar} />}
        {aba === 'alertas' && <Alertas chamar={chamar} />}
        {aba === 'sistema' && <Sistema chamar={chamar} baixarArquivo={baixarArquivo} />}
        {aba === 'cadastros' && <Cadastros chamar={chamar} />}
      </section>
    </main>
  );
}
