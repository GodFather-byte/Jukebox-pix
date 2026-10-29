# Handoff
Atualizado por: Claude Code em 2026-10-29

## Objetivo atual
Jukebox de bar completa no próprio computador da máquina: o cliente escolhe e paga só na tela
(botões físicos como teclas + toque), com Pix, cartão (Mercado Pago Point) e dinheiro (noteiro),
e pode pedir músicas do YouTube (áudio e capa baixados na hora).

## Feito nesta sessão (branch `claude/vibrant-faraday-etr6xs`, PR GodFather-byte/Jukebox-pix#9, ainda sem merge)
- Instalador traz mpv/ffmpeg/yt-dlp; tela de configuração no lugar do `.env` (desktop/).
- Servidor só atende o próprio computador; sessão única da máquina; cartão Point e noteiro serial.
- Tela do cliente refeita 3 vezes a pedido do dono. Versão atual: `frontend/src/maquina/`, visual
  "palco neon" (carrossel 3D de capas, faixa de ritmos, faixas em 2 colunas, botões desenhados embaixo).
  O dono NÃO quer cópia da máquina da foto que mandou nem o estilo Spotify anterior.
- Busca no YouTube pela máquina (`Internet.jsx`, teclado na tela navegável pelos botões). Testado com
  `tests/yt-dlp-falso.js`: busca, confirma, baixa com capa e entra na fila.

## Próximo passo
- Dono testar o instalador do CI (Actions → Desktop → Artifacts) e aprovar o visual. Merge só com OK dele.
- Opcional: tela de descanso (sem uso por um tempo) e cartazes na tela da máquina.

## Arquivos relevantes
- `frontend/src/maquina/Maquina.jsx`: tela principal e navegação pelos botões.
- `frontend/src/maquina/teclas.js`: mapa botão → tecla (só teclas de controle; letras livres na busca).
- `frontend/src/maquina/Pagamento.jsx`, `Internet.jsx`, `maquina.css`.
- `backend/services/pagamentos.js`, `gateways/point.js`, `noteiro.js`, `quiosque.js`, `catalogo.js` (`todosOsCds`).

## Decisões e motivo
- Botões físicos = teclas (encoder de fliperama/Arduino), sem driver próprio.
- Ritmo guardado pelo id, não pelo índice: baixar da internet cria o gênero "Sob demanda" e mudaria a seleção.
- Recado no telão e vale-música não têm tela no cliente agora (o painel ainda configura).

## Pendências e armadilhas
- Não testado com aparelho real: maquininha Point, noteiro/moedeiro, placa dos botões.
- `npm run desktop:rebuild` troca o SQLite para o Electron; rode `npm ci` antes de `npm test` depois.
- `styles.css` ainda tem estilos das telas antigas do cliente (só o painel e o telão usam esse arquivo).

## Como rodar e testar
`npm test` (26 testes). Tela em modo teste: `npm run build`, `npm run seed`,
`PAYMENT_PROVIDER=mock PLAYER=sim npm start` e abrir http://localhost:3000.
Para a internet em teste: `YTDLP_PATH=tests/yt-dlp-falso.js` e ligar na aba Internet do painel.
