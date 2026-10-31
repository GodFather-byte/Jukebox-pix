// Tela de configuração (primeiro uso e menu Jukebox Pix → Configurações). Fala com o aplicativo só por window.jukebox.
const $ = (id) => document.getElementById(id);
let dados;

function gerarSenha() {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const sorteio = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(sorteio, (n) => letras[n % letras.length]).join('');
}

function modo() {
  return document.querySelector('input[name=modo]:checked')?.value;
}

function mostrarAviso(elemento, texto, tipo = '') {
  elemento.textContent = texto;
  elemento.className = `aviso ${tipo}`.trim();
  elemento.hidden = !texto;
}

function item(estado, titulo, detalhe) {
  const li = document.createElement('li');
  li.className = estado;
  const marca = document.createElement('span');
  marca.className = 'marca';
  marca.textContent = estado === 'ok' ? '✓' : estado === 'falta' ? '✗' : '!';
  const texto = document.createElement('span');
  const forte = document.createElement('strong');
  forte.textContent = titulo;
  const pequeno = document.createElement('small');
  pequeno.textContent = detalhe;
  texto.append(forte, pequeno);
  li.append(marca, texto);
  return li;
}

function desenharFerramentas() {
  const { situacao, plataforma } = dados;
  const lista = $('ferramentas');
  lista.replaceChildren();
  const comoInstalar = plataforma === 'linux' ? 'Instale pelo terminal: sudo apt install mpv.' : 'Instale o VLC (videolan.org) ou o mpv (mpv.io).';
  if (situacao.player) lista.append(item('ok', `Player: ${situacao.player}`, 'O som sai pela saída de áudio padrão deste computador.'));
  else if (modo() === 'teste') lista.append(item('opcional', 'Player: nenhum (o teste usa o player simulado)', comoInstalar));
  else lista.append(item('falta', 'Player: nenhum encontrado', `Obrigatório para atender clientes. ${comoInstalar} Depois reabra o aplicativo.`));
  lista.append(situacao.ffmpeg
    ? item('ok', 'ffmpeg', 'Deixa o volume parelho entre as músicas (liga na aba Player do painel).')
    : item('opcional', 'ffmpeg: não encontrado (opcional)', 'Sem ele o volume parelho usa só as tags dos arquivos.'));
  lista.append(situacao.ytdlp
    ? item('ok', 'yt-dlp', 'Permite músicas pedidas da internet (liga na aba Internet do painel).')
    : item('opcional', 'yt-dlp: não encontrado (opcional)', 'Sem ele o cliente só escolhe músicas do acervo.'));
}

// Garante que o valor salvo apareça na lista mesmo antes de "Procurar".
function opcao(select, valor, texto) {
  if (!valor || [...select.options].some((o) => o.value === valor)) return;
  select.add(new Option(texto || valor, valor));
}

async function procurarMaquininhas() {
  const botao = $('procurar-maquininhas');
  botao.disabled = true;
  mostrarAviso($('maquininha-resultado'), 'Procurando maquininhas na sua conta...', 'alerta');
  try {
    const r = await window.jukebox.maquininhas($('token').value.trim());
    if (!r.ok) return mostrarAviso($('maquininha-resultado'), r.mensagem, 'erro');
    for (const t of r.terminais) opcao($('terminal'), t.id, `${t.id}${t.modo === 'PDV' ? '' : ' (precisa ativar o modo PDV)'}`);
    if (!$('terminal').value) $('terminal').value = r.terminais[0].id;
    dados.terminais = r.terminais;
    mostrarAviso($('maquininha-resultado'), `${r.terminais.length === 1 ? 'Achei 1 maquininha' : `Achei ${r.terminais.length} maquininhas`}.`);
    conferirPdv();
  } finally {
    botao.disabled = false;
  }
}

function conferirPdv() {
  const escolhida = (dados.terminais || []).find((t) => t.id === $('terminal').value);
  $('ativar-pdv').hidden = !escolhida || escolhida.modo === 'PDV';
}

async function ativarPdv() {
  const r = await window.jukebox.ativarPdv($('token').value.trim(), $('terminal').value);
  mostrarAviso($('maquininha-resultado'), r.mensagem, r.ok ? '' : 'erro');
  if (r.ok) {
    const t = dados.terminais.find((x) => x.id === $('terminal').value);
    if (t) t.modo = 'PDV';
    conferirPdv();
  }
}

