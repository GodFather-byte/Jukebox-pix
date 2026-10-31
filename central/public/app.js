// App da central (PWA): login, painel geral, máquinas e cadastros. Sem framework: o app abre rápido no celular.
// Nada de innerHTML com dados: todo texto que vem das máquinas entra como texto.
const $app = document.getElementById('app');
const CHAVE_SESSAO = 'central.sessao';
const CHAVE_PAINEL = 'central.painel';
const ATUALIZAR_MS = 5 * 60_000;

const guardar = (chave, valor) => { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* modo privado */ } };
const ler = (chave) => { try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; } };
const apagar = (chave) => { try { localStorage.removeItem(chave); } catch { /* modo privado */ } };

let sessao = ler(CHAVE_SESSAO); // { token, usuario }
let periodo = 'hoje';
let relogio = null;
let pedidoInstalar = null;

const reais = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
function haQuanto(iso) {
  if (!iso) return 'nunca enviou';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 2) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) el.append(f instanceof Node ? f : String(f));
  return el;
}

const mostrar = (...nos) => $app.replaceChildren(...nos);

async function api(caminho, { metodo = 'GET', corpo } = {}) {
  const resposta = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: { ...(corpo && { 'Content-Type': 'application/json' }), ...(sessao && { Authorization: `Bearer ${sessao.token}` }) },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (resposta.status === 401 && caminho !== '/login') { sair(); throw new Error('Entre de novo.'); }
  if (!resposta.ok) throw new Error(dados.erro || 'Algo deu errado.');
  return dados;
}

function sair() {
  sessao = null;
  apagar(CHAVE_SESSAO);
  apagar(CHAVE_PAINEL);
  location.hash = '';
  telaLogin();
}

// ---------- Login ----------
function telaLogin(erro = '') {
  const login = h('input', { name: 'login', autocomplete: 'username', autocapitalize: 'none', required: true });
  const senha = h('input', { name: 'senha', type: 'password', autocomplete: 'current-password', required: true });
  const botao = h('button', { class: 'botao' }, 'Entrar');
  const msg = erro ? h('p', { class: 'erro' }, erro) : null;
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      botao.disabled = true;
      try {
        sessao = await api('/login', { metodo: 'POST', corpo: { login: login.value, senha: senha.value } });
        guardar(CHAVE_SESSAO, sessao);
        rotear();
      } catch (err) {
        telaLogin(err.message);
      }
    },
  }, h('label', {}, 'Login', login), h('label', {}, 'Senha', senha), msg, botao);
  mostrar(h('main', { class: 'login' },
    h('div', { class: 'marca' }, h('img', { src: '/icone-192.png', alt: '' }), h('h1', {}, 'Jukebox Pix'), h('p', {}, 'Acompanhe as suas jukeboxes')),
    form));
}

// ---------- Painel ----------
function topo(titulo, subtitulo, extras = []) {
  return h('header', { class: 'topo' },
    h('div', {}, h('h1', {}, h('span', {}, titulo)), h('small', {}, subtitulo)),
    h('div', { class: 'topo-acoes' }, ...extras,
      h('button', { class: 'icone', title: 'Atualizar', 'aria-label': 'Atualizar', onclick: () => rotear() }, '↻'),
      h('button', { class: 'icone sair', title: 'Sair', onclick: sair }, 'Sair')));
}

function cartaoTotais(totais, papel) {
  const t = totais[periodo];
  const nomes = { hoje: 'Hoje', semana: 'Últimos 7 dias', mes: 'Este mês' };
  const pctPix = t.entrou ? Math.round((t.pix / t.entrou) * 100) : 0;
  const larg = (v) => `width:${t.entrou ? (v / t.entrou) * 100 : 0}%`;
  return h('section', { class: 'cartao destaque' },
    h('div', { class: 'rotulo' }, `Entrou · ${nomes[periodo]}`),
    h('div', { class: 'valor' }, reais(t.entrou)),
    h('div', { class: 'sub' }, papel === 'ponto' ? `Sua parte: ${reais(t.ponto)} · ${t.tocadas} músicas` : `${t.tocadas} músicas tocadas · Pix ${pctPix}% do total`),
    h('div', { class: 'barra-pix' },
      h('i', { style: `${larg(t.pix)};background:var(--ciano)` }),
      h('i', { style: `${larg(t.nota)};background:var(--ouro)` }),
      h('i', { style: `${larg(t.cartao)};background:var(--rosa)` })),
    h('div', { class: 'metodos' },
      h('div', { class: 'metodo' }, h('span', {}, 'Pix'), h('b', { style: 'color:var(--ciano)' }, reais(t.pix))),
      h('div', { class: 'metodo' }, h('span', {}, 'Dinheiro'), h('b', { style: 'color:var(--ouro)' }, reais(t.nota))),
      h('div', { class: 'metodo' }, h('span', {}, 'Cartão'), h('b', { style: 'color:var(--rosa)' }, reais(t.cartao)))));
}

