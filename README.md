# 🎵 Jukebox Pix

Jukebox digital para boates, em aplicativo de Windows e Linux. **Tudo acontece na tela da máquina**, no estilo das jukebox de bar (capas, lista de faixas, botões RITMO / PÁGINA / TOCAR): o cliente coloca créditos com **Pix** (o QR abre na própria tela), **cartão de débito ou crédito** (maquininha Mercado Pago Point) ou **dinheiro** (noteiro), e escolhe a música pelos botões da máquina ou tocando na tela. O celular do cliente não acessa o jukebox. Tudo roda num computador na própria casa; só o Pix e o cartão usam a internet.

## Aplicativo desktop (Windows e Linux x64)

### Instalação e primeiro uso

Baixe o instalador `.exe` (Windows) ou `.AppImage`/`.deb` (Linux) em **Releases**. Em builds manuais ou de pull request, abra **Actions → Desktop → execução → Artifacts**, baixe e extraia o arquivo da sua plataforma. Artefatos de PR são builds de teste: confira a origem antes de executá-los. **Node.js só é necessário para desenvolvimento**, não para usar o aplicativo empacotado.

- **Windows:** execute o instalador e abra **Jukebox Pix** pelo atalho criado pelo instalador. O executável não tem assinatura digital; o Windows/SmartScreen pode exibir um aviso de editor desconhecido. Não desative as proteções do sistema: use apenas arquivos de origem verificada.
- **Linux:** para AppImage, dê permissão de execução (`chmod +x "arquivo.AppImage"`) e abra-o; algumas distribuições precisam instalar o suporte FUSE. Para Debian/Ubuntu, instale o `.deb` com `sudo apt install ./arquivo.deb` e abra pelo menu de aplicativos. A integração/atalho de AppImage depende do ambiente; mantenha o arquivo em um local permanente.
- **O instalador já traz as ferramentas.** No Windows vêm o mpv (player), o ffmpeg (volume parelho) e o yt-dlp (músicas da internet). No Linux vêm o ffmpeg e o yt-dlp; o player vem do sistema: o `.deb` instala o mpv sozinho, e quem usa o AppImage instala com `sudo apt install mpv`. Um player real é obrigatório em produção. Um caminho escrito no `.env` (`MPV_PATH`, `VLC_PATH`, `FFMPEG_PATH`, `YTDLP_PATH`) vale mais que o do instalador. O yt-dlp roda de uma cópia na pasta de dados, para o botão **Atualizar o yt-dlp** do painel funcionar.

No primeiro uso abre a **tela de configuração**, sem precisar editar arquivo:

- **Atender clientes (produção):** nome do local, senha do painel (já vem uma sugerida, com pelo menos **12 caracteres**) e o **Access Token** do Mercado Pago, com botão **Testar**. A tela mostra se o player, o ffmpeg e o yt-dlp foram encontrados. Ao salvar, o jukebox já abre pronto. Por baixo grava o `.env` com `DESKTOP_MODE=producao`, `HOST=127.0.0.1`, `PAYMENT_PROVIDER=mercadopago` e `PLAYER=auto`, e um `ADMIN_SECRET` aleatório.
- **Só experimentar (teste):** créditos grátis, player simulado e acesso só por `127.0.0.1`. Não cobra Pix nem comprova saída de áudio real.

Para mudar depois: menu **Jukebox Pix → Configurações…**. Ao salvar, o aplicativo reinicia com os valores novos. Token em branco mantém o que já estava, e ajustes feitos à mão no `.env` (`PLAYER=vlc`, `HOST`, Telegram etc.) continuam valendo. Se o `.env` estiver inválido, a mesma tela abre mostrando o problema. Nunca distribua seu `.env` com o instalador.

O modo é escolhido por **`DESKTOP_MODE`**, não por `NODE_ENV` no `.env`: o aplicativo força `NODE_ENV=development` em teste e `NODE_ENV=production` em produção. Para passar de teste a produção, use **Jukebox Pix → Configurações…**, escolha **Atender clientes** e cole o token do Mercado Pago: rede, provedor e player mudam juntos, e a senha e o `ADMIN_SECRET` continuam os mesmos. Não apague o `.env` para trocar de modo.

Ao abrir, o aplicativo mostra a **tela da jukebox** ("palco neon"):

- **Topo:** a música tocando, com capa e progresso, as próximas da fila e os **créditos**.
- **Faixa de ritmos:** Todos, Lançamentos, os gêneros e **Internet** (quando ligada no painel).
- **Meio:** carrossel de capas em 3D, com o CD escolhido no centro.
- **Embaixo:** o número e o nome do CD, as faixas em duas colunas e os botões da máquina desenhados (também dá para tocar neles).

