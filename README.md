# 🎵 Jukebox Pix

Jukebox digital para boates: o cliente escaneia o QR code no monitor, paga via Pix pelo celular, escolhe a música e ela toca na hora. Tudo roda num notebook na própria casa; só a cobrança do Pix usa a internet.

## Início rápido (desenvolvimento)

Requer Node 20+.

```bash
npm run setup     # instala dependências, compila o frontend e popula o banco com acervo de teste
npm start
```

| O quê | Endereço |
|---|---|
| App do cliente (celular, mesma rede WiFi) | `http://<IP do notebook>:3000` (aparece no terminal) |
| Monitor da boate (QR code + fila) | `http://localhost:3000/tela` |
| Admin | `http://localhost:3000/admin` (senha: `ADMIN_PASSWORD` do `.env`) |

Em desenvolvimento o pagamento é **simulado** (`PAYMENT_PROVIDER=mock`): a tela do Pix tem um botão "Simular pagamento". Sem mpv/VLC instalado o player também é simulado (a música "toca" por 15 s, sem áudio).

Para mexer no frontend com recarga automática: `npm start` num terminal e `npm run dev:web` em outro (abre em `:5173`).

## Colocando na boate

1. **Player de verdade**: instale o [mpv](https://mpv.io) (ou o VLC) e deixe no PATH, ou aponte `MPV_PATH` / `VLC_PATH` no `.env`. Em produção o servidor se recusa a subir sem player, para não cobrar por música muda.
2. **Pagamento real (Mercado Pago)**: crie uma aplicação no painel de desenvolvedores do Mercado Pago, copie o *Access Token* de produção e configure:
   ```
   NODE_ENV=production
   PAYMENT_PROVIDER=mercadopago
   MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
   ADMIN_PASSWORD=uma-senha-forte
   ```
   Com `NODE_ENV=production` o servidor não sobe com `mock` nem com a senha padrão.
   **Webhook não é obrigatório**: o notebook consulta o Mercado Pago a cada 5 s pelos Pix em aberto. Só configure `WEBHOOK_PUBLIC_URL` (e `MERCADOPAGO_WEBHOOK_SECRET`) se expuser o notebook por um túnel.
3. **Rede**: reserve um IP fixo para o notebook no roteador e libere a porta 3000 no firewall do Windows (rede privada). Se o QR code mostrar o IP errado, defina `PUBLIC_URL`. A internet pode cair: a música continua tocando, só não dá para gerar Pix novo.
4. **Acervo**: dois jeitos de adicionar músicas (MP3, M4A, WAV, FLAC, OGG). Título e duração vêm das tags; sem tag, vale o nome do arquivo (`01 - Título.mp3` também define a ordem).
   - **Um CD**: `/admin` → *Novo CD* (envia pelo navegador).
   - **Vários CDs de uma vez**: `/admin` → *Importar*. Copie as pastas para `musicas\_importar` (o caminho aparece na tela), clique em *Procurar CDs*, marque os que quer e importe. Estrutura aceita: `Artista\CD\faixas` (a categoria é escolhida na tela) ou `Categoria\Artista\CD\faixas` (a categoria vem da pasta e é criada se não existir). `2019 - Nome do CD` ou `Nome do CD (2019)` define o ano; uma imagem na pasta (`capa.jpg`, `cover.jpg`...) vira a capa. Você escolhe se entram como *Lançamento* ou *direto na categoria* (use esta para o acervo antigo, senão todos viram "lançamento" por 7 dias). Os arquivos são **movidos** (a pasta fica vazia); CD que já existe é pulado e, se um CD falhar, os arquivos dele voltam para a pasta.
5. Troque o acervo de teste: `npm run seed` só roda em banco vazio; `npm run seed -- --force` **apaga acervo e histórico de reprodução**. Não rode na boate depois de começar a operar.

## Regras de negócio implementadas

- 1 crédito = R$ 1,00 = 1 música. Valores rápidos R$ 5/10/20/50 ou qualquer inteiro de R$ 1 a R$ 500.
- Sessão anônima por celular (guardada no navegador). **Créditos vencem após `SESSAO_TTL_MIN` (60) minutos sem pagar nem pedir música**; o aviso aparece na home e na tela de pagamento. Vale conferir com seu contador/jurídico se esse prazo é adequado para o consumidor.
- Música que não toca (arquivo sumiu, player falhou) devolve o crédito automaticamente. Remover da fila pelo admin também reembolsa; pular uma música em andamento não.
- CDs novos ficam 7 dias (`LANCAMENTO_DIAS`) só em **LANÇAMENTOS**, com contagem regressiva, e depois passam para a categoria. O job roda à meia-noite e também ao iniciar (recupera se o notebook estava desligado). A busca encontra músicas de CDs novos.
- **Playlist automática**: com a fila vazia, o player sorteia uma música do acervo (sem repetir as últimas 15) para o salão não ficar em silêncio. Liga/desliga em `/admin` → *Player* (fica salvo ao reiniciar). Ela **não conta** em "mais tocadas" nem no faturamento. Por padrão o pedido de um cliente espera a aleatória terminar; há uma opção para cortá-la na hora.
- **Créditos de cortesia do dono**: em `/admin` → *Cortesia* você adiciona até `CREDITOS_DONO_MAX` (50) créditos **sem Pix, uma vez por dia** (vale o dia do relógio do notebook; renova à meia-noite). Caem na sessão do navegador onde você está logado no admin (use o mesmo endereço no app). Ficam num saldo à parte: gastam primeiro, vencem como os demais, voltam ao mesmo saldo se a música falhar, e **não entram no faturamento nem na divisão com a boate**.
- Divisão 50/50 (`DIVISAO_USUARIO`) calculada sobre as músicas **pagas efetivamente tocadas**; o admin também mostra quantas foram de cortesia e o total de Pix recebido (inclui créditos ainda não usados).
- Pagamentos são idempotentes: webhook repetido ou consulta duplicada não credita duas vezes. O status do pagamento vem sempre da API do provedor, nunca do corpo do webhook.

## Estrutura

```
backend/
  server.js, config.js, database.js, events.js (SSE), player.js, seed.js, rede.js
  routes/       categorias, artistas, cds, musicas, sessoes, fila, pagamento, info, admin
  services/     catalogo, fila, sessoes, pagamentos, biblioteca, importacao, cortesia, configuracoes, gateways/{mock,mercadopago}
  crons/        lancamentos (meia-noite), manutencao (expira créditos, consulta Pix)
  middleware/   auth (token do admin)
frontend/src/   App.jsx, pages/ (Home, Categorias, Artistas, CDs, Musicas, Busca, Top, Pagar, Tela, AdminPanel), components/, context/
musicas/        arquivos de áudio e capas (não vão pro git)
database/       jukebox.db (SQLite; faça backup copiando este arquivo)
```

Tempo real (fila, saldo, ranking) via Server-Sent Events em `/api/eventos`. O id da sessão funciona como senha do saldo e nunca é enviado a outros clientes; a fila mostra apelidos anônimos ("Convidado 4F2A").

## API

`GET /api/categorias` · `/categorias/:id/artistas` · `/artistas/:id/cds` · `/cds/:id/musicas` · `/cds/lancamentos` · `/musicas/{top-tocadas,sugestoes,buscar?q=}` · `/sessoes/:id` · `/fila/:session_id` · `POST /sessoes` · `/fila/adicionar` · `/pagamento/iniciar` · `/pagamento/webhook` · `GET /pagamento/:id` · `/info`

Admin (`Authorization: Bearer <token>` de `POST /api/admin/login`): `/admin/stats`, `/admin/biblioteca`, `/admin/cds/adicionar` (multipart), `GET|POST /admin/importacao` (varre e importa a pasta `_importar`), `PUT|DELETE /admin/cds/:id`, `/admin/cadastros`, `/admin/categorias`, `/admin/artistas`, `/admin/player` (+ `pular`, `pausar`, `retomar`), `PUT /admin/automatico`, `GET|POST /admin/cortesia`, `DELETE /admin/fila/:id`, `/admin/movimentacoes`.

## Limitações conhecidas

- Outros provedores (ex.: PagSeguro) não estão implementados: basta criar um arquivo em `backend/services/gateways/` com a mesma interface (`criarCobranca`, `consultar`, `extrairPixId`) e registrá-lo em `index.js`.
- O backup do banco é manual.
- Sem controle de volume nem crossfade; a barra de progresso usa a duração gravada no banco.