function abasPeriodo(redesenhar) {
  return h('div', { class: 'abas', role: 'tablist' }, ...[['hoje', 'Hoje'], ['semana', '7 dias'], ['mes', 'Mês']].map(([id, nome]) =>
    h('button', { class: periodo === id ? 'ativa' : '', role: 'tab', onclick: () => { periodo = id; redesenhar(); } }, nome)));
}

function itemMaquina(m) {
  const classe = m.nunca_enviou ? 'nunca' : m.online ? '' : 'off';
  return h('button', { class: 'maquina', onclick: () => { location.hash = `#/maquina/${m.id}`; } },
    h('span', { class: `ponto-status ${classe}`, title: m.online ? 'Em dia' : 'Sem enviar' }),
    h('span', {}, h('b', {}, m.nome), h('small', {}, `${m.local || 'Sem local'} · ${haQuanto(m.ultimo_em)}`)),
    h('span', { class: 'direita' }, h('b', {}, reais(m.periodos[periodo].entrou)), h('small', {}, `${m.periodos[periodo].tocadas} músicas`)));
}

function avisoInstalar() {
  if (!pedidoInstalar) return null;
  return h('section', { class: 'cartao instalar' },
    h('span', {}, '📲 Instale o app no celular'),
    h('button', { class: 'botao', onclick: async () => { pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; rotear(); } }, 'Instalar'));
}

async function telaPainel() {
  let dados;
  let offline = false;
  try {
    dados = await api('/painel');
    guardar(CHAVE_PAINEL, dados);
  } catch (err) {
    dados = ler(CHAVE_PAINEL);
    if (!dados) return mostrar(h('main', { class: 'pagina' }, topo('Jukebox Pix', ''), h('p', { class: 'erro' }, err.message)));
    offline = true;
  }
  const desenhar = () => {
    const extras = dados.papel === 'dono' ? [h('button', { class: 'icone', title: 'Cadastros', 'aria-label': 'Cadastros', onclick: () => { location.hash = '#/cadastros'; } }, '⚙')] : [];
    const papelNome = { dono: 'Dono', parceiro: 'Parceiro', ponto: 'Ponto' }[dados.papel];
    mostrar(h('main', { class: 'pagina' },
      topo('Jukebox Pix', `${dados.nome} · ${papelNome}`, extras),
      offline ? h('div', { class: 'aviso-offline' }, `Sem internet: dados de ${dataHora(dados.gerado_em)}`) : null,
      avisoInstalar(),
      abasPeriodo(desenhar),
      cartaoTotais(dados.totais, dados.papel),
      ...dados.alertas.map((a) => h('div', { class: 'alerta' }, '⚠️', h('button', { onclick: () => { location.hash = `#/maquina/${a.id}`; } }, h('b', {}, a.maquina), ` · ${a.texto}`))),
      h('div', { class: 'secao-titulo' }, h('h2', {}, 'Máquinas'), h('span', {}, `${dados.online} de ${dados.maquinas.length} em dia`)),
      dados.maquinas.length
        ? h('div', { class: 'maquinas' }, ...[...dados.maquinas].sort((a, b) => b.periodos[periodo].entrou - a.periodos[periodo].entrou).map(itemMaquina))
        : h('p', { class: 'vazio' }, dados.papel === 'dono' ? 'Nenhuma máquina ainda. Cadastre em ⚙.' : 'Nenhuma máquina ligada ao seu acesso ainda.')));
  };
  desenhar();
}