**Botões da máquina.** Cada botão físico é uma tecla: ligue os botões numa placa que imita teclado, como um encoder de fliperama ou um Arduino. Só teclas de controle, para as letras ficarem livres na busca.

| Botão | Teclas | O que faz |
|---|---|---|
| RITMO | `Home`, `F1` | troca o gênero |
| PÁGINA ANTERIOR | `←`, `PageUp` | CD anterior |
| PRÓXIMA PÁGINA | `→`, `PageDown` | próximo CD |
| ↓ / ↑ | `↓` / `↑` | anda na lista de faixas |
| TOCAR | `Enter`, `Espaço` | põe a faixa escolhida na fila |
| CRÉDITOS | `Insert`, `F2` | abre a tela de créditos |
| INTERNET | `F3` | abre a busca no YouTube |
| VOLTAR | `Esc`, `End` | fecha a janela aberta |

Com **toque**: toque numa capa para escolher o CD, numa faixa para escolher e de novo para tocar, num ritmo para trocar de gênero.

**Sem crédito:** o TOCAR abre a tela de créditos (Dinheiro, Pix, Cartão débito ou crédito). Ela usa os mesmos botões: ↓ escolhe, ◀ ▶ muda o valor, TOCAR confirma e RITMO volta.

**Músicas da internet** (YouTube), quando o dono liga na aba *Internet* do painel:
1. Escolha o ritmo **Internet** (ou aperte `F3`) e TOCAR.
2. Escreva o nome no teclado da tela: ◀ ▶ ▼ escolhem a tecla e TOCAR aperta. Um teclado de verdade também funciona.
3. Escolha o resultado e aperte TOCAR duas vezes para confirmar.
4. A música e a capa são baixadas e a música entra na fila sozinha. Se o download falhar, o crédito volta.

No menu **Jukebox Pix** há **Tela do jukebox**, **Painel administrativo** (outra janela, para não tirar o cliente da tela), **Abrir telão (2º monitor)** (`/telao`), **Configurações…**, **Abrir pasta de dados e logs**, **Editar configuração avançada (.env)**, **Sobre a configuração** e **Sair**. O menu **Exibir** oferece **Recarregar** e **Tela cheia**. Alterações de configuração valem na próxima abertura; feche o aplicativo antes de editar ou migrar dados.

O servidor só atende o próprio computador (`HOST=127.0.0.1`): de fora entra apenas o aviso (webhook) do Mercado Pago. Para abrir o painel pela rede (no celular do dono, por exemplo), use `ACESSO_REDE=1` e `HOST=0.0.0.0` no `.env`, por sua conta: aí a rede também alcança a tela do jukebox.

### Cartão (maquininha) e dinheiro (noteiro)

- **Cartão de débito e crédito:** use uma maquininha **Mercado Pago Point** (Point Smart ou Point Pro) da mesma conta do Pix.
  1. Em **Configurações…**, cole o token e toque em **Procurar** na linha da maquininha.
  2. Escolha a maquininha. Se ela não estiver em modo PDV, toque em **Ativar modo PDV** e reinicie a maquininha.
  3. Na hora de pagar, o cliente escolhe débito ou crédito e o valor na tela. A cobrança aparece na maquininha, e os créditos entram sozinhos quando o pagamento é aprovado.
  4. Se o cliente desistir ou o tempo acabar (`CARTAO_EXPIRA_MIN`, padrão 3 min), a cobrança é cancelada na maquininha.
- **Dinheiro:** um noteiro ligado por uma placa USB, que é um Arduino ou a interface do noteiro.
  - Escolha a porta em **Configurações…** (Noteiro).
  - Cada nota aceita vira crédito na hora, com o bônus do horário se houver.
  - Protocolo da placa e exemplo para Arduino: [docs/NOTEIRO.md](docs/NOTEIRO.md).
- **Painel:** o relatório separa o que entrou por Pix, cartão e notas.


### Dados, atualização e migração

Os dados ficam em `app.getPath('userData')`, com o nome **Jukebox Pix**: normalmente `%APPDATA%\Jukebox Pix` no Windows e `~/.config/Jukebox Pix` no Linux (pode variar com as configurações do sistema). Essa pasta contém `.env`, `database`, `musicas`, `backups` e `logs/desktop.log`. O `.env` inicial é criado com exclusividade (`wx`), sem sobrescrever configuração existente; o aplicativo **não executa seed automaticamente**. O log registra apenas eventos sanitizados, não senhas ou tokens; ainda assim revise-o antes de compartilhar.

Não há **assinatura digital nem atualização automática** configuradas. Para atualizar, feche o aplicativo, faça backup da pasta de dados e instale/baixe a nova versão manualmente, preservando os dados. Não confunda a pasta do instalador com a pasta persistente.

