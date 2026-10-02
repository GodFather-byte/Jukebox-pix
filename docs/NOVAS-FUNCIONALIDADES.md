# 🎵 Jukebox Pix — guia das funcionalidades novas

Este guia explica, em linguagem simples, as **8 melhorias** da rodada e, depois, as **músicas da internet** (seção 9, que você autorizou em seguida): o que cada uma faz, como usar no painel, como ela mexe no dinheiro, o que foi testado e o que ainda depende de você. Dá para ler em partes; cada seção funciona sozinha.

**Sumário**

0. [Primeiro uso: o que fazer hoje](#0-primeiro-uso-o-que-fazer-hoje)
1. [Preço por CD ou música](#1-preço-por-cd-ou-música)
2. [Aviso "SEM SOM" e correção do VLC](#2-aviso-sem-som-e-correção-do-vlc)
3. [Bônus de recarga só em certos horários](#3-bônus-de-recarga-só-em-certos-horários)
4. [Avisos e fechamento no Telegram](#4-avisos-e-fechamento-no-telegram)
5. [Recado no telão](#5-recado-no-telão)
6. [Vale-música](#6-vale-música)
7. [Vinhetas de áudio e cartazes no monitor](#7-vinhetas-de-áudio-e-cartazes-no-monitor)
8. [Volume parelho entre as músicas](#8-volume-parelho-entre-as-músicas)
9. [Músicas da internet (YouTube)](#9-músicas-da-internet-youtube)
10. [O que ficou de fora de propósito](#10-o-que-ficou-de-fora-de-propósito)
11. [Como isso foi testado (e o que não foi)](#11-como-isso-foi-testado-e-o-que-não-foi)
12. [Consulta rápida: dinheiro, ajustes e problemas comuns](#12-consulta-rápida-dinheiro-ajustes-e-problemas-comuns)

---

## 0. Primeiro uso: o que fazer hoje

1. **Feche o servidor** (se estiver aberto) e rode `npm start` de novo. O banco é atualizado sozinho no primeiro start (tabelas e colunas novas; **nada do que você já tem é apagado**: foi testado numa cópia do seu banco, com as 132 músicas, 1254 reproduções e 3 pagamentos intactos). O backup do dia também é garantido ao subir.
2. **Confira se o terminal mostra `Player: vlc`** (ou `mpv`). Se mostrar `Player: sim`, o player ainda está simulado e o painel vai exibir uma faixa vermelha **"SEM SOM"**. Veja a [seção 2](#2-aviso-sem-som-e-correção-do-vlc).
3. Abra `http://localhost:3000/admin`. Há **5 abas novas**: **💬 Recados**, **🎟 Vales**, **📢 Divulgação**, **📲 Alertas** e **🌐 Internet**. As outras ganharam campos novos (preço, bônus por horário, volume parelho).
4. **Nada novo liga sozinho**: recados, vinhetas, cartazes, volume parelho, Telegram, fechamento e músicas da internet começam **desligados**. O preço de todas as músicas continua R$ 1, e o bônus continua como estava.

### Mapa do painel

| Aba | Para que serve |
|---|---|
| 📊 Resumo, 📈 Relatório | Faturamento e fechamento (agora incluem recados e vales) |
| ▶ Player | Fila, pular, volume mestre, **volume parelho**, playlist automática |
| 🎛 Console | Pôr música na fila como pedido da casa; **preço de uma música**; ocultar |
| 💬 **Recados** | Aprovar/recusar recados pagos e ajustes do recurso |
| 💿 Biblioteca, ➕ Novo CD, 📥 Importar | CDs (agora com **preço**) |
| 🌐 **Internet** | Músicas pedidas pelo cliente direto do YouTube (liga, preço, situação do yt-dlp) |
| 🎁 Cortesia | Seus créditos grátis do dia |
| 🎟 **Vales** | Criar e imprimir vales-música |
| ⚙ Regras | Vendas, **preço dos lançamentos**, **bônus por horário**, prioridade, mural |
| 📢 **Divulgação** | Vinhetas de áudio e cartazes do monitor |
| 💡 Sugestões | O que o público pediu e você não tem |
| 📲 **Alertas** | Telegram: avisos e fechamento diário |
| 🖥 Sistema, 🏷 Cadastros | Saúde do sistema, backups, categorias e artistas |

---

## 1. Preço por CD ou música

**O que é.** Até agora toda música custava 1 crédito (R$ 1,00). Agora cada CD, e até cada música, pode ter seu próprio preço, de 1 a 20 créditos. Exemplo: lançamentos a R$ 2 e o acervo antigo a R$ 1.

**Como usar**

- **Ao criar o CD**: em *Novo CD* ou *Importar* há o campo **"Preço de cada música"**.
- **Num CD que já existe**: *Biblioteca* → **Editar** → **"Preço de TODAS as músicas"**. Deixe vazio para não mexer (se o CD tiver preços diferentes, a lista mostra "1 a 2 créditos/música").
- **Uma música só** (exceção): *Console* → procure a música → o seletor **💰** ao lado dos botões.
- **Preço mínimo para os lançamentos**: *Regras* → **"Preço dos lançamentos"**. Enquanto o CD estiver em LANÇAMENTOS (7 dias), cada música custa **pelo menos** esse valor; quando ele passa para a categoria, volta sozinho ao preço normal. Zero desliga.

**O que o cliente vê.** Nas músicas que custam mais de 1, aparece **💰 2 créditos** na lista. Sem saldo suficiente, o pedido é recusado e nada é cobrado.

**Como funciona por baixo**

- Preço que vale = o da música; se o CD está em lançamento e o preço de lançamento for maior, vale o maior dos dois.
- O pedido guarda o preço **do momento**. Se você mudar o preço depois, quem já está na fila não paga a diferença nem recebe troco.
- Música que falha ou é removida da fila devolve exatamente o que foi cobrado.
- No **⚡ A seguir**, o extra de prioridade soma ao preço da música.
- **Dinheiro**: o valor pago de cada música tocada entra no faturamento e na divisão. Uma música de 2 créditos conta R$ 2.
- Pedido da casa (Console) e playlist automática continuam grátis e fora do faturamento.

---

## 2. Aviso "SEM SOM" e correção do VLC

**O problema que você viveu.** O VLC não tinha instalado de verdade, então o servidor ficou no **player simulado**: não toca nada e cada música "dura" 15 segundos, e você não tinha como perceber. Agora o painel avisa.

**O que mudou**

- Enquanto o player estiver simulado, **toda aba do painel** mostra uma faixa vermelha **"SEM SOM"** com o comando para instalar. O botão "Ver detalhes" leva à aba *Sistema*.
- O terminal do servidor também imprime o comando de instalação ao subir sem player.

**Como resolver**

1. No PowerShell: `winget install VideoLAN.VLC` (aceite o pedido de permissão do Windows e **espere terminar**: da primeira vez o download parou no meio e o VLC não chegou a ser instalado).
2. Feche o servidor e rode `npm start`. O terminal tem que mostrar **`Player: vlc`**. O VLC é achado sozinho em `C:\Program Files\VideoLAN\VLC`.
3. Se preferir o **mpv**: ele muda o volume com a música tocando (o VLC só na próxima). Mas **não use `winget install mpv`** (instala um pacote reempacotado por terceiros). Use o Chocolatey (`choco install mpvio`, que o site do mpv lista) ou baixe do mpv.io e aponte `MPV_PATH` no `.env`. Se o mpv acusar falta de `vulkan-1.dll`, atualize o driver de vídeo (ou fique com o VLC).

**Arquivo estragado não é mais "tocado".** Descobri no teste que o VLC encerra **"com sucesso"** quando não consegue abrir um arquivo (corrompido, formato estranho). A jukebox contava isso como música tocada: o cliente pagava, nada tocava e **não havia reembolso**. Agora, qualquer faixa que termine em menos de **1,5 segundo** sem ter sido pulada é tratada como falha: **o crédito volta** e ela não entra no faturamento nem no ranking. O mpv já se comportava bem (sai com erro).

**Aviso no celular.** Se o player falhar **3 vezes seguidas**, você recebe uma mensagem no Telegram (se configurado; seção 4).

---

## 3. Bônus de recarga só em certos horários

**O que é.** O bônus de recarga ("R$ 20 → +2 créditos") agora pode valer só em janelas de horário, por exemplo **20:00 às 22:00**, para encher a casa cedo.

**Como usar.** *Regras* → **Bônus de recarga** → role até **"🕒 Só nestes horários"** → **+ Adicionar horário**. Até 6 janelas; podem passar da meia-noite (ex.: 23:00 às 02:00). O início e o fim não podem ser iguais. Sem nenhuma janela, o bônus vale o dia todo, como antes. Salve em **SALVAR REGRAS**.

**O que o cliente vê**

- **Dentro do horário**: "🎁 Bônus: R$ 20 → +2 · … (hoje das 20:00 às 22:00)".
- **Fora do horário**: um convite em amarelo, "🎁 Bônus de recarga das 20:00 às 22:00: R$ 20 → +2 …", na tela inicial e na tela de pagamento.
- Os celulares se atualizam **sozinhos na virada** do horário (até ~15 segundos), sem recarregar.

**Regras importantes**

- O bônus vale o que estava na tela **quando o Pix foi gerado**. Quem gerou às 21:59 e pagou às 22:03 recebe o bônus; quem gerou às 22:01 não.
- Continua sendo **custo seu**: entra como cortesia, não aumenta a parte da boate e não entra no faturamento dividido.
- Na aba *Regras* aparece o estado: 🟢 valendo agora, 🟡 ligado mas fora do horário, ⚪ desligado.

---

## 4. Avisos e fechamento no Telegram

**O que é.** A jukebox manda mensagens no **seu celular** quando algo dá problema e, se quiser, o **fechamento do dia**. Você não precisa estar no local.

### Configurar (uma vez, uns 5 minutos)

1. No Telegram, procure **@BotFather**, mande `/newbot` e siga os passos. Ele entrega um **token** (um texto longo).
2. Abra o arquivo **`.env`** da pasta do projeto e acrescente: `TELEGRAM_BOT_TOKEN=seu-token` (veja `.env.example`). **Reinicie o servidor.**
3. No Telegram, procure o seu bot e mande um **"oi"** para ele.
4. No painel: **📲 Alertas** → **"🔎 Descobrir minha conversa"**. Aparece algo como `TELEGRAM_CHAT_ID=123456789`. Copie essa linha para o `.env` e **reinicie de novo**.
5. Volte em *Alertas* e clique **"✉ Mensagem de teste"**: tem que chegar no celular.
6. *(Opcional)* Para a **boate** receber a versão resumida do fechamento: a pessoa manda "oi" para o mesmo bot, você usa "Descobrir minha conversa" e põe o id em `TELEGRAM_CHAT_ID_BOATE=`.

> O token e os ids ficam **só no `.env`**: não vão para o banco, **não entram nos backups** e o painel nunca os mostra.

### O que ele avisa (cada um liga e desliga em *Alertas*)

| Aviso | Quando dispara | Repete? |
|---|---|---|
| 🔇 Player falhou | 3 falhas seguidas (som parou, arquivos sumiram) | no máximo a cada 30 min |
| 📲 Sem conexão com o Pix | 2 testes seguidos sem internet (testa a cada 2 min; só com Mercado Pago). Avisa de novo quando volta | uma vez ao cair e uma ao voltar |
| 💾 Pouco espaço em disco | menos de 10% ou de 5 GB livres (testa a cada 10 min) | no máximo 1 vez por dia |
| 🗄 Backup falhou | o backup do banco falhou, ou a cópia extra (pendrive/nuvem) falhou | a cada 6 h / 12 h |
| 🟢 A jukebox ligou | sempre que o servidor sobe (**desligado por padrão**) | sempre |

### Fechamento do dia

- Ligue **"Mandar o fechamento todo dia"** e escolha a hora (padrão 06:00). O fechamento cobre **as 24 horas que terminam nessa hora**, então uma noite que passa da meia-noite cai inteira num fechamento só.
- Se o notebook estava desligado na hora marcada, ele manda quando ligar (até 20 horas depois) e **só uma vez por dia**, mesmo reiniciando.
- O botão **"📤 Enviar o fechamento das últimas 24 h agora"** serve para ver como a mensagem chega.

Exemplo do que **você** recebe:

```
📊 Fechamento — Jukebox
🗓 01/10, 06:00 → 02/10, 06:00

🎶 120 músicas tocadas (5 de cortesia)
💬 3 recados no telão
💰 Faturado no período: R$ 126,00
👤 Sua parte (50%): R$ 63,00
🏠 Parte da boate (50%): R$ 63,00
📲 Pix recebido: R$ 150,00 (12 pagamentos, ticket médio R$ 12,50)
🎟 4 vales resgatados (6 créditos de cortesia)

🏆 Mais tocadas:
1. Rolê Vermelho — Rodovia 116 (8x)
```

A **boate** recebe só: período, músicas, recados, faturado e **"Parte da boate: R$ 63,00 — valor a repassar"**. Ela **não** vê a sua parte, o Pix total recebido, a cortesia nem os vales.

**Atenção:** precisa de internet; se o Telegram estiver fora do ar, o servidor continua normalmente e tenta o fechamento de novo no minuto seguinte.

---

## 5. Recado no telão

**O que é.** O cliente paga por uma **mensagem curta** ("Parabéns, Ana! 🎉") que aparece, grande, no monitor da casa por alguns segundos. É uma forma de ganhar mais por cliente, e é divertido para aniversários e brindes.

### Ligar e ajustar

*💬 Recados* → seção **⚙ Ajustes** (no fim da página):

- **Aceitar recados pagos no telão**: o interruptor geral (começa desligado).
- **Preço** (padrão 5 créditos) e **Tempo no telão** (padrão 15 s; de 5 a 60).
- **Eu aprovo cada recado antes de ir ao ar** (**recomendado**, começa ligado).
- **Palavras proibidas**: separadas por vírgula. O recado com alguma delas é recusado **na hora e sem cobrar**. Vale mesmo com acento, maiúscula, números no lugar de letras (`p4lavr@o`) e letras separadas por espaço. Palavras curtas só valem inteiras (bloquear "cu" não barra "curtir").

> Você é quem responde pelo que aparece na tela da casa. Mantenha a aprovação ligada e preencha a lista de palavras.

### Como o cliente usa

1. Na tela inicial aparece **"💬 Mande um recado para o telão"** (só se o recurso estiver ligado **e** houver um monitor `/tela` aberto).
2. Ele escreve (3 a 60 letras) e envia. Pode ter **2 recados** esperando ao mesmo tempo.
3. Recebe avisos no celular: aprovado, no telão agora, ou recusado/devolvido. A página mostra o andamento dos recados dele.

### Como você usa

- A aba **💬 Recados** mostra: se o **telão está ligado**, o recado **no ar agora**, os que **esperam sua aprovação** (✔ Aprovar / ✕ Recusar), os aprovados esperando a vez, o histórico e quanto os recados renderam hoje. Um **número rosa** na aba avisa que há recado esperando.
- Os aprovados vão ao ar **um por vez**, na ordem. Todos os monitores mostram o mesmo, por cima de qualquer cartaz.
- **Tirar do ar** um recado que já está na tela: "Tirar do ar e reembolsar".

### Dinheiro

- O recado **só entra no faturamento quando vai ao ar** (como a música, que só conta ao tocar). Entra na divisão com a boate.
- **Devolve ao cliente, para o mesmo saldo de onde saiu (pago ou cortesia)**, quando é: recusado; tirado do ar; **30 minutos sem você decidir**; ou **1 hora aprovado sem ter vez** (por exemplo, monitor desligado).
- O cliente **não consegue enviar** se não houver monitor `/tela` aberto: ninguém paga por algo que não vai aparecer.
- Se o recado foi pago com créditos de cortesia, só a parte **paga** conta no faturamento.

**Limite conhecido:** o servidor sabe se a **página** `/tela` está aberta, não se a TV está ligada. Deixe o monitor sempre com a página aberta.

---

## 6. Vale-música

**O que é.** Cartões com **QR code** e **código** que o garçom entrega (por exemplo, "1 drink = 1 música grátis"). O cliente aponta a câmera e ganha música. Ótimo para movimentar a jukebox e para parcerias com a equipe do bar.

### Criar e imprimir

1. Aba **🎟 Vales**: informe **quantos vales**, **quantas músicas grátis** em cada (1 a 20), **por quantos dias valem** (padrão 30; vale até o fim do último dia) e, se quiser, **para quem** é ("Garçom Carlos").
2. **CRIAR VALES**: os cartões aparecem logo abaixo, cada um com o nome da casa, o QR, o código (`ABCD-EFGH`) e a validade.
3. **🖨 Imprimir**: a impressão sai **só com os cartões**, 3 por linha, com borda tracejada para recortar.
4. Em **Lotes criados** você vê quantos foram usados, estão disponíveis ou venceram; **🖨 Cartões** reabre os cartões que ainda valem; **Cancelar não usados** invalida os que não foram resgatados (os já usados ficam no histórico).

### Como o cliente usa

- **Pelo QR**: a câmera do celular abre o app e o vale é resgatado sozinho ("🎁 Vale resgatado! Você ganhou 1 música grátis"). O QR guarda o **endereço do app** (o mesmo do QR do monitor): se o IP do notebook mudar, os cartões antigos deixam de abrir (o código digitado continua valendo). Reserve um IP fixo no roteador ou defina `PUBLIC_URL` no `.env`.
- **Pelo código**: tela inicial → **"🎟 Tenho um vale-música"** → digita o código (maiúscula/minúscula e hífen tanto faz).

### Regras

- **Cada código vale uma vez.** Se duas pessoas tentarem ao mesmo tempo, só uma ganha (testado com 5 celulares na mesma fração de segundo).
- Os créditos entram como **cortesia: custo seu**, fora do faturamento e da divisão com a boate (como o bônus).
- Os créditos do vale **vencem como os demais** (60 minutos sem uso). Oriente a equipe: o cliente deve resgatar e escolher a música na hora.
- O app **não revela** se o código existe: "inválido, vencido ou já usado" é a resposta para qualquer problema. Quem erra o código **6 vezes em 10 minutos** fica bloqueado por um tempo.
- Os vales usados aparecem no *Relatório* (quantos e quantos créditos de cortesia) e no fechamento do Telegram.

---

## 7. Vinhetas de áudio e cartazes no monitor

Aba **📢 Divulgação**: duas ferramentas para divulgar a casa e **vender espaço** para patrocinadores.

### Vinhetas de áudio

**O que é.** Áudios curtos seus ("Peça a sua música pelo QR Code!", "Happy hour até as 23h!") que tocam **entre duas músicas**, a cada N músicas.

**Como usar**

1. **Nome** + **arquivo de áudio** (MP3, M4A, WAV, FLAC ou OGG, **até 2 minutos** e 15 MB) → **➕ ADICIONAR VINHETA**. Arquivo que não abre é recusado.
2. Ligue **"Tocar vinhetas"** e escolha **"A cada quantas músicas"** (padrão 5). A contagem **começa quando você liga** (não toca uma vinheta atrasada).
3. Com várias ativas, elas se **revezam**. Cada uma tem **▶ Ouvir** (toca no aparelho em que você está no painel), **Desativar** e **Apagar**.

**Regras**

- Vinheta **não custa crédito**, **não entra na fila nem no ranking nem no faturamento**.
- Conta todas as músicas (de clientes, da casa e da playlist automática). Com a playlist automática ligada, ela divulga a jukebox mesmo com o salão sem pedir.
- Aparece no painel como **"📢 TOCANDO VINHETA"** e dá para **Pular**.

### Cartazes no monitor

**O que é.** Imagens (patrocinadores, promoções, avisos) que **ocupam o monitor** `/tela` por alguns segundos, em rodízio.

**Como usar**

1. **Nome** (só você vê), **imagem** (JPG, PNG ou WebP, até 6 MB; de preferência **na horizontal**, proporção de TV), **segundos na tela** (5 a 60; padrão 10), **legenda** opcional embaixo e, se quiser, **vale a partir de / até** (para vender por período).
2. Ligue **"Mostrar cartazes no monitor"** e defina **os segundos entre um cartaz e outro** (20 a 900; padrão 90). O primeiro aparece uns 20 segundos depois de abrir o monitor.
3. Cada cartaz mostra se está **🟢 no ar**, **⏸ fora do período** ou **⚪ desativado**.

**Para vender o espaço.** O painel conta **quantas vezes cada cartaz foi exibido**: dá para mostrar ao patrocinador ("seu cartaz passou 340 vezes esta semana"). Duas telas mostrando ao mesmo tempo contam uma vez.

**Prioridade na tela**: o **recado pago** sempre aparece por cima do cartaz.

---

## 8. Volume parelho entre as músicas

**O problema.** CDs diferentes têm volumes bem diferentes. Uma música alta depois de uma baixa soa mal na boate, e você acaba mexendo no volume toda hora.

**O que faz.** O programa **ffmpeg** mede o volume de cada música **uma única vez**. Daí em diante o player **sobe ou desce o volume de cada faixa** até todas ficarem no mesmo nível. Sem distorcer: sobe no **máximo 6 dB**, desce no máximo 12 dB, e uma faixa que já está no limite não é aumentada.

### Ligar

1. Instale o ffmpeg: no PowerShell, `winget install Gyan.FFmpeg`. Feche o terminal, abra outro e **reinicie o servidor**. Se ele não for encontrado, aponte `FFMPEG_PATH` no `.env`.
2. *▶ Player* → role até **"🎚 Volume parelho entre as músicas"** e ligue o interruptor. A caixa mostra **ffmpeg encontrado**.
3. Clique **"📏 Medir o acervo agora"**. Uma barra mostra o andamento e dá para usar o sistema normalmente (a medição roda em segundo plano, com prioridade baixa). Medimos **121 músicas em cerca de 30 segundos**.
4. **CDs novos** (upload ou importação) são medidos sozinhos.

### O alvo

- **Automático** (padrão): usa o volume típico do **seu** acervo (a mediana). O volume geral quase não muda; só as músicas que destoam são corrigidas.
- **Escolher o nível**: de −24 (mais baixo) a −6 (mais alto) LUFS. Streaming costuma usar −14. Um alvo mais baixo que o seu acervo deixa **tudo** mais baixo (aí compense no volume mestre ou no amplificador).

### Coisas para saber

- O volume mestre continua valendo por cima (e, no mpv, continua mudando ao vivo).
- **Desligar** volta ao normal na hora; as medições ficam guardadas.
- Música sem medição toca normal. Arquivo que o ffmpeg não consegue ler conta como "com problema" e a medição segue com o resto.
- **mpv e VLC diferem no volume mestre**: no mpv a escala é cúbica (50% = −18 dB, bem baixo), no VLC 50% = −6 dB. É normal o mesmo ponto do controle soar diferente.
- Por que **não** usei as etiquetas ReplayGain dos arquivos: ferramentas diferentes usam referências diferentes (até 4 dB de diferença) e misturar as duas fontes deixaria algumas músicas fora do lugar. A medição do ffmpeg é igual para todas.

---

## 9. Músicas da internet (YouTube)

**O que é.** Quando o cliente não acha a música no seu acervo, aparece o botão **"🔎 Pesquisar na internet"**. Ele vê os resultados do YouTube (com miniatura, canal, duração e preço), toca em **🎶 PEDIR** e paga com créditos. A jukebox baixa só o **áudio** e põe na fila: em alguns segundos, ou até uns minutos se a internet estiver ruim. A música fica guardada: se alguém pedir a mesma de novo, entra na fila **na hora**.

> Você pediu e autorizou esse recurso (02/10/2026). Ele vem **desligado**, e para ligar pela primeira vez o painel pede que você confirme o aviso abaixo.

### O aviso que você precisa conhecer

Os termos do YouTube **não permitem baixar** vídeos, e as músicas têm **direitos autorais**: tocar cópias sem licença para o público de um estabelecimento comercial pode gerar cobrança ou ação de quem detém os direitos (no Brasil, o ECAD também cobra a execução pública de música). O risco é **seu**, que opera o negócio. Em caso de dúvida, fale com um advogado ou com o ECAD antes de usar. O mesmo texto aparece na aba *Internet*, e a confirmação fica registrada (data e hora) quando você liga.

### Ligar (uma vez, uns 5 minutos)

1. **Instale o yt-dlp**: no PowerShell, `winget install yt-dlp.yt-dlp`. Depois **feche o servidor**, abra um **novo** PowerShell e rode `npm start` de novo (o servidor só enxerga programas instalados depois quando reinicia). Se o programa estiver em outra pasta, aponte `YTDLP_PATH` no `.env`.
2. Abra **🌐 Internet** no painel. A caixa *Situação do yt-dlp* tem que ficar **verde** ("yt-dlp encontrado (versão …)"). Se estiver vermelha, ela mostra os passos; depois de resolver, clique em **Verificar de novo**.
3. Em **Ajustes**: ligue **"Aceitar pedidos de músicas da internet"**, marque a confirmação do aviso (só na primeira vez), confira o **preço** (padrão **3 créditos**) e a **duração máxima** (padrão **8 minutos**) e clique em **SALVAR AJUSTES**.
4. Pronto: nos celulares, a busca passa a mostrar o cartão **"Não achou? Pesquise na internet"**. Se o yt-dlp for desinstalado, o cartão **some sozinho** dos celulares (e a aba *Internet* mostra em vermelho).

### Como o cliente usa

1. Na **Busca**, digita o que quer. Se não achou (ou achou pouco), toca em **🔎 PESQUISAR "…"**: o cartão só pesquisa quando ele pede, para não gastar a internet do notebook a cada letra.
2. Vê até 10 resultados do YouTube. Os que **já estão na casa** (alguém pediu antes) trazem **✔ na casa** e entram na hora. Os outros têm **🎶 PEDIR**.
3. Ao pedir, confirma ("Custa 3 créditos, devolvidos se algo der errado"). O botão vira **⏳ AGUARDE** e uma **faixa azul** ("Preparando “…”") fica fixa no topo do app, em qualquer tela, até a música entrar na fila.
4. Quando termina, o celular avisa ("🎶 … entrou na fila!") e vibra; o botão vira **✔ NA FILA**. Se falhar, avisa e **devolve o crédito**.

### Dinheiro (o mais importante)

- O crédito é **cobrado ao pedir**, e o pedido guarda **de onde saiu** (saldo pago ou cortesia).
- Ele **volta ao mesmo saldo** se: o download falhar; travar (limite de 3 minutos); o arquivo vier estragado, vazio ou incompleto; o YouTube bloquear; o pedido passar de 10 minutos preparando; ou o **servidor reiniciar** no meio (ao ligar, ele devolve o que ficou preparando).
- Depois de baixada, a música entra na fila **já paga** e é igual a qualquer outra: **só entra no faturamento e na divisão com a boate quando toca**. Se você a remover da fila, o valor volta ao cliente (para o saldo de origem).
- **Duplo toque** não cobra duas vezes. **Duas pessoas pedindo a mesma música ao mesmo tempo**: baixa **uma vez só** e as duas entram na fila (as duas pagam).
- Música da internet que **já está na casa** custa o preço que ela tem na Biblioteca (o do dia em que foi baixada, que você pode mudar).
- Conta como qualquer outra música nos relatórios; a aba *Internet* também mostra quantas músicas da internet tocaram hoje e quanto renderam.

### Limites e proteções

| O que | Valor |
|---|---|
| Preço de cada música | 3 créditos (1 a 20, ajustável) |
| Duração | de 30 segundos até **8 minutos** (2 a 20, ajustável); **transmissão ao vivo é recusada** |
| Pedidos sendo preparados | 2 por pessoa, 8 no total; o que passar disso é recusado na hora, sem cobrar ("espere entrarem na fila") |
| Pesquisas novas | 12 por pessoa e 60 por aparelho (IP) a cada 5 minutos (pesquisa repetida vem da memória por 10 min e não conta) |
| Pedir **sem saldo** | é recusado antes de qualquer consulta ao YouTube, então quem ainda não pagou não gasta a internet do notebook (a pesquisa em si é livre, com o limite acima) |
| Regras da casa | valem também aqui: "pedidos por pessoa", "não repetir música" e fila cheia |
| Tamanho do arquivo | até 40 MB; o computador precisa ter **1 GB livre** |
| Arquivo baixado | conferido antes de entrar na fila (precisa ser áudio de verdade, não vazio, não incompleto) |

**Segurança.** O código do vídeo (11 letras/números) é **validado** e nunca vira caminho de arquivo (o `youtube.js` original aceitava qualquer texto e poderia gravar fora da pasta de músicas; foi reescrito). O yt-dlp roda sem `shell`, com **tempo máximo**, e é encerrado **junto com os processos filhos** ao estourar o tempo ou quando você desliga o servidor. Textos vindos do YouTube (títulos) são limpos de caracteres invisíveis.

### Playlist automática

Por padrão as músicas da internet **não entram** na playlist automática (ela só sorteia o seu acervo). Dá para permitir em *Internet → Usar também na playlist automática*.

### Gerenciar o que foi baixado

- Elas ficam no CD **"Músicas Sob Demanda"** (artista "Da internet", categoria "Sob demanda"), que aparece na aba **💿 Biblioteca** e nas categorias do app. Lá você muda o **preço**, **oculta** (some da busca e ninguém pede mais) ou **apaga o CD inteiro**: os arquivos são apagados e quem tinha pedido na fila recebe o crédito de volta. O CD é recriado sozinho no próximo download.
- Os arquivos ficam em `musicas\SobDemanda` (formato m4a, uns 2 a 8 MB por música; sem converter, então **não precisa do ffmpeg**). Para parar tudo na hora, desmarque o interruptor na aba *Internet*.
- A aba mostra os **últimos pedidos** (o que entrou na fila e o que falhou, com o motivo técnico para você).

### Se der problema

| Sintoma | O que fazer |
|---|---|
| O cartão da internet não aparece nos celulares | Está desligado, ou o yt-dlp não foi encontrado (veja a caixa em *Internet*), ou você instalou o yt-dlp e não reiniciou o servidor |
| Os pedidos começaram a falhar | O YouTube mudou: clique em **⬆ Atualizar o yt-dlp** (ou `winget upgrade yt-dlp.yt-dlp`). Três falhas seguidas avisam no Telegram (tipo *Músicas da internet falhando*, em *Alertas*) |
| O motivo diz que o YouTube **pediu login** ("confirme que você não é um robô") | Raro em computador doméstico. Dá para repassar o login de um navegador no `.env`: `YTDLP_ARGS_EXTRA=--cookies-from-browser firefox` (use uma conta secundária, não a sua principal). Ou espere e tente depois |
| Uma música não aparece na lista | Passa de 8 minutos, é ao vivo, é curta demais, ou você a ocultou |
| Ficou "preparando" por muito tempo | No máximo 10 minutos; depois o crédito volta sozinho |
| O computador reiniciou no meio de um pedido | Ao ligar, o crédito é devolvido e o arquivo pela metade é apagado |

---

## 10. O que ficou de fora de propósito

- **Spotify.** Continua de fora: os termos dele proíbem uso comercial em estabelecimento e cobrança por música.
- **Música da internet com "⚡ A seguir"**: o pedido sempre entra no fim da fila. (As músicas **já baixadas** aceitam o "A seguir" normalmente, pelo CD "Músicas Sob Demanda".)
- **Colar um link do YouTube**: só a pesquisa por texto.
- **Conversão para MP3**: o áudio fica no formato original (m4a), sem ffmpeg.
- O arquivo `backend/routes/pastas.js` (busca de arquivos por pasta, também do Gemini) **continua sem uso**: este recurso não precisou dele.
- Quando o cliente não acha a música e a internet está desligada, continua valendo o botão **Sugerir** na busca: as sugestões aparecem em **💡 Sugestões**, com quantas pessoas pediram cada uma.

---

## 11. Como isso foi testado (e o que não foi)

**Testado de verdade, numa cópia isolada (porta 3300, banco e pastas próprios; seu banco e a porta 3000 não foram tocados):**

- ✅ **Cerca de 280 verificações automáticas** novas (preço, bônus por horário, recados, vales, vinhetas, cartazes, volume parelho, Telegram, player), mais testes unitários, **sem nenhuma falha** na rodada final.
- ✅ **VLC 3.0.23 e mpv 0.41 de verdade** (versões portáteis numa pasta temporária; nada foi instalado no seu PC): música toca e termina, pular encerra o player, arquivo estragado devolve o crédito, vinheta toca, o ganho do volume parelho chega aos dois (no mpv medi +6 dB e −6 dB exatos), e o **volume ao vivo do mpv** muda com a música tocando (li o valor do próprio mpv: 15 → 40).
- ✅ **ffmpeg 9.0.2 de verdade**: mediu diferenças de 6 e 10 dB corretamente, cancelou, tratou arquivo estragado.
- ✅ **Dinheiro**: gasto simultâneo, reembolso para o saldo certo (pago × cortesia), recado só no faturamento quando vai ao ar, vale resgatado por 5 celulares ao mesmo tempo (só um ganha).
- ✅ **Migração do seu banco** (cópia): 132 músicas, 1254 reproduções e 3 pagamentos preservados; integridade `ok`.
- ✅ **Telas**: fotografei cada tela nova (celular, monitor e painel, inclusive a impressão dos vales).
- ✅ Os testes de **todas as funções anteriores** (cortesia, prioridade, backups, relatórios, playlist por horário…) continuam com o mesmo resultado.

**Não testado (só você consegue):**

- ❌ **Telegram de verdade**: testei contra um servidor de mentira que imita a API. A primeira mensagem real depende do seu token.
- ❌ **O som saindo pelo alto-falante** da boate (verifiquei os processos e os argumentos; eu não escuto o áudio).
- ❌ **Mercado Pago real** e o **celular real** no WiFi/firewall.
- ❌ **Impressão em papel**: vi a pré-visualização de impressão, não uma impressora.
- ❌ **ffmpeg com os seus CDs reais** (usei áudios de teste e as músicas de demonstração).
- ❌ Dois ou mais monitores abertos ao mesmo tempo, por muitas horas.

---

## 12. Consulta rápida: dinheiro, ajustes e problemas comuns

### Quem paga e o que entra na divisão com a boate?

| Situação | Entra no faturamento e na divisão? | Quem arca |
|---|---|---|
| Música paga que tocou (qualquer preço) | **Sim** (a parte paga) | cliente |
| Extra do ⚡ A seguir | **Sim** | cliente |
| Recado que foi ao ar | **Sim** (a parte paga) | cliente |
| **Música da internet** que tocou | **Sim** (a parte paga), como qualquer música | cliente |
| Música paga com créditos de **cortesia** | Não | você |
| **Vale-música** resgatado | Não | **você** |
| **Bônus de recarga** | Não | **você** |
| Pedido da casa (Console) e playlist automática | Não | você |
| Música/recado devolvido (falha, recusa) | Não: volta ao saldo de onde saiu | — |
| Música da internet cujo download falhou | Não: volta ao saldo de onde saiu | — |

### Variáveis novas do `.env`

| Variável | Para quê |
|---|---|
| `FFMPEG_PATH` | Caminho do ffmpeg, se ele não for achado sozinho (volume parelho) |
| `TELEGRAM_BOT_TOKEN` | Token do seu bot (@BotFather) |
| `TELEGRAM_CHAT_ID` | Sua conversa (descubra em *Alertas*) |
| `TELEGRAM_CHAT_ID_BOATE` | Conversa do contato da boate (opcional) |
| `YTDLP_PATH` | Caminho do yt-dlp, se ele não for achado sozinho (músicas da internet) |
| `YTDLP_ARGS_EXTRA` | Opções extras para o yt-dlp (ex.: `--cookies-from-browser firefox`, só se o YouTube pedir login) |
| `YTDLP_TEMPO_BUSCA_S` / `YTDLP_TEMPO_BAIXAR_S` | Tempo máximo de cada pesquisa (40 s) e de cada download (180 s) |

### Valores padrão e limites

| Ajuste | Padrão | Limites |
|---|---|---|
| Preço de uma música / de um CD | 1 crédito | 1 a 20 |
| Preço mínimo dos lançamentos | 0 (desligado) | 0 a 20 |
| Janelas do bônus | nenhuma (dia todo) | até 6; início ≠ fim |
| Recado: ligado / preço / tempo / aprovação | desligado / 5 / 15 s / ligada | preço 1–50; tempo 5–60 s; 3–60 letras |
| Recados por pessoa esperando | — | 2 |
| Vale: quantidade / créditos / validade | — / — / 30 dias | 1–200 / 1–20 / 1–365 |
| Vinheta: a cada N músicas | 5 | 1 a 50; áudio até 2 min e 15 MB |
| Cartaz: tempo na tela / intervalo | 10 s / 90 s | 5–60 s / 20–900 s; imagem até 6 MB |
| Volume parelho: alvo | automático | −24 a −6 LUFS; ganho de −12 a +6 dB |
| Fechamento: hora | 06:00 (desligado) | qualquer HH:MM |
| Música da internet: ligada / preço / duração máxima | desligada / 3 créditos / 8 min | preço 1–20; duração 2–20 min (mínimo fixo de 30 s) |
| Música da internet: pedidos em preparo | — | 2 por pessoa, 8 no total |

### Problemas comuns

- **"O cliente não vê o botão de recado."** O recurso está desligado, ou **não há um monitor `/tela` aberto** (a aba *Recados* mostra "Nenhum telão ligado").
- **"O recado foi aprovado e não aparece."** Confira se o telão está ligado; o aprovado espera a vez (um por vez) e é devolvido se passar de 1 hora esperando.
- **"O bônus não aparece."** Veja em *Regras* o estado (pode estar fora do horário) e se há faixas cadastradas.
- **"O vale deu 'inválido'."** Já foi usado, venceu, foi cancelado, ou o código foi digitado errado (sem I, L, O, 0 ou 1: esses caracteres não existem nos códigos).
- **"A faixa vermelha SEM SOM não some."** O servidor ainda está no player simulado: instale o VLC e **reinicie** (não basta instalar).
- **"O volume parelho não mudou nada."** Confira se o interruptor está ligado, se o acervo foi medido ("N de N músicas medidas") e se o alvo automático não é igual ao nível das suas músicas.
- **"O cliente não vê a busca na internet."** Está desligada em *Internet*, ou o yt-dlp não foi encontrado (a caixa da aba mostra vermelho): instale, **reinicie o servidor** e clique em *Verificar de novo*. Mais problemas na [seção 9](#se-der-problema).
- **"Preciso voltar atrás."** Os backups diários ficam em `backups\` (aba *Sistema* → como restaurar). Qualquer recurso novo pode ser desligado no próprio painel sem perder dados.
