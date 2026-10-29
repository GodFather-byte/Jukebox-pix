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

function atualizarModo() {
  const producao = modo() === 'producao';
  $('secao-pix').hidden = !producao;
  $('titulo-ferramentas').textContent = `${producao ? 4 : 3}. Som e ferramentas`;
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
      porta: Number($('porta').value),
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
  $('cancelar').addEventListener('click', () => window.jukebox.cancelar());
  $('form').addEventListener('submit', salvar);
  for (const link of document.querySelectorAll('[data-link]')) {
    link.addEventListener('click', (e) => { e.preventDefault(); window.jukebox.abrirLink(link.dataset.link); });
  }
}

iniciar();
