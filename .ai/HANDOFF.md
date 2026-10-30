# Handoff
Atualizado por: Claude Code em 2026-10-30 (branch `claude/vibrant-faraday-etr6xs`, recriada da `main`)

## Objetivo atual
Jukebox de bar no computador da máquina: música por créditos, Pix, Point, noteiro, busca YouTube e tela por
toque/botões físicos. Próxima meta do dono: **piloto na boate**.

## Situação da equipe
- PR #9 (Claude Code: instalador, tela "palco neon", Point, noteiro, YouTube) e PR #10 (Codex: testes de
  pagamento Pix sem crédito duplicado) já estão na `main`.
- `tests/pagamento-idempotencia.test.js` do Codex foi executado pelo Claude Code: passa (suíte inteira: 30 testes).

## Feito nesta sessão (para o piloto)
- Créditos não vencem: `SESSAO_TTL_MIN=0` é o padrão (`backend/config.js`, `backend/services/sessoes.js`).
  Com valor > 0 volta a vencer como antes.
- Playlist automática espera 5 min de silêncio antes de cada aleatória: chave `automatico_intervalo_min`
  (`backend/services/configuracoes.js`, `backend/player.js`), seletor na aba Player do painel. 0 = sem pausa.
- Aleatória que chama o cliente (chaves `automatico_so_top`, `automatico_volume`, `automatico_vinheta`): sorteia entre
  as 40 mais tocadas (`fila.criarAutomatico`), toca a 80% do volume (`player.js` `volumeDe`), vinheta de chamada
  antes (`chamadaFeita` em `player.js`) e a tela mostra "Tocando de graça" (`Maquina.jsx`, `atual.automatica`).
- "Abrir o jukebox ao ligar o computador": caixa na tela de configuração (`INICIAR_COM_SISTEMA` no `.env`),
  aplicada em `desktop/inicio-automatico.cjs` (Windows: login item; Linux: `~/.config/autostart`).

## Migração das máquinas de um parceiro (JukeLinux)
- O dono vai trocar o sistema de ~30 jukeboxes de um parceiro (dono da JukeLinux) pelo Jukebox-pix, num SSD novo
  (o HD antigo fica guardado intacto). O acervo deles é MP3 comum em `~/musicas/ARTISTA - CD/NN - faixa.mp3`.
- Importador aceita esse formato: pasta única "Artista - CD" (`separarArtista` em `backend/services/importacao.js`).
  Pastas só com clipes (.mpg/.mp4, ~15% do que toca lá) aparecem como ignoradas: vídeo ainda não é suportado.
- A importação MOVE os arquivos: copie o acervo do HD antigo para a pasta de importar, nunca aponte para o HD original.
- Falta para o piloto nessas máquinas: ler o crédito do moedeiro/noteiro/chave de 20 deles (aguardando diagnóstico),
  modo aparelho + instalador por pendrive, tocar clipes, importar histórico de `tocados.txt`, fechamento com % do ponto.

## Próximos passos
1. Dono testar o instalador do CI (Actions → Desktop → Artifacts) no computador da boate, primeiro em
   "Só experimentar", depois "Atender clientes" só com Pix e valores baixos.
2. Depois: maquininha Point; por último noteiro e placa dos botões (teclas em `frontend/src/maquina/teclas.js`).
3. Opcional: tela de descanso e cartazes na tela da máquina.

## Arquivos e decisões importantes
- Pix e cartões: `backend/services/pagamentos.js`, `backend/services/gateways/`. Nunca creditar sem confirmação.
- Máquina: `frontend/src/maquina/`. Desktop: `desktop/`. Servidor só na própria máquina.
- O dono não quer estilo Spotify nem cópia da máquina da foto de referência.
- `npm run desktop:rebuild` troca o SQLite para o Electron: rode `npm ci` antes dos testes Node.

## Como rodar e testar
`npm test`. Tela em modo teste: `npm run build`, `npm run seed`, `PAYMENT_PROVIDER=mock PLAYER=sim npm start`.