async function procurarPortas() {
  const portas = await window.jukebox.portas();
  for (const p of portas) opcao($('noteiro'), p.caminho, p.nome ? `${p.caminho} · ${p.nome}` : p.caminho);
  if (!portas.length) mostrarAviso($('erro'), 'Nenhuma porta serial encontrada. Confira o cabo USB da placa do noteiro.', 'alerta');
}

function atualizarModo() {
  const producao = modo() === 'producao';
  $('secao-pix').hidden = !producao;
  $('titulo-noteiro').textContent = `${producao ? 4 : 3}. Noteiro (dinheiro)`;
  $('titulo-ferramentas').textContent = `${producao ? 5 : 4}. Som e ferramentas`;
  $('salvar').textContent = dados.existe ? 'Salvar e reiniciar' : 'Salvar e abrir';
  desenharFerramentas();
}

async function testar() {
  const botao = $('testar');
  botao.disabled = true;
  mostrarAviso($('token-resultado'), 'Consultando o Mercado Pago...', 'alerta');
  try {
    const r = await window.jukebox.testarToken($('token').value.trim());
    mostrarAviso($('token-resultado'), r.mensagem, r.ok ? (r.alerta ? 'alerta' : '') : 'erro');
  } finally {
    botao.disabled = false;
  }
}

async function salvar(evento) {
  evento.preventDefault();
  mostrarAviso($('erro'), '');
  const botao = $('salvar');
  botao.disabled = true;
  try {
    const r = await window.jukebox.salvar({
      modo: modo(),
      nomeLocal: $('nomeLocal').value,
      senha: $('senha').value,
      token: $('token').value,
      terminal: modo() === 'producao' ? $('terminal').value : '',
      noteiroPorta: $('noteiro').value,
      tecladoPerfil: $('tecladoPerfil').value,
      centralUrl: $('centralUrl').value,
      centralToken: $('centralToken').value,
      acervoExterno: $('acervoExterno').value,
      porta: Number($('porta').value),
      iniciarComSistema: $('iniciarComSistema').checked,
    });
    if (!r.ok) mostrarAviso($('erro'), r.erro, 'erro');
  } finally {
    botao.disabled = false;
  }
}

async function iniciar() {
  dados = await window.jukebox.ler();
  document.querySelector(`input[name=modo][value=${dados.modo}]`).checked = true;
  $('nomeLocal').value = dados.nomeLocal;
  $('senha').value = dados.senha;
  $('porta').value = dados.porta;
  opcao($('terminal'), dados.terminal);
  $('terminal').value = dados.terminal;
  opcao($('noteiro'), dados.noteiroPorta);
  $('noteiro').value = dados.noteiroPorta;
  $('acervoExterno').value = dados.acervoExterno;
  $('tecladoPerfil').value = dados.tecladoPerfil;
  $('centralUrl').value = dados.centralUrl;
  if (dados.temTokenCentral) $('centralToken').placeholder = 'Já preenchido. Deixe em branco para manter.';
  $('iniciarComSistema').checked = dados.iniciarComSistema;
  if (dados.temToken) $('token').placeholder = 'Já preenchido. Deixe em branco para manter.';
  if (dados.existe) $('subtitulo').textContent = 'As mudanças valem assim que o jukebox reiniciar.';
  if (dados.erro) mostrarAviso($('erro-inicial'), dados.erro, 'erro');
  atualizarModo();

  for (const radio of document.querySelectorAll('input[name=modo]')) radio.addEventListener('change', atualizarModo);
  $('gerar').addEventListener('click', () => { $('senha').value = gerarSenha(); });
  $('copiar').addEventListener('click', () => window.jukebox.copiar($('senha').value));
  $('mostrar-token').addEventListener('click', () => {
    const campo = $('token');
    campo.type = campo.type === 'password' ? 'text' : 'password';
    $('mostrar-token').textContent = campo.type === 'password' ? 'Mostrar' : 'Esconder';
  });
  $('testar').addEventListener('click', testar);
  $('procurar-maquininhas').addEventListener('click', procurarMaquininhas);
  $('terminal').addEventListener('change', conferirPdv);
  $('ativar-pdv').addEventListener('click', ativarPdv);
  $('procurar-portas').addEventListener('click', procurarPortas);
  $('cancelar').addEventListener('click', () => window.jukebox.cancelar());
  $('form').addEventListener('submit', salvar);
  for (const link of document.querySelectorAll('[data-link]')) {
    link.addEventListener('click', (e) => { e.preventDefault(); window.jukebox.abrirLink(link.dataset.link); });
  }
}

iniciar();
