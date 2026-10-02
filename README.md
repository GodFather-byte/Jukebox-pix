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
5. **Deixe o notebook pronto para a noite**: rode `.\scripts\instalar-inicio-automatico.ps1` (cria um atalho em *Inicializar* que abre `iniciar.bat`, que sobe a jukebox e a reinicia sozinha se ela cair; `scripts\remover-inicio-automatico.ps1` desfaz). Para o notebook voltar sozinho após queda de energia, configure o login automático do Windows (`netplwiz`) e desative a suspensão (`powercfg /change standby-timeout-ac 0`). Em /admin → *Sistema* confira se está tudo verde (player de verdade, internet, disco, músicas sem arquivo).
6. Troque o acervo de teste: `npm run seed` só roda em banco vazio; `npm run seed -- --force` **apaga acervo e histórico de reprodução**. Não rode na boate depois de começar a operar.

## Regras de negócio implementadas

- 1 crédito = R$ 1,00 = 1 música. Valores rápidos R$ 5/10/20/50 ou qualquer inteiro de R$ 1 a R$ 500.
- Sessão anônima por celular (guardada no navegador). **Créditos vencem após `SESSAO_TTL_MIN` (60) minutos sem pagar nem pedir música**; o aviso aparece na home e na tela de pagamento. Vale conferir com seu contador/jurídico se esse prazo é adequado para o consumidor.
- Música que não toca (arquivo sumiu, player falhou) devolve o crédito automaticamente. Remover da fila pelo admin também reembolsa; pular uma música em andamento não.
- CDs novos ficam 7 dias (`LANCAMENTO_DIAS`) só em **LANÇAMENTOS**, com contagem regressiva, e depois passam para a categoria. O job roda à meia-noite e também ao iniciar (recupera se o notebook estava desligado). A busca encontra músicas de CDs novos.
- **Playlist automática**: com a fila vazia, o player sorteia uma música do acervo (sem repetir as últimas 15) para o salão não ficar em silêncio. Liga/desliga em `/admin` → *Player* (fica salvo ao reiniciar). Ela **não conta** em "mais tocadas" nem no faturamento. Por padrão o pedido de um cliente espera a aleatória terminar; há uma opção para cortá-la na hora.
- **Créditos de cortesia do dono**: em `/admin` → *Cortesia* você adiciona até `CREDITOS_DONO_MAX` (50) créditos **sem Pix, uma vez por dia** (vale o dia do relógio do notebook; renova à meia-noite). Caem na sessão do navegador onde você está logado no admin (use o mesmo endereço no app). Ficam num saldo à parte: gastam primeiro, vencem como os demais, voltam ao mesmo saldo se a música falhar, e **não entram no faturamento nem na divisão com a boate**.
- **Furar a fila**: em /admin → *Regras* você liga o `⚡ A seguir` e define quantos créditos extras ele custa (padrão 2) e quantos prioritários podem esperar ao mesmo tempo. O pedido entra à frente dos normais (e os prioritários seguem a ordem entre si) sem cortar a música que está tocando. O valor extra **conta no faturamento** e é reembolsado junto se o pedido for removido.
- **Proteção contra abuso** (em *Regras*, desligadas por padrão): máximo de músicas de uma pessoa na fila ao mesmo tempo e bloqueio de música que já está na fila ou tocou há X minutos. Pedido recusado **não cobra** crédito. A playlist automática não conta como repetição.
- **Vendas encerradas**: um botão em *Regras* para quando a casa for fechar. Ninguém gera Pix novo, mas quem já tem crédito continua pedindo. Vale na hora nos celulares.
- **Mural de avisos**: um texto curto (até 140 letras) exibido no topo do app e no monitor (ex.: promoção, happy hour).
- **Cliente**: aviso (e vibração) quando a música dele é a próxima e quando começa a tocar; seção *Pedir de novo*; **Cancelar** na tela do Pix cancela de verdade no provedor, para o QR cancelado não poder ser pago depois; se a busca não acha, o cliente pode **sugerir** a música (você vê as mais pedidas em *Sugestões*, com o número de pessoas diferentes que pediram).
- **Backup automático**: todo dia às 4h (e ao iniciar, se ainda não houve um hoje) o banco é copiado para a pasta `backups` (`BACKUP_DIR`), mantendo os `BACKUP_MANTER` (14) mais recentes. Dá para fazer um na hora e baixar em *Sistema*. O backup guarda créditos, pagamentos, histórico e cadastros, **mas não as músicas**: copie a pasta `musicas` por conta própria. Para restaurar: pare o servidor, copie o arquivo por cima de `database\jukebox.db` (apague `jukebox.db-wal` e `jukebox.db-shm`) e inicie de novo.
- **Relatório e fechamento** (*Relatório*): escolha o período e veja faturado, sua parte, parte da boate, Pix recebido, ticket médio, horário de pico, dia a dia e mais tocadas. Baixe em CSV (abre no Excel) ou imprima o fechamento para mostrar à boate.
- Divisão 50/50 (`DIVISAO_USUARIO`) calculada sobre as músicas **pagas efetivamente tocadas**; o admin também mostra quantas foram de cortesia e o total de Pix recebido (inclui créditos ainda não usados).
- Pagamentos são idempotentes: webhook repetido ou consulta duplicada não credita duas vezes. O status do pagamento vem sempre da API do provedor, nunca do corpo do webhook.

