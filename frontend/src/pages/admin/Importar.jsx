import { useEffect, useState } from 'react';

// Acervos de jukebox antiga têm milhares de CDs: cada pedido leva só um lote, para nenhum passar do tempo
// limite do servidor e a tela mostrar o andamento.
const CDS_POR_LOTE = 15;

export default function Importar({ chamar, aoImportar }) {
  const [varredura, setVarredura] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [marcados, setMarcados] = useState(new Set());
  const [categoriaId, setCategoriaId] = useState('');
  const [status, setStatus] = useState('lancado');
  const [preco, setPreco] = useState('1');
  const [carregando, setCarregando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [origem, setOrigem] = useState('importar');
  const externo = origem === 'externo';

  useEffect(() => {
    chamar('/admin/cadastros').then((c) => {
      setCategorias(c.categorias);
      setCategoriaId(c.categorias[0]?.id ?? '');
    }).catch(() => {});
  }, [chamar]);

  async function procurar(deOnde = origem) {
    setOrigem(deOnde);
    setVarredura(null);
    setErro('');
    setResultado(null);
    setCarregando(true);
    try {
      const dados = await chamar(`/admin/importacao?origem=${deOnde}`);
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
  const precisaCategoria = varredura?.cds.some((cd) => marcados.has(cd.chave) && !cd.categoria_pasta && !cd.genero);
  const totalFaixas = varredura?.cds.filter((cd) => marcados.has(cd.chave)).reduce((t, cd) => t + cd.faixas, 0) ?? 0;
  const comGenero = varredura?.cds.filter((cd) => cd.genero).length ?? 0;
  const ritmos = new Set(varredura?.cds.map((cd) => cd.genero).filter(Boolean));

  async function importar() {
    setErro('');
    setImportando(true);
    const chaves = [...marcados];
    const total = { importados: [], erros: [] };
    setProgresso({ feitos: 0, total: chaves.length });
    try {
      for (let i = 0; i < chaves.length; i += CDS_POR_LOTE) {
        const lote = chaves.slice(i, i + CDS_POR_LOTE);
        try {
          const r = await chamar('/admin/importacao', {
            metodo: 'POST',
            corpo: { chaves: lote, categoria_id: categoriaId, status, preco: Number(preco || 1), origem },
          });
          total.importados.push(...r.importados);
          total.erros.push(...r.erros);
        } catch (e) {
          // Um lote que falha (rede, servidor reiniciando) não para os outros: os CDs dele aparecem como erro.
          total.erros.push(...lote.map((chave) => ({ chave, erro: e.message })));
        }
        setProgresso({ feitos: Math.min(i + lote.length, chaves.length), total: chaves.length });
      }
      setResultado(total);
      if (total.importados.length) aoImportar();
      const dados = await chamar(`/admin/importacao?origem=${origem}`);
      setVarredura(dados);
      setMarcados(new Set());
    } catch (e) {
      setErro(e.message);
    } finally {
      setImportando(false);
      setProgresso(null);
    }
  }

  return (
    <div className="importar">
      <h2>Importar vários CDs de uma vez</h2>
      <p className="nota">
        Copie suas pastas de CDs para a pasta abaixo (pelo Explorador de Arquivos) e clique em <b>Procurar CDs</b>.
        Os arquivos são <b>movidos</b> para a biblioteca, então a pasta fica vazia depois.
      </p>
      <p className="nota">
        <b>Acervo de outra jukebox:</b> com o HD da máquina antiga ligado e a pasta dele informada na configuração
        do aplicativo, as músicas tocam direto de lá. Nada é movido, copiado ou apagado nesse HD. CDs da JukeLinux
        já vêm com o ritmo (arquivo genero.txt da pasta): é só deixar todos marcados e importar de uma vez.
      </p>
      <code className="importar-pasta">{varredura?.pasta ?? 'musicas\\_importar'}</code>
      <pre className="importar-exemplo">{`Artista - CD/01 - Faixa.mp3          (acervo de outra jukebox; categoria aqui na tela)
Artista/CD/01 - Faixa.mp3            (escolha a categoria aqui na tela)
Categoria/Artista/CD/01 - Faixa.mp3  (a categoria vem do nome da pasta)

Dicas: "2019 - Nome do CD" ou "Nome do CD (2019)" define o ano.
Uma imagem na pasta do CD (capa.jpg, cover.jpg...) vira a capa.`}</pre>

      <div className="importar-botoes">
        <button className="btn" onClick={() => procurar('importar')} disabled={carregando || importando}>
          {carregando && !externo ? 'PROCURANDO…' : '🔎 PROCURAR CDs'}
        </button>
        <button className="btn" onClick={() => procurar('externo')} disabled={carregando || importando}>
          {carregando && externo ? 'PROCURANDO…' : '💽 ACERVO DE OUTRA JUKEBOX'}
        </button>
      </div>
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
              {comGenero > 0 && (
                <p className="aviso aviso-ok importar-espaco">
                  🎵 {comGenero} de {varredura.cds.length} CD(s) já têm ritmo da JukeLinux ({ritmos.size} ritmo(s)).
                  Eles entram cada um no seu ritmo; a categoria não existe? É criada sozinha.
                </p>
              )}

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
                    {!cd.categoria_pasta && cd.genero && <span className="selo selo-ciano">ritmo: {cd.genero}</span>}
                    {cd.ja_existe && <span className="selo selo-rosa">já existe</span>}
                  </li>
                ))}
              </ul>

              {varredura.ignorados.map((i) => (
                <p key={i.chave} className="aviso importar-espaco">⚠ {i.chave}: {i.motivo}</p>
              ))}

              <div className="admin-form importar-opcoes">
                {precisaCategoria && (
                  <label>Categoria dos CDs sem ritmo nem categoria na pasta
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
                  {importando
                    ? `IMPORTANDO… ${progresso ? `${progresso.feitos} de ${progresso.total} CDs` : ''}`
                    : `IMPORTAR ${marcados.size} CD${marcados.size === 1 ? '' : 'S'} (${totalFaixas} músicas)`}
                </button>
                {importando && progresso && (
                  <progress className="importar-progresso" value={progresso.feitos} max={progresso.total} />
                )}
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
            <p key={e.chave} className="aviso aviso-erro importar-espaco"><b>{e.chave}</b>: {e.erro.replace(/\.?$/, '.')} {externo ? 'Nada foi alterado no HD.' : 'Os arquivos continuam na pasta.'}</p>
          ))}
        </div>
      )}
    </div>
  );
}