// ---------- Máquina ----------
function grafico(dias) {
  const max = Math.max(1, ...dias.map((d) => d.entrou));
  return h('div', { class: 'grafico' }, ...dias.map((d) => h('div', { title: `${d.dia}: ${reais(d.entrou)}` },
    h('i', { style: `height:${(d.entrou / max) * 100}%` }),
    h('small', {}, d.dia.slice(8, 10)))));
}

function blocoRelogio(titulo, r, papel, pctPonto) {
  if (!r) return null;
  const m = r.por_metodo ?? {};
  return h('section', { class: 'cartao' },
    h('div', { class: 'rotulo' }, titulo),
    h('div', { class: 'valor' }, reais(r.entrou)),
    r.desde ? h('div', { class: 'sub' }, `desde ${dataHora(r.desde)}`) : null,
    h('ul', { class: 'lista' },
      h('li', {}, h('span', {}, 'Pix'), h('b', {}, reais(m.pix))),
      h('li', {}, h('span', {}, 'Dinheiro'), h('b', {}, reais(m.nota))),
      h('li', {}, h('span', {}, 'Cartão'), h('b', {}, reais(m.cartao))),
      h('li', {}, h('span', {}, 'Músicas tocadas'), h('b', {}, `${r.tocadas ?? 0}${r.gratis ? ` (+${r.gratis} grátis)` : ''}`)),
      papel !== 'ponto' ? h('li', {}, h('span', {}, `Empresa (${100 - pctPonto}%)`), h('b', {}, reais(r.empresa))) : null,
      h('li', {}, h('span', {}, papel === 'ponto' ? `Sua parte (${pctPonto}%)` : `Ponto (${pctPonto}%)`), h('b', { style: 'color:var(--ciano)' }, reais(r.ponto)))));
}

async function telaMaquina(id) {
  let m;
  try {
    m = await api(`/maquinas/${encodeURIComponent(id)}`);
  } catch (err) {
    return mostrar(h('main', { class: 'pagina' }, h('button', { class: 'voltar', onclick: () => { location.hash = ''; } }, '‹ Voltar'), h('p', { class: 'erro' }, err.message)));
  }
  const papel = sessao.usuario.papel;
  const desenhar = () => mostrar(h('main', { class: 'pagina' },
    h('button', { class: 'voltar', onclick: () => { location.hash = ''; } }, '‹ Todas as máquinas'),
    topo(m.nome, `${m.local || 'Sem local'} · ${m.online ? '🟢 em dia' : m.nunca_enviou ? '⚪ nunca enviou' : '🔴 sem enviar'} · ${haQuanto(m.ultimo_em)}`),
    abasPeriodo(desenhar),
    cartaoTotais({ [periodo]: { ...m.periodos[periodo], ponto: Math.round(m.periodos[periodo].entrou * m.porcentagem_ponto) / 100 } }, papel),
    m.dias.length ? h('section', { class: 'cartao' }, h('div', { class: 'rotulo' }, 'Últimos 14 dias'), grafico(m.dias)) : null,
    h('div', { class: 'secao-titulo' }, h('h2', {}, 'Relógio da máquina'), h('span', {}, 'igual ao menu do operador')),
    blocoRelogio('Parcial (desde o último fechamento)', m.relogio?.parcial, papel, m.porcentagem_ponto),
    blocoRelogio('Total (desde a instalação)', m.relogio?.total, papel, m.porcentagem_ponto),
    m.fechamentos.length ? h('section', { class: 'cartao' }, h('div', { class: 'rotulo' }, 'Fechamentos'),
      h('ul', { class: 'lista' }, ...m.fechamentos.map((f) => h('li', {}, h('span', {}, dataHora(f.em)),
        h('b', {}, `${reais(f.entrou)} · ponto ${reais(f.ponto)}`))))) : null,
    m.top.length ? h('section', { class: 'cartao' }, h('div', { class: 'rotulo' }, 'Mais pedidas'),
      h('ul', { class: 'lista' }, ...m.top.map((t, i) => h('li', {}, h('span', {}, `${i + 1}. ${t.titulo} · ${t.artista}`), h('b', {}, `${t.vezes}×`))))) : null,
    m.status ? h('section', { class: 'cartao' }, h('div', { class: 'rotulo' }, 'Situação'),
      h('ul', { class: 'lista' },
        h('li', {}, h('span', {}, 'Noteiro / botões'), h('b', {}, m.status.noteiro?.ativo ? (m.status.noteiro.conectado ? 'ligado' : 'desconectado') : 'desligado')),
        m.status.disco_livre_pct != null ? h('li', {}, h('span', {}, 'Disco livre'), h('b', {}, `${m.status.disco_livre_pct}%`)) : null,
        h('li', {}, h('span', {}, 'Último relatório'), h('b', {}, dataHora(m.ultimo_em))),
        m.versao ? h('li', {}, h('span', {}, 'Versão'), h('b', {}, m.versao)) : null)) : null));
  desenhar();
}

