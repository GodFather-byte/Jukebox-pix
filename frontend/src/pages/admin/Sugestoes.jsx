import { useCallback, useEffect, useState } from 'react';

const FILTROS = [
  ['novo', 'Novas'],
  ['atendido', 'Atendidas'],
  ['descartado', 'Descartadas'],
];

export default function Sugestoes({ chamar }) {
  const [filtro, setFiltro] = useState('novo');
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => chamar(`/admin/sugestoes?status=${filtro}`)
    .then((d) => { setLista(d.sugestoes); setErro(''); })
    .catch((e) => setErro(e.message)), [chamar, filtro]);

  useEffect(() => { carregar(); }, [carregar]);

  const mudar = (id, status) => chamar(`/admin/sugestoes/${id}`, { metodo: 'PUT', corpo: { status } })
    .then(carregar).catch((e) => setErro(e.message));

  return (
    <>
      <h2>💡 Sugestões dos clientes</h2>
      <p className="nota">Músicas e artistas que os clientes procuraram e não encontraram. Quanto mais pessoas pediram, mais vale adicionar ao acervo.</p>

      <div className="chips" role="group" aria-label="Filtrar sugestões">
        {FILTROS.map(([chave, rotulo]) => (
          <button key={chave} className={`chip ${filtro === chave ? 'ativo' : ''}`} onClick={() => setFiltro(chave)}>{rotulo}</button>
        ))}
      </div>

      {erro && <p className="aviso aviso-erro importar-espaco">{erro}</p>}
      {lista && lista.length === 0 && <p className="vazio">Nenhuma sugestão {filtro === 'novo' ? 'nova' : filtro === 'atendido' ? 'atendida' : 'descartada'}.</p>}

      <ul className="admin-lista sugestoes">
        {lista?.map((s) => (
          <li key={s.id} className="admin-linha">
            <div className="admin-linha-info">
              <strong>{s.texto}</strong>
              <span><b className="mono">{s.pedidos}</b> {s.pedidos === 1 ? 'pessoa pediu' : 'pessoas pediram'} · última vez {new Date(s.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </div>
            <div className="admin-acoes">
              {s.status !== 'atendido' && <button className="btn btn-pequeno" onClick={() => mudar(s.id, 'atendido')}>✔ Atendida</button>}
              {s.status !== 'descartado' && <button className="btn btn-perigo btn-pequeno" onClick={() => mudar(s.id, 'descartado')}>Descartar</button>}
              {s.status !== 'novo' && <button className="btn btn-fantasma btn-pequeno" onClick={() => mudar(s.id, 'novo')}>Reabrir</button>}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