## Estrutura

```
backend/
  server.js, config.js, database.js, events.js (SSE), player.js, seed.js, rede.js
  routes/       categorias, artistas, cds, musicas, sessoes, fila, pagamento, sugestoes, info, admin
  services/     catalogo, fila, sessoes, pagamentos, biblioteca, importacao, cortesia, configuracoes, sugestoes, backup, sistema, relatorio, gateways/{mock,mercadopago}
  crons/        lancamentos (meia-noite), manutencao (expira créditos, consulta Pix), backup (4h)
  middleware/   auth (token do admin)
frontend/src/   App.jsx, pages/ (Home, Categorias, Artistas, CDs, Musicas, Busca, Top, Pagar, Tela, AdminPanel), components/, context/
iniciar.bat     sobe a jukebox e reinicia se cair; scripts/ liga/desliga o início automático no Windows
musicas/        arquivos de áudio e capas (não vão pro git); _importar/ é a pasta de importação em lote
backups/        cópias diárias do banco
database/       jukebox.db (SQLite)
```

Tempo real (fila, saldo, ranking) via Server-Sent Events em `/api/eventos`. O id da sessão funciona como senha do saldo e nunca é enviado a outros clientes; a fila mostra apelidos anônimos ("Convidado 4F2A").

## API

`GET /api/categorias` · `/categorias/:id/artistas` · `/artistas/:id/cds` · `/cds/:id/musicas` · `/cds/lancamentos` · `/musicas/{top-tocadas,sugestoes,buscar?q=}` · `/sessoes/:id` · `/fila/:session_id` · `POST /sessoes` · `/fila/adicionar` · `/pagamento/iniciar` · `/pagamento/:id/cancelar` · `/pagamento/webhook` · `/sugestoes` · `GET /pagamento/:id` · `/sessoes/:id/pedidos` · `/config` · `/info`

Admin (`Authorization: Bearer <token>` de `POST /api/admin/login`): `/admin/stats`, `/admin/biblioteca`, `/admin/cds/adicionar` (multipart), `GET|POST /admin/importacao` (varre e importa a pasta `_importar`), `PUT|DELETE /admin/cds/:id`, `/admin/cadastros`, `/admin/categorias`, `/admin/artistas`, `/admin/player` (+ `pular`, `pausar`, `retomar`), `PUT /admin/automatico`, `GET|POST /admin/cortesia`, `GET|PUT /admin/regras`, `GET /admin/sugestoes` (+ `PUT /admin/sugestoes/:id`), `GET /admin/sistema`, `GET|POST /admin/backups` (+ `GET /admin/backups/:arquivo`), `GET /admin/relatorio` e `/admin/relatorio.csv`, `DELETE /admin/fila/:id`, `/admin/movimentacoes`.

## Limitações conhecidas

- Outros provedores (ex.: PagSeguro) não estão implementados: basta criar um arquivo em `backend/services/gateways/` com a mesma interface (`criarCobranca`, `consultar`, `extrairPixId`) e registrá-lo em `index.js`.
- O backup automático cobre o banco, não a pasta de músicas, e fica no mesmo computador: copie `backups` e `musicas` de vez em quando para um HD externo ou nuvem.
- Instalar o início automático usa a pasta *Inicializar* do usuário: o Windows precisa entrar nesse usuário (daí o login automático).
- Sem controle de volume nem crossfade; a barra de progresso usa a duração gravada no banco.