// ---------- Cadastros (dono) ----------
async function telaCadastros(mensagem = null) {
  let dados;
  try {
    dados = await api('/admin');
  } catch (err) {
    return mostrar(h('main', { class: 'pagina' }, h('p', { class: 'erro' }, err.message)));
  }
  const parceiros = dados.usuarios.filter((u) => u.papel === 'parceiro');
  const pontos = dados.usuarios.filter((u) => u.papel === 'ponto');
  const opcoes = (lista, atual, vazio) => [h('option', { value: '' }, vazio), ...lista.map((u) => h('option', { value: u.id, selected: u.id === atual }, `${u.nome} (${u.login})`))];

  // Nova máquina
  const nome = h('input', { placeholder: 'Ex.: Máquina 224', required: true, maxlength: 40 });
  const local = h('input', { placeholder: 'Ex.: Boate Estrela', maxlength: 80 });
  const parceiro = h('select', {}, ...opcoes(parceiros, null, 'Sem parceiro'));
  const ponto = h('select', {}, ...opcoes(pontos, null, 'Sem ponto'));
  const formMaquina = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        const r = await api('/admin/maquinas', { metodo: 'POST', corpo: { nome: nome.value, local: local.value, parceiro_id: parceiro.value || null, ponto_id: ponto.value || null } });
        telaCadastros({ tipo: 'token', nome: nome.value, token: r.token });
      } catch (err) { telaCadastros({ tipo: 'erro', texto: err.message }); }
    },
  }, h('label', {}, 'Nome da máquina', nome), h('label', {}, 'Local (boate)', local), h('label', {}, 'Parceiro', parceiro), h('label', {}, 'Ponto (dono da boate)', ponto), h('button', { class: 'botao' }, 'Cadastrar máquina'));

  // Novo acesso
  const uNome = h('input', { required: true, maxlength: 80, placeholder: 'Ex.: João da Boate Estrela' });
  const uLogin = h('input', { required: true, maxlength: 40, autocapitalize: 'none', placeholder: 'Ex.: joao.estrela' });
  const uSenha = h('input', { required: true, minlength: 8, placeholder: 'Pelo menos 8 caracteres' });
  const uPapel = h('select', {}, h('option', { value: 'ponto' }, 'Ponto (dono da boate): vê só a máquina dele e a parte dele'),
    h('option', { value: 'parceiro' }, 'Parceiro: vê as máquinas dele'), h('option', { value: 'dono' }, 'Dono: vê e cadastra tudo'));
  const formUsuario = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      try {
        await api('/admin/usuarios', { metodo: 'POST', corpo: { nome: uNome.value, login: uLogin.value, senha: uSenha.value, papel: uPapel.value } });
        telaCadastros({ tipo: 'ok', texto: `Acesso criado. Mande para a pessoa: endereço deste app, login "${uLogin.value.trim().toLowerCase()}" e a senha.` });
      } catch (err) { telaCadastros({ tipo: 'erro', texto: err.message }); }
    },
  }, h('label', {}, 'Nome', uNome), h('label', {}, 'Login', uLogin), h('label', {}, 'Senha', uSenha), h('label', {}, 'Tipo de acesso', uPapel), h('button', { class: 'botao' }, 'Criar acesso'));

  const aviso = mensagem?.tipo === 'token'
    ? h('section', { class: 'cartao' },
      h('div', { class: 'rotulo' }, `Token da ${mensagem.nome}`),
      h('p', { class: 'sub' }, 'Cole na tela de configuração da jukebox, no campo "Token da máquina". Ele aparece só agora: copie antes de sair.'),
      h('div', { class: 'token' }, mensagem.token),
      h('button', { class: 'botao secundario', onclick: () => navigator.clipboard?.writeText(mensagem.token) }, 'Copiar token'))
    : mensagem ? h('p', { class: mensagem.tipo === 'erro' ? 'erro' : 'ok' }, mensagem.texto) : null;

  const linhaMaquina = (m) => {
    const p = h('select', { onchange: (e) => api(`/admin/maquinas/${m.id}`, { metodo: 'PUT', corpo: { parceiro_id: e.target.value || null } }).catch((err) => alert(err.message)) }, ...opcoes(parceiros, m.parceiro_id, 'Sem parceiro'));
    const pt = h('select', { onchange: (e) => api(`/admin/maquinas/${m.id}`, { metodo: 'PUT', corpo: { ponto_id: e.target.value || null } }).catch((err) => alert(err.message)) }, ...opcoes(pontos, m.ponto_id, 'Sem ponto'));
    return h('section', { class: 'cartao' },
      h('div', { class: 'rotulo' }, `${m.nome}${m.local ? ` · ${m.local}` : ''}`),
      h('p', { class: 'sub' }, `Último relatório: ${haQuanto(m.ultimo_em)}`),
      h('div', { class: 'linha-dupla' }, h('label', {}, 'Parceiro', p), h('label', {}, 'Ponto', pt)),
      h('div', { class: 'linha-dupla', style: 'margin-top:10px' },
        h('button', { class: 'botao secundario', onclick: async () => {
          if (!confirm(`Gerar um token novo para ${m.nome}? O antigo para de funcionar.`)) return;
          const r = await api(`/admin/maquinas/${m.id}/token`, { metodo: 'POST' });
          telaCadastros({ tipo: 'token', nome: m.nome, token: r.token });
        } }, 'Token novo'),
        h('button', { class: 'botao secundario', onclick: async () => {
          if (!confirm(`Apagar ${m.nome} e todo o histórico dela da central?`)) return;
          await api(`/admin/maquinas/${m.id}`, { metodo: 'DELETE' });
          telaCadastros({ tipo: 'ok', texto: 'Máquina apagada.' });
        } }, 'Apagar')));
  };

  mostrar(h('main', { class: 'pagina' },
    h('button', { class: 'voltar', onclick: () => { location.hash = ''; } }, '‹ Painel'),
    topo('Cadastros', 'Máquinas e acessos'),
    aviso,
    h('section', { class: 'cartao' }, h('div', { class: 'rotulo' }, 'Nova máquina'), formMaquina),
    h('div', { class: 'secao-titulo' }, h('h2', {}, 'Máquinas'), h('span', {}, String(dados.maquinas.length))),
    ...dados.maquinas.map(linhaMaquina),
    h('section', { class: 'cartao' }, h('div', { class: 'rotulo' }, 'Novo acesso'), formUsuario),
    h('div', { class: 'secao-titulo' }, h('h2', {}, 'Acessos'), h('span', {}, String(dados.usuarios.length))),
    h('section', { class: 'cartao' }, h('ul', { class: 'lista' }, ...dados.usuarios.map((u) => h('li', {},
      h('span', {}, `${u.nome} · ${u.login} · ${u.papel}`),
      u.login === sessao.usuario.login ? h('b', {}, 'você') : h('button', { class: 'voltar', onclick: async () => {
        if (!confirm(`Tirar o acesso de ${u.nome}?`)) return;
        await api(`/admin/usuarios/${u.id}`, { metodo: 'DELETE' });
        telaCadastros({ tipo: 'ok', texto: 'Acesso removido.' });
      } }, 'remover')))))));
}

// ---------- Rotas ----------
function rotear() {
  clearInterval(relogio);
  if (!sessao) return telaLogin();
  const [, rota, id] = location.hash.split('/');
  if (rota === 'maquina' && id) return telaMaquina(id);
  if (rota === 'cadastros') return telaCadastros();
  relogio = setInterval(() => { if (!location.hash || location.hash === '#/') telaPainel(); }, ATUALIZAR_MS);
  return telaPainel();
}

window.addEventListener('hashchange', rotear);
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalar = e; if (!location.hash) rotear(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
rotear();
