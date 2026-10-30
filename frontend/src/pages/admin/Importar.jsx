import { useEffect, useState } from 'react';

export default function Importar({ chamar, aoImportar }) {
  const [varredura, setVarredura] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [marcados, setMarcados] = useState(new Set());
  const [categoriaId, setCategoriaId] = useState('');
  const [status, setStatus] = useState('lancado');
  const [preco, setPreco] = useState('1');
  const [carregando, setCarregando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    chamar('/admin/cadastros').then((c) => {
      setCategorias(c.categorias);
      setCategoriaId(c.categorias[0]?.id ?? '');
    }).catch(() => {});
  }, [chamar]);

  async function procurar() {
    setErro('');
    setResultado(null);
    setCarregando(true);
    try {
      const dados = await chamar('/admin/importacao');
      setVarredura(dados);
      setMarcados(new Set(dados.cds.filter((cd) => !cd.ja_existe).map((cd) => cd.chave)));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }

  const alternar = (chave) => setMarcados((atuais) => {
    const novo = new Set(atuais);
    if (novo.has(chave)) novo.delete(chave); else novo.add(chave);
    return novo;
  });

  const selecionaveis = varredura?.cds.filter((cd) => !cd.ja_existe) ?? [];
  const precisaCategoria = varredura?.cds.some((cd) => marcados.has(cd.chave) && !cd.categoria_pasta);
  const totalFaixas = varredura?.cds.filter((cd) => marcados.has(cd.chave)).reduce((t, cd) => t + cd.faixas, 0) ?? 0;

  async function importar() {
    setErro('');
    setImportando(true);
    try {
      const r = await chamar('/admin/importacao', {
        metodo: 'POST',
        corpo: { chaves: [...marcados], categoria_id: categoriaId, status, preco: Number(preco || 1) },
      });
      setResultado(r);
      if (r.importados.length) aoImportar();
      const dados = await chamar('/admin/importacao');
      setVarredura(dados);
      setMarcados(new Set());
    } catch (e) {
      setErro(e.message);
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="importar">
      <h2>Importar vários CDs de uma vez</h2>
      <p className="nota">
        Copie suas pastas de CDs para a pasta abaixo (pelo Explorador de Arquivos) e clique em <b>Procurar CDs</b>.
        Os arquivos são <b>movidos</b> para a biblioteca, então a pasta fica vazia depois.
      </p>
      <code className="importar-pasta">{varredura?.pasta ?? 'musicas\\_importar'}</code>
      <pre className="importar-exemplo">{`Artista - CD/01 - Faixa.mp3          (acervo de outra jukebox; categoria aqui na tela)
Artista/CD/01 - Faixa.mp3            (escolha a categoria aqui na tela)
Categoria/Artista/CD/01 - Faixa.mp3  (a categoria vem do nome da pasta)

Dicas: "2019 - Nome do CD" ou "Nome do CD (2019)" define o ano.
Uma imagem na pasta do CD (capa.jpg, cover.jpg...) vira a capa.`}</pre>

      <button className="btn" onClick={procurar} disabled={carregando || importando}>
        {carregando ? 'PROCURANDO…' : '🔎 PROCURAR CDs'}
      </button>
      {erro && <p className="aviso aviso-erro importar-espaco">{erro}</p>}

      {varredura && (
        <>
          {varredura.cds.length === 0 && (
            <p className="vazio">Nenhum CD encontrado. Confira se as faixas estão em <b>Artista - CD</b> ou <b>Artista/CD</b> dentro da pasta acima.</p>
          )}

          {varredura.cds.length > 0 && (
            <>
              <div className="importar-topo">
                <label className="marcar">
                  <input type="checkbox"
                    checked={selecionaveis.length > 0 && selecionaveis.every((cd) => marcados.has(cd.chave))}
                    onChange={(e) => setMarcados(new Set(e.target.checked ? selecionaveis.map((cd) => cd.chave) : []))} />
                  Selecionar todos
                </label>
                <span>{varredura.cds.length} CD(s) encontrado(s)</span>
              </div>

              <ul className="importar-lista">
                {varredura.cds.map((cd) => (
                  <li key={cd.chave} className={cd.ja_existe ? 'importar-item desativado' : 'importar-item'}>
                    <label className="marcar">
                      <input type="checkbox" checked={marcados.has(cd.chave)} disabled={cd.ja_existe} onChange={() => alternar(cd.chave)} />
                      <span className="importar-item-info">
                        <strong>{cd.titulo}{cd.ano ? ` (${cd.ano})` : ''}</strong>
                        <span>{cd.artista} · {cd.faixas} {cd.faixas === 1 ? 'faixa' : 'faixas'}{cd.tem_capa ? ' · 🖼 capa' : ''}</span>
                      </span>
                    </label>
                    {cd.categoria_pasta && <span className="selo selo-ciano">categoria: {cd.categoria_pasta}</span>}
                    {cd.ja_existe && <span className="selo selo-rosa">já existe</span>}
                  </li>
                ))}
              </ul>

              {varredura.ignorados.map((i) => (
                <p key={i.chave} className="aviso importar-espaco">⚠ {i.chave}: {i.motivo}</p>
              ))}

              <div className="admin-form importar-opcoes">
                {precisaCategoria && (
                  <label>Categoria dos CDs sem categoria na pasta
                    <select className="campo" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                      {categorias.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}
                    </select>
                  </label>
                )}
                <label>Entram como
                  <select className="campo" value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="lancado">Direto na categoria (acervo antigo)</option>
                    <option value="novo">Lançamento (7 dias em LANÇAMENTOS)</option>
                  </select>
                </label>
                <label>Preço de cada música (créditos)
                  <input className="campo mono" inputMode="numeric" value={preco} onChange={(e) => setPreco(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                </label>
                <button className="btn btn-grande" onClick={importar} disabled={importando || marcados.size === 0}>
                  {importando ? 'IMPORTANDO… (pode demorar)' : `IMPORTAR ${marcados.size} CD${marcados.size === 1 ? '' : 'S'} (${totalFaixas} músicas)`}
                </button>
              </div>
            </>
          )}
        </>
      )}

      {resultado && (
        <div className="importar-resultado">
          {resultado.importados.length > 0 && (
            <p className="aviso aviso-ok">✔ {resultado.importados.length} CD(s) importado(s) com {resultado.importados.reduce((t, c) => t + c.total_musicas, 0)} músicas.</p>
          )}
          {resultado.erros.map((e) => (
            <p key={e.chave} className="aviso aviso-erro importar-espaco"><b>{e.chave}</b>: {e.erro.replace(/\.?$/, '.')} Os arquivos continuam na pasta.</p>
          ))}
        </div>
      )}
    </div>
  );
}