Para migrar uma instalação antiga: **pare o servidor antigo e feche o desktop**, faça uma cópia de segurança completa e copie manualmente `database`, `musicas` e `backups` para a pasta de dados do desktop. Só copie para um destino sem dados ou escolha explicitamente uma restauração; **não sobrescreva um banco nem um `.env` existente**. Revise o `.env` antigo manualmente (caminhos, senha, provedor e rede) em vez de substituí-lo às cegas. O backup do banco sozinho não inclui as músicas.

### Desenvolvimento, builds nativos e CI

Use **Node.js 24** para desenvolver o desktop, com **Electron 45.0.0** e **electron-builder 26.15.3** fixados no `package.json` (better-sqlite3 13). Instale as dependências do projeto e do frontend:

```bash
npm ci
npm --prefix frontend ci
npm test
npm run build
npm run desktop
```

`npm test` executa `node --test tests/*.test.js`. Rode os testes Node **antes** de `desktop:rebuild`, pois o módulo SQLite nativo troca de ABI ao ser recompilado para Electron. Para voltar a executar o backend/testes com Node após usar Electron, reinstale as dependências com `npm ci`.

| Comando | Resultado |
|---|---|
| `npm run desktop:rebuild` | Executa `node node_modules/electron/install.js` para obter o runtime e `electron-builder install-app-deps` para recompilar módulos nativos |
| `npm run desktop` | Recompila os módulos e abre `electron .` |
| `npm run desktop:pack` | Compila o frontend e gera diretório desempacotado (`--dir --publish never`) |
| `npm run desktop:dist` | Compila o frontend e gera instaladores (`--publish never`) |

Saídas em `release/`; executáveis desempacotados: `release/win-unpacked/Jukebox Pix.exe` e `release/linux-unpacked/jukebox-pix`. Faça cada build no sistema correspondente: **Windows para Windows, Linux para Linux**, ambos x64; cross-compilation e macOS não fazem parte deste fluxo.

