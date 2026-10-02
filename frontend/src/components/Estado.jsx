// Tela enquanto não há dados: carregando ou erro (com "tentar de novo").
// Uso: if (!dados) return <Estado carregando={carregando} erro={erro} />;
export default function Estado({ carregando, erro, tentarNovamente }) {
  if (erro) {
    return (
      <div className="estado estado-erro">
        <p>{erro.message}</p>
        {tentarNovamente && <button className="btn btn-fantasma" onClick={tentarNovamente}>Tentar de novo</button>}
      </div>
    );
  }
  return carregando ? <div className="estado"><span className="carregando" aria-label="Carregando" /></div> : null;
}
