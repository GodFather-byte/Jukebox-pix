# Mapa do Jukebox Pix

## Pastas
- `backend/`: servidor Node (Express 5 + SQLite via better-sqlite3). Entrada: `backend/server.js`.
  - `config.js`: tudo que vem do `.env`. `database.js`: esquema e `garantirColuna`.
  - `player.js` + `audio.js`: toca com mpv/VLC (ou simulado, `PLAYER=sim`).
  - `routes/`: API em `/api/*`. `quiosque.js` (sessão única da máquina), `cds.js` (`GET /api/cds` = acervo na
    ordem da máquina), `fila.js`, `pagamento.js`, `youtube.js` (busca/compra da internet), `admin.js` (painel).
  - `services/`: regras. `pagamentos.js` (Pix, cartão, nota), `gateways/` (mock, mercadopago = Pix,
    point = maquininha), `noteiro.js` (placa serial), `quiosque.js`, `catalogo.js`, `fila.js`,
    `sobdemanda.js` + `youtube.js` (download do YouTube com capa, via yt-dlp), `relatorio.js`.
  - `crons/`: lançamentos, backup, manutenção (consulta pagamentos pendentes a cada 5 s), vigia.
- `frontend/`: React + Vite. Entrada: `frontend/src/main.jsx` → `App.jsx`.
  - `maquina/`: **tela do cliente** (rota `/` e `/tela`). `Maquina.jsx` (carrossel, faixas, botões),
    `Pagamento.jsx` (colocar créditos), `Internet.jsx` (busca no YouTube com teclado na tela),
    `teclas.js` (botões físicos → teclas), `maquina.css`.
  - `pages/AdminPanel.jsx` + `pages/admin/`: painel do dono (`/admin`). `pages/Telao.jsx`: 2º monitor (`/telao`).
  - `context/Sessao.jsx`: sessão da máquina, fila e eventos em tempo real (SSE `/api/eventos`).
- `desktop/`: aplicativo Electron. `main.cjs` (janela, menu, sobe o backend), `settings.cjs` (`.env`),
  `configurar.*` + `configuracao.cjs` (tela de configuração), `ferramentas.cjs` (mpv/ffmpeg/yt-dlp do instalador),
  `smoke.mjs` (teste do pacote no CI).
- `scripts/baixar-ferramentas.mjs`: baixa mpv/ffmpeg/yt-dlp para o instalador (roda no CI).
- `tests/`: `node --test`. `quiosque.test.js` (máquina, pagamentos, noteiro), `desktop.test.js`, `backend.test.js`.
- `docs/`: `NOTEIRO.md` (placa e Arduino), `HOSPEDAGEM.md`, `NOVAS-FUNCIONALIDADES.md` (guia antigo do painel).
- `.github/workflows/desktop.yml`: CI que testa e gera os instaladores (Windows .exe, Linux AppImage/.deb).

## Dados (pasta do usuário no desktop, raiz do repo em desenvolvimento)
`.env`, `database/jukebox.db`, `musicas/` (acervo, `SobDemanda/` = baixadas da internet, `capas/`), `backups/`.