No Electron 45, instalar o pacote npm não baixa automaticamente o runtime: use `npm run desktop:rebuild` (também executado por `npm run desktop`) antes de abrir ou empacotar. Referências oficiais: [Electron 45 — utilityProcess](https://github.com/electron/electron/blob/v45.0.0/docs/api/utility-process.md), usado para executar o backend separado do renderer, e [documentação do electron-builder](https://www.electron.build/) ([repositório oficial](https://github.com/electron-userland/electron-builder)). Consulte essas fontes via HTTPS; recursos suportados pelas ferramentas, como assinatura e atualização automática, não significam que estejam configurados neste projeto.

O workflow `.github/workflows/desktop.yml` roda em PR, execução manual e push de tags `v*`, usando `windows-latest` e `ubuntu-24.04`. Instala dependências, roda testes Node antes da recompilação nativa, compila o frontend, empacota e chama `node desktop/smoke.mjs <executável>`, com `xvfb-run -a` no Linux. O smoke usa dados isolados, valida healthcheck/SQLite, carregamento do renderer e encerramento por IPC, persistência entre duas inicializações, porta ocupada e instância única. Ele verifica `smoke-result.json` com `ok: true` e saída zero. Se o ambiente CI Linux exigir `--no-sandbox`, a exceção deve ficar restrita ao smoke em CI; **não use essa opção na execução normal**.

Cada formato obrigatório (`.exe`, `.AppImage`, `.deb`) tem upload separado que falha se o arquivo faltar. Execuções manuais e PRs só fornecem artifacts; **nunca publicam releases**. Para publicar, atualize a versão do `package.json` e envie a tag exatamente `v<versão>` (por exemplo, `v1.0.0` para versão `1.0.0`). A CI rejeita divergências e só publica após os dois builds/smokes passarem; apenas o job de release recebe permissão de escrita.

Para gerar instaladores manualmente no GitHub: abra **Actions → Desktop → Run workflow**, escolha a branch e clique em **Run workflow**. Quando os dois jobs de build terminarem com sucesso, abra a execução e baixe os arquivos em **Artifacts**; extraia o ZIP antes de instalar. Isso não cria uma release.

Para publicar uma versão já revisada e commitada, com `package.json` e lockfile atualizados, envie a branch e depois a tag correspondente (exemplo para versão `1.0.0`; não reutilize uma tag existente):

```bash
git push origin HEAD
git tag v1.0.0
git push origin v1.0.0
```

O smoke está implementado na CI; isso **não significa que os instaladores tenham sido testados localmente**. Ele não valida SmartScreen, instalação/integração de atalhos, áudio físico, player externo, Pix real, firewall ou todas as distribuições Linux. Confira esses pontos no computador de operação antes de atender clientes.

## Início rápido (desenvolvimento)

Requer Node 20+.

```bash
npm run setup     # instala dependências, compila o frontend e popula o banco com acervo de teste
npm start
```

| O quê | Endereço |
|---|---|
| Tela do jukebox (toque) | `http://localhost:3000/` |
| Telão do salão (2º monitor) | `http://localhost:3000/telao` |
| Admin | `http://localhost:3000/admin` (senha: `ADMIN_PASSWORD` do `.env`) |

Em desenvolvimento o pagamento é **simulado** (`PAYMENT_PROVIDER=mock`): Pix e cartão têm um botão "Simular", e a aba Dinheiro tem botões de notas de teste. Sem mpv/VLC instalado o player também é simulado (a música "toca" por 15 s, sem áudio) e o painel mostra uma faixa vermelha **"SEM SOM"** em todas as abas. Para ouvir de verdade: `winget install VideoLAN.VLC` e reinicie o servidor (o terminal deve mostrar `Player: vlc`).

> **Guia das funcionalidades novas** (preço por CD, bônus por horário, recado no telão, vale-música, vinhetas e cartazes, volume parelho, alertas no Telegram, músicas da internet): [docs/NOVAS-FUNCIONALIDADES.md](docs/NOVAS-FUNCIONALIDADES.md).

> **Hospedar na internet** (Docker, Render, túnel Cloudflare): [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md).

Para mexer no frontend com recarga automática: `npm start` num terminal e `npm run dev:web` em outro (abre em `:5173`).

## Colocando na boate

1. **Player de verdade**: o mais simples é o VLC (`winget install VideoLAN.VLC`; o sistema o encontra sozinho em `C:\Program Files\VideoLAN\VLC`). O [mpv](https://mpv.io) também funciona e muda o volume com a música tocando; deixe-o no PATH ou aponte `MPV_PATH` / `VLC_PATH` no `.env`. Evite `winget install mpv`: esse nome instala um pacote reempacotado por terceiros (o mpv.io só lista builds de terceiros e os pacotes do Scoop e do Chocolatey). Se o mpv não abrir por falta de `vulkan-1.dll`, atualize o driver de vídeo ou use o VLC. Em produção o servidor se recusa a subir sem player, para não cobrar por música muda; em desenvolvimento ele cai no player simulado e o painel avisa com a faixa "SEM SOM".
2. **Pagamento real (Mercado Pago)**: crie uma aplicação no painel de desenvolvedores do Mercado Pago, copie o *Access Token* de produção e configure:
   ```
   NODE_ENV=production
   PAYMENT_PROVIDER=mercadopago
   MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
   ADMIN_PASSWORD=uma-senha-forte
   ```
   Com `NODE_ENV=production` o servidor não sobe com `mock` nem com a senha padrão.
   **Webhook não é obrigatório**: o notebook consulta o Mercado Pago a cada 5 s pelos Pix em aberto. Só configure `WEBHOOK_PUBLIC_URL` (e `MERCADOPAGO_WEBHOOK_SECRET`) se expuser o notebook por um túnel.
3. **Internet**: só o Pix e o cartão precisam dela. Se cair, a música continua tocando e o noteiro continua aceitando notas; só não dá para gerar Pix ou cobrança no cartão.
4. **Acervo**: dois jeitos de adicionar músicas (MP3, M4A, WAV, FLAC, OGG). Título e duração vêm das tags; sem tag, vale o nome do arquivo (`01 - Título.mp3` também define a ordem).
   - **Um CD**: `/admin` → *Novo CD* (envia pelo navegador).
   - **Vários CDs de uma vez**: `/admin` → *Importar*. Copie as pastas para `musicas\_importar` (o caminho aparece na tela), clique em *Procurar CDs*, marque os que quer e importe. Estrutura aceita: `Artista\CD\faixas` (a categoria é escolhida na tela) ou `Categoria\Artista\CD\faixas` (a categoria vem da pasta e é criada se não existir). `2019 - Nome do CD` ou `Nome do CD (2019)` define o ano; uma imagem na pasta (`capa.jpg`, `cover.jpg`...) vira a capa. Você escolhe se entram como *Lançamento* ou *direto na categoria* (use esta para o acervo antigo, senão todos viram "lançamento" por 7 dias). Os arquivos são **movidos** (a pasta fica vazia); CD que já existe é pulado e, se um CD falhar, os arquivos dele voltam para a pasta.
5. **Deixe o notebook pronto para a noite**: rode `.\scripts\instalar-inicio-automatico.ps1` (cria um atalho em *Inicializar* que abre `iniciar.bat`, que sobe a jukebox e a reinicia sozinha se ela cair; `scripts\remover-inicio-automatico.ps1` desfaz). Para o notebook voltar sozinho após queda de energia, configure o login automático do Windows (`netplwiz`) e desative a suspensão (`powercfg /change standby-timeout-ac 0`). Em /admin → *Sistema* confira se está tudo verde (player de verdade, internet, disco, músicas sem arquivo).
6. Troque o acervo de teste: `npm run seed` só roda em banco vazio; `npm run seed -- --force` **apaga acervo e histórico de reprodução**. Não rode na boate depois de começar a operar.

## Regras de negócio implementadas

- 1 crédito = R$ 1,00 = 1 música. Valores rápidos R$ 5/10/20/50 ou qualquer inteiro de R$ 1 a R$ 500.
- Um saldo só, o do jukebox: Pix, cartão, notas, vales e a cortesia do dono caem nele. **Créditos vencem após `SESSAO_TTL_MIN` (60) minutos sem pagar nem pedir música** (aumente no `.env` se quiser que o saldo deixado na máquina dure mais). Vale conferir com seu contador/jurídico se esse prazo é adequado para o consumidor.
- Música que não toca (arquivo sumiu, player falhou) devolve o crédito automaticamente. Remover da fila pelo admin também reembolsa; pular uma música em andamento não.
- CDs novos ficam 7 dias (`LANCAMENTO_DIAS`) só em **LANÇAMENTOS**, com contagem regressiva, e depois passam para a categoria. O job roda à meia-noite e também ao iniciar (recupera se o notebook estava desligado). A busca encontra músicas de CDs novos.
- **Playlist automática**: com a fila vazia, o player sorteia uma música do acervo (sem repetir as últimas 15) para o salão não ficar em silêncio. Liga/desliga em `/admin` → *Player* (fica salvo ao reiniciar). Ela **não conta** em "mais tocadas" nem no faturamento. Por padrão o pedido de um cliente espera a aleatória terminar; há uma opção para cortá-la na hora. Ainda no *Player* você escolhe **quais categorias** ela pode sortear e cria **janelas de horário** (ex.: 18:00 às 22:00 só Pagode e Sertanejo; depois da meia-noite, Funk e Eletrônica); a primeira janela que casa com o horário vale, senão vale a lista padrão. Se a restrição não achar música nenhuma, ela sorteia do acervo todo para não ficar em silêncio.
- **Créditos de cortesia do dono**: em `/admin` → *Cortesia* você adiciona até `CREDITOS_DONO_MAX` (50) créditos **sem Pix, uma vez por dia** (vale o dia do relógio do notebook; renova à meia-noite). Caem na sessão do navegador onde você está logado no admin (use o mesmo endereço no app). Ficam num saldo à parte: gastam primeiro, vencem como os demais, voltam ao mesmo saldo se a música falhar, e **não entram no faturamento nem na divisão com a boate**.
- **Furar a fila**: em /admin → *Regras* você liga o `⚡ A seguir` e define quantos créditos extras ele custa (padrão 2) e quantos prioritários podem esperar ao mesmo tempo. O pedido entra à frente dos normais (e os prioritários seguem a ordem entre si) sem cortar a música que está tocando. O valor extra **conta no faturamento** e é reembolsado junto se o pedido for removido.
- **Proteção contra abuso** (em *Regras*, desligadas por padrão): máximo de músicas de uma pessoa na fila ao mesmo tempo e bloqueio de música que já está na fila ou tocou há X minutos. Pedido recusado **não cobra** crédito. A playlist automática não conta como repetição.
- **Vendas encerradas**: um botão em *Regras* para quando a casa for fechar. Ninguém gera Pix novo, mas quem já tem crédito continua pedindo. Vale na hora na tela do jukebox. Também dá para programar o **horário** (ex.: abre 20:00, fecha 05:00, pode passar da meia-noite): as vendas abrem e fecham sozinhas e a tela atualiza na virada. A chave manual sempre vence o horário.
- **Bônus de recarga** (*Regras*): faixas como "R$ 20 → +2" e "R$ 50 → +8" (vale a maior faixa alcançada, não acumula; até 6 faixas). O cliente vê o bônus antes de pagar e recebe exatamente o que viu, mesmo que você mude as faixas depois. **O bônus é custo seu**: entra como cortesia, então não aumenta a parte da boate nem entra no faturamento dividido (a boate continua recebendo os 50% do que foi pago).
- **Console do dono** (`/admin` → *Console*): procure qualquer música e ponha na fila como **pedido da casa** (grátis, fora do faturamento e do ranking): *+ Fila* (no fim), *⚡ A seguir* (à frente de todos, até dos prioritários pagos) ou *▶ Agora* (corta a que está tocando; conta como tocada, sem reembolso).
- **Ocultar** música ou CD (*Console*, *Biblioteca*): some do app e da playlist automática e ninguém consegue pedir; você reexibe quando quiser. Em *Sistema*, "Ocultar todas do app" esconde de uma vez as músicas cujo arquivo sumiu, para ninguém pagar por faixa que falharia.
- **Volume** (*Player*): controle mestre de 0 a 100%. No mpv muda na hora, com a música tocando; no VLC vale a partir da próxima música. A escala do mpv é cúbica (50% = −18 dB, bem mais baixo que no VLC, onde 50% = −6 dB), então o mesmo ponto do controle soa diferente em cada player.
- **Preço por CD ou música**: cada música custa 1 crédito por padrão; defina outro preço (1 a 20 créditos) ao criar/importar o CD, em *Biblioteca* (todas as músicas do CD) ou *Console* (uma música). Em *Regras* há ainda um **preço mínimo para os lançamentos**, que volta ao normal sozinho quando o CD sai de LANÇAMENTOS. O app mostra "💰 N créditos" nas músicas que custam mais de 1; o que entra na fila é cobrado pelo preço da hora do pedido.
- **Bônus só em certos horários** (*Regras*): o bônus de recarga pode valer só dentro de janelas (ex.: 20:00 às 22:00); fora delas o cliente vê o bônus como convite ("bônus das 20:00 às 22:00") e o Pix gerado fora do horário não leva bônus. Sem janelas, vale o dia todo.
- **Recado no telão** (*Recados*): o cliente paga (padrão 5 créditos) por uma mensagem curta (até 60 letras) que aparece por alguns segundos no monitor `/tela`, um recado por vez e por cima de tudo. Você aprova cada um antes (recomendado) ou deixa ir direto ao ar, tem lista de palavras proibidas e pode tirar do ar reembolsando. Só aceita recado com um monitor `/tela` aberto. O dinheiro **só entra no faturamento quando o recado vai ao ar**; recusado, tirado do ar ou parado por mais de 30 minutos sem decisão, **volta** ao saldo de onde saiu (pago ou cortesia).
- **Vale-música** (*Vales*): gere lotes de cartões com código de uso único (ex.: "1 drink, 1 música" entregue pelo garçom), imprima, e o cliente ganha músicas grátis ao digitar o código na tela do jukebox (Colocar créditos → Tenho um vale-música). Entram como **cortesia (custo seu)**, fora do faturamento e da divisão; têm validade, dá para cancelar o que não foi usado, e há proteção contra quem fica chutando códigos.
- **Vinhetas de áudio e cartazes** (*Divulgação*): áudios curtos seus tocam entre as músicas a cada N músicas (não custam crédito e não entram em ranking nem faturamento); cartazes (imagens de patrocinadores/promoções, com período de validade) giram em tela cheia no monitor, e o painel conta quantas vezes cada um foi exibido.
- **Volume parelho** (*Player*): o ffmpeg mede o volume de cada música uma vez e o player sobe ou desce o volume dela até o mesmo nível (no mpv por um filtro, no VLC pelo `--gain`), sem distorcer (sobe no máximo 6 dB e respeita o pico da faixa). O alvo pode ser automático (volume típico do acervo) ou escolhido. CDs novos são medidos sozinhos. Precisa do ffmpeg (`winget install Gyan.FFmpeg`).
- **Avisos no Telegram** (*Alertas*): mensagens no seu celular quando o player falha 3 vezes seguidas, o Pix perde a conexão (e quando volta), falta espaço em disco, o backup falha ou a jukebox liga; e o **fechamento diário** (as 24 h até a hora escolhida), com uma versão resumida opcional para o contato da boate. Token e conversas ficam no `.env`.
- **Músicas da internet** (*Internet*, desligado de fábrica): quando o cliente não acha a música, o botão *Pesquisar na internet* mostra resultados do YouTube; ele paga (padrão 3 créditos), o servidor baixa o áudio e a capa daquela música com o **yt-dlp** (instalado à parte: `winget install yt-dlp.yt-dlp`) e a música entra na fila em cerca de 1 minuto, num CD criado sozinho ("Músicas Sob Demanda"). Fica guardada: pedir de novo é instantâneo. Se o download falhar, travar ou o servidor cair, o crédito **volta ao saldo de origem** (pago ou cortesia); só entra no faturamento quando toca, como qualquer música. Limites: 2 pedidos em preparo por pessoa, duração máxima (padrão 8 min), transmissão ao vivo recusada, limite de pesquisas por pessoa e por aparelho. Fica fora da playlist automática (opcional). **Atenção:** baixar do YouTube contraria os termos do YouTube e as músicas têm direitos autorais; o aviso aparece no painel e precisa ser confirmado ao ligar. O risco é de quem opera o negócio.
- **Mural de avisos**: um texto curto (até 140 letras) exibido no topo do app e no monitor (ex.: promoção, happy hour).
- **Cliente**: **Cancelar** (ou fechar a janela) no Pix ou no cartão cancela de verdade no provedor, para a cobrança cancelada não poder ser paga depois; se a busca não acha, o cliente pode **sugerir** a música (você vê as mais pedidas em *Sugestões*, com o número de pessoas diferentes que pediram).
- **Backup automático**: todo dia às 4h (e ao iniciar, se ainda não houve um hoje) o banco é copiado para a pasta `backups` (`BACKUP_DIR`), mantendo os `BACKUP_MANTER` (14) mais recentes. Dá para fazer um na hora e baixar em *Sistema*. O backup guarda créditos, pagamentos, histórico e cadastros, **mas não as músicas**: copie a pasta `musicas` por conta própria. Para restaurar: pare o servidor, copie o arquivo por cima de `database\jukebox.db` (apague `jukebox.db-wal` e `jukebox.db-shm`) e inicie de novo.
- **Relatório e fechamento** (*Relatório*): escolha o período e veja faturado, sua parte, parte da boate, Pix recebido, ticket médio, horário de pico, recados no telão, vales resgatados, dia a dia e mais tocadas. Baixe em CSV (abre no Excel) ou imprima o fechamento para mostrar à boate. O relatório também lista os **CDs sem nenhuma música tocada** no período, candidatos a trocar por algo que o público pede mais.
- Divisão 50/50 (`DIVISAO_USUARIO`) calculada sobre as músicas **pagas efetivamente tocadas** e os **recados que foram ao ar**; o admin também mostra quantas foram de cortesia e o total de Pix recebido (inclui créditos ainda não usados). Cortesia, bônus de recarga e vales são custo seu e ficam fora da divisão.
- **Música que o player não consegue abrir** (arquivo corrompido, formato estranho) é tratada como falha: o crédito volta. Isso vale também para o VLC, que sai "com sucesso" nesses casos; uma faixa que termina em menos de 1,5 s sem ter sido pulada não conta como tocada.
- Pagamentos são idempotentes: webhook repetido ou consulta duplicada não credita duas vezes. O status do pagamento vem sempre da API do provedor, nunca do corpo do webhook.

## Estrutura

```
backend/
  server.js, config.js, database.js, events.js (SSE), player.js, audio.js (mpv/VLC, volume), seed.js, rede.js
  routes/       categorias, artistas, cds, musicas, sessoes, fila, pagamento, sugestoes, recados, vales, cartazes, youtube, info, admin
  services/     catalogo, fila, sessoes, pagamentos, biblioteca, importacao, cortesia, configuracoes, sugestoes, backup, sistema, relatorio,
                recados, vales, vinhetas, cartazes, volume (ffmpeg), telegram, alertas, fechamento, internet, youtube (ponte com o yt-dlp),
                sobdemanda (pedido, cobrança, download e reembolso), gateways/{mock,mercadopago}
  crons/        lancamentos (meia-noite), manutencao (expira créditos, consulta Pix, vigia horários), backup (4h), vigia (Telegram: fechamento, Pix, disco)
  middleware/   auth (token do admin)
frontend/src/   App.jsx, pages/ (Home, Categorias, Artistas, CDs, Musicas, Busca, Top, Pagar, Recado, ResgatarVale, Tela, AdminPanel), components/, context/
iniciar.bat     sobe a jukebox e reinicia se cair; scripts/ liga/desliga o início automático no Windows
musicas/        arquivos de áudio e capas (não vão pro git); _importar/ é a pasta de importação em lote; _vinhetas/ e _cartazes/ guardam
                as vinhetas de áudio e as imagens dos cartazes (pastas com "_" nunca viram CD); SobDemanda/ guarda as músicas baixadas da internet
backups/        cópias diárias do banco
database/       jukebox.db (SQLite)
docs/           NOVAS-FUNCIONALIDADES.md (guia das funcionalidades da rodada 3)
```

Tempo real (fila, saldo, ranking) via Server-Sent Events em `/api/eventos`. O id da sessão funciona como senha do saldo e nunca é enviado a outros clientes; a fila mostra apelidos anônimos ("Convidado 4F2A").

## API

`GET /api/categorias` · `/categorias/:id/artistas` · `/artistas/:id/cds` · `/cds/:id/musicas` · `/cds/lancamentos` · `/musicas/{top-tocadas,sugestoes,buscar?q=}` · `/sessoes/:id` · `/fila/:session_id` · `POST /sessoes` · `/fila/adicionar` · `/pagamento/iniciar` · `/pagamento/:id/cancelar` · `/pagamento/webhook` · `/sugestoes` · `GET /pagamento/:id` · `/sessoes/:id/pedidos` · `/config` · `/info` · `POST /recados` · `GET /recados/atual` · `GET /recados/sessao/:session_id` · `POST /vales/resgatar` · `GET /cartazes` · `POST /cartazes/:id/exibido` · `GET /youtube/buscar?q=&session_id=` · `POST /youtube/comprar` (201 = já estava na casa e entrou na fila; 202 = cobrado, sendo baixada) · `GET /youtube/pedidos/:session_id` · `/eventos` (SSE; `?tela=1` identifica o monitor; o evento `youtube` avisa quando a música pedida entrou na fila ou falhou)

Admin (`Authorization: Bearer <token>` de `POST /api/admin/login`): `/admin/stats`, `/admin/biblioteca`, `/admin/cds/adicionar` (multipart), `GET|POST /admin/importacao` (varre e importa a pasta `_importar`), `PUT|DELETE /admin/cds/:id`, `/admin/cadastros`, `/admin/categorias`, `/admin/artistas`, `/admin/player` (+ `pular`, `pausar`, `retomar`), `PUT /admin/automatico`, `GET|POST /admin/cortesia`, `GET|PUT /admin/regras`, `GET /admin/sugestoes` (+ `PUT /admin/sugestoes/:id`), `GET /admin/sistema`, `GET|POST /admin/backups` (+ `GET /admin/backups/:arquivo`), `GET /admin/relatorio` e `/admin/relatorio.csv`, `DELETE /admin/fila/:id`, `GET /admin/musicas?q=` (busca que inclui as ocultas), `POST /admin/fila/casa`, `PUT /admin/musicas/:id/oculta`, `POST /admin/acervo/ocultar-sem-arquivo`, `PUT /admin/volume`, `/admin/movimentacoes`, `PUT /admin/musicas/:id/preco`, `GET /admin/saude`, `GET|PUT /admin/volume-parelho` (+ `POST …/analisar`, `…/cancelar`), `GET|POST /admin/vinhetas` (+ `PUT|DELETE /:id`, `GET /:id/audio`, `PUT /config`), `GET|POST /admin/cartazes` (+ `PUT|DELETE /:id`, `PUT /config`), `GET /admin/recados` (+ `PUT /config`, `POST /:id/aprovar|recusar`), `GET|POST /admin/vales` (+ `GET /:lote`, `GET /:lote/qrs`, `DELETE /:lote`), `GET|PUT /admin/alertas` (+ `POST /teste`, `POST /fechamento`, `GET /conversas`), `GET /admin/youtube` (+ `PUT /config`, `POST /verificar`, `POST /atualizar`).

## Limitações conhecidas

- Outros provedores (ex.: PagSeguro) não estão implementados: basta criar um arquivo em `backend/services/gateways/` com a mesma interface (`criarCobranca`, `consultar`, `extrairPixId`) e registrá-lo em `index.js`.
- O backup automático cobre o banco, não a pasta de músicas. Para não ficar só neste computador, defina `BACKUP_COPIA_DIR` com uma pasta da nuvem (OneDrive, Google Drive) ou de um pendrive: cada backup é copiado para lá também (se a pasta estiver indisponível, o backup local sai do mesmo jeito e *Sistema* avisa). Copie a pasta `musicas` à parte de vez em quando.
- O volume ao vivo depende do mpv (canal de controle `--input-ipc-server`). Foi testado de verdade com o mpv 0.41 (build portátil) e com o VLC 3.0.23 no Windows 10: o volume mudou com a música tocando (lido do próprio mpv), o ganho do volume parelho mediu ±6 dB exatos e arquivo estragado devolve o crédito. O que **ninguém** testou aqui é o som saindo pelo alto-falante da boate.
- Instalar o início automático usa a pasta *Inicializar* do usuário: o Windows precisa entrar nesse usuário (daí o login automático).
- Não há crossfade nem transição sem silêncio entre músicas (cada música abre um processo do player, e a abertura leva uma fração de segundo); a barra de progresso usa a duração gravada no banco.
- O recado no telão só aceita pedido quando há um monitor `/tela` com a conexão aberta; o servidor não sabe se a TV está ligada, só se a página está aberta.
- Volume parelho, Telegram e músicas da internet dependem de programas/contas fora do projeto (ffmpeg; bot do Telegram; yt-dlp). Sem eles os recursos ficam desligados e o painel explica o que falta. O Telegram foi testado contra um servidor de mentira que imita a API; a primeira mensagem de verdade depende do seu token.
- **Músicas da internet**: o YouTube muda de tempos em tempos e o yt-dlp precisa acompanhar (aba *Internet* → *Atualizar o yt-dlp*, ou `winget upgrade yt-dlp.yt-dlp`); três falhas seguidas avisam no Telegram. Se o YouTube pedir login ("confirme que você não é um robô"), as opções do navegador podem ser repassadas em `YTDLP_ARGS_EXTRA` no `.env`. Foi testado de verdade (yt-dlp 2026.08.19 e VLC 3.0.23 no Windows 10) com faixas de licença livre; o uso comercial de músicas baixadas do YouTube é por conta e risco de quem opera (termos do YouTube e direitos autorais).
