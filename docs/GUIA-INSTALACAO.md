# Guia de instalação: do SSD vazio à jukebox atendendo

Este guia é para ler **com calma, na frente da máquina**, enquanto você configura. Ele cobre a troca de uma
jukebox JukeLinux pelo Jukebox Pix, mas serve para qualquer máquina nova (pule o que falar do HD antigo).

Tempo total: cerca de **1 hora e meia** na primeira vez. Nas próximas máquinas, uns 30 minutos.

> Marque cada ☐ conforme for fazendo. Se algo não sair como está aqui, vá para
> [Problemas comuns](#12-problemas-comuns) no fim do guia.

---

## Sumário

1. [O que você precisa ter em mãos](#1-o-que-você-precisa-ter-em-mãos)
2. [Antes de abrir a máquina](#2-antes-de-abrir-a-máquina)
3. [Instalar o Linux Mint no SSD](#3-instalar-o-linux-mint-no-ssd)
4. [Deixar o HD da JukeLinux como disco de músicas](#4-deixar-o-hd-da-jukelinux-como-disco-de-músicas)
5. [Instalar o Jukebox Pix](#5-instalar-o-jukebox-pix)
6. [A tela de configuração, campo por campo](#6-a-tela-de-configuração-campo-por-campo)
7. [Mercado Pago: chave Pix e Access Token](#7-mercado-pago-chave-pix-e-access-token)
8. [Primeiro acesso ao painel e importação das músicas](#8-primeiro-acesso-ao-painel-e-importação-das-músicas)
9. [Os botões da máquina](#9-os-botões-da-máquina)
10. [Regras recomendadas para o piloto](#10-regras-recomendadas-para-o-piloto)
11. [Teste final antes de liberar para os clientes](#11-teste-final-antes-de-liberar-para-os-clientes)
12. [Problemas comuns](#12-problemas-comuns)
13. [Voltar para a JukeLinux](#13-voltar-para-a-jukelinux)
14. [Onde ficam os dados e como fazer backup](#14-onde-ficam-os-dados-e-como-fazer-backup)

---

## 1. O que você precisa ter em mãos

☐ **SSD** de 120 GB ou mais (é só para o sistema; as músicas continuam no HD da JukeLinux).
☐ **Pendrive de 8 GB ou mais** para gravar o Linux (ele será apagado).
☐ **Outro computador** com internet, para baixar o Linux e o instalador.
☐ **Chave Philips** e, se o SSD for de 2,5", um **suporte ou fita dupla face** para prendê-lo.
☐ **Cabo SATA de dados** extra (a placa-mãe da jukebox tem portas sobrando; o cabo de força do SSD sai da fonte).
☐ **Teclado e mouse USB** só para a instalação. Depois a máquina funciona só com os botões dela.
☐ **Internet na boate** (Wi-Fi ou cabo) para o Pix funcionar.
☐ **Conta do Mercado Pago** com uma **chave Pix cadastrada** (veja a [seção 7](#7-mercado-pago-chave-pix-e-access-token)).
☐ Uma **nota de R$ 2** e o celular com Pix, para o teste final.

---

## 2. Antes de abrir a máquina

1. ☐ **Combine com o dono do ponto** um horário sem movimento (de manhã ou à tarde).
2. ☐ **Faça um fechamento na JukeLinux** e anote os relógios (total e parcial). Assim o repasse antigo fica certo.
3. ☐ No outro computador, **baixe o Linux Mint 22 Xfce**: https://linuxmint.com/download.php → **Xfce Edition**
   → escolha um servidor do Brasil. O arquivo termina em `.iso` (cerca de 3 GB).
4. ☐ **Grave o pendrive** com o **balenaEtcher** (https://etcher.balena.io): *Flash from file* → escolha o `.iso` →
   escolha o pendrive → *Flash*. Espere terminar.
5. ☐ **Baixe o instalador do Jukebox Pix** (o arquivo `.deb`):
   GitHub → repositório **Jukebox-pix** → aba **Actions** → **Desktop** → clique na execução mais recente da
   `main` com o ✓ verde → lá embaixo, em **Artifacts**, baixe **desktop-linux-x64-deb**. Vem um `.zip`: extraia e
   copie o `.deb` para um **segundo pendrive** (ou para o mesmo, numa pasta, depois de instalar o Linux).

---

## 3. Instalar o Linux Mint no SSD

> ⚠️ **O passo mais importante do guia:** desligue o cabo de dados do HD da JukeLinux antes de instalar.
> Assim é impossível apagar o HD errado.

1. ☐ Desligue a jukebox **da tomada**. Abra o gabinete.
2. ☐ **Solte o cabo SATA de dados do HD da JukeLinux** (o cabo fino, não o de força). Deixe o HD no lugar.
3. ☐ Prenda o **SSD** e ligue nele um cabo SATA de dados (na placa-mãe) e um conector de força (da fonte).
4. ☐ Ligue o teclado e o mouse USB e o **pendrive do Linux**. Ligue a máquina.
5. ☐ Assim que aparecer a primeira tela, aperte a tecla do **menu de boot** (na placa IPMH81G1 costuma ser
   **F11**; se não for, tente **F12**, **F8** ou **Esc**). Escolha o pendrive (aparece como "UEFI: SanDisk…" ou o
   nome da marca dele).
6. ☐ No menu do Linux, escolha **Start Linux Mint**. Em um ou dois minutos aparece a área de trabalho.
7. ☐ Clique duas vezes em **Install Linux Mint** e siga:
   - **Idioma:** Português do Brasil. **Teclado:** Portuguese (Brazil).
   - **Codecs multimídia:** marque **Instalar codecs** (ajuda a tocar todos os MP3).
   - **Tipo de instalação:** **Apagar disco e instalar o Linux Mint**. Só o SSD deve aparecer na lista. Se aparecer
     um disco de 500 GB, **pare**: o HD da JukeLinux ainda está ligado; desligue e comece de novo.
   - **Fuso horário:** São Paulo (ou o da sua cidade).
   - **Usuário:**
     - Seu nome: `Jukebox`
     - Nome do computador: `jukebox-` + o nome da boate (ex.: `jukebox-estrela`)
     - Usuário: `jukebox`
     - Senha: anote num lugar seguro.
     - Marque **Entrar automaticamente**. Isso faz a máquina voltar sozinha depois de uma queda de energia.
8. ☐ Quando terminar, clique em **Reiniciar agora**, tire o pendrive quando pedir e aperte Enter.
9. ☐ A máquina liga direto no Linux Mint. Conecte na internet (ícone de rede no canto da tela, embaixo à direita).
10. ☐ Abra o **Gerenciador de atualizações** (escudo no canto), clique em **Instalar atualizações** e reinicie se ele
    pedir. Pode demorar uns 10 minutos.

### Para a máquina ligar sozinha depois de uma queda de energia

Entre na **BIOS** (tecla **Del** logo que liga) e procure algo como **Restore on AC Power Loss** ou **After Power
Failure**, e deixe em **Power On**. Salve com **F10**. Com isso e com o login automático, a jukebox volta sozinha.

---

## 4. Deixar o HD da JukeLinux como disco de músicas

1. ☐ **Desligue** a máquina (menu → Sair → Desligar) e tire da tomada.
2. ☐ **Religue o cabo de dados do HD da JukeLinux.** Feche o gabinete.
3. ☐ Ligue a máquina. Na BIOS (tecla **Del**), confira em **Boot** que o **SSD é o primeiro disco**. Salve com F10.
4. ☐ No Linux Mint, abra o menu e procure o programa **Discos**.
5. ☐ À esquerda, clique no disco de **500 GB** (o HD da JukeLinux).
6. ☐ Clique na **partição maior** (o retângulo maior do desenho, geralmente "ext4").
7. ☐ Clique no **ícone de engrenagens** abaixo do desenho → **Editar opções de montagem…**
8. ☐ **Desligue** "Padrões da sessão de usuário" e preencha:
   - ☑ **Montar na inicialização do sistema**
   - **Ponto de montagem:** `/mnt/jukelinux`
   - **Opções de montagem:** no fim do que já está escrito, acrescente `,ro` (vírgula + r + o).
     O `ro` quer dizer **somente leitura**: nenhum programa consegue apagar ou mudar nada nesse HD.
   - Clique em **OK** e digite a senha do usuário.
9. ☐ Clique no botão **▶ (montar)** ou reinicie a máquina.
10. ☐ Confira: abra a pasta pessoal, vá em **Outros locais → Computador → mnt → jukelinux → home → jkb → musicas**.
    As pastas dos CDs têm que estar lá ("Henrique e Juliano - Manifesto Musical" etc.).
    O caminho completo é `/mnt/jukelinux/home/jkb/musicas`. **Anote:** você vai usar na configuração.

---

## 5. Instalar o Jukebox Pix

1. ☐ Coloque o pendrive com o `.deb` e copie o arquivo para a pasta **Downloads**.
2. ☐ Clique duas vezes no arquivo `.deb`. Abre o instalador de pacotes: clique em **Instalar pacote** e digite a
   senha. Ele instala junto o **mpv** (o player de som).

   *Se preferir pelo terminal:* abra o terminal na pasta Downloads e rode
   `sudo apt install ./jukebox-pix_*.deb`.
3. ☐ Abra o menu e procure **Jukebox Pix**. Na primeira vez, abre a **tela de configuração** (próxima seção).

---

## 6. A tela de configuração, campo por campo

Ela abre sozinha no primeiro uso. Depois, para mudar algo: aperte **Alt** (o menu aparece no alto da tela) →
**Jukebox Pix → Configurações…**. Ao salvar, o aplicativo reinicia com os valores novos.

### 1. Modo
- **Só experimentar:** créditos grátis, sem cobrança e **sem som** (o player é simulado). Use para conhecer o
  sistema.
- **Atender clientes:** cobrança de verdade e som real. É o modo da boate.

> Dica: faça a primeira configuração em **Só experimentar**, importe as músicas e teste os botões. Depois volte
> aqui e mude para **Atender clientes**.

### 2. O local
| Campo | O que pôr |
|---|---|
| **Nome do local** | O nome da boate (aparece no Pix, no menu do operador e nos avisos). Até 40 letras. |
| **Senha do painel administrativo** | Já vem uma sugerida. **Anote**: é com ela que você entra no painel. Pelo menos 12 caracteres. Use **Copiar** e guarde no celular. |
| **Pasta de músicas de outra jukebox** | `/mnt/jukelinux/home/jkb/musicas` (o caminho da [seção 4](#4-deixar-o-hd-da-jukelinux-como-disco-de-músicas)). Em máquina nova, sem HD antigo, deixe em branco. |
| **Endereço da central** e **Token da máquina** | Para acompanhar pelo app no celular. O endereço vem do Render e o token de **⚙ Cadastros → Nova máquina** no app. Passo a passo em [CENTRAL.md](CENTRAL.md#3-ligar-uma-jukebox-à-central). Pode deixar em branco e preencher depois. |
| **Abrir o jukebox sozinho quando o computador ligar** | ☑ Deixe marcado. |

### 3. Pix e cartão (só no modo Atender clientes)
| Campo | O que pôr |
|---|---|
| **Access Token de produção** | O token do Mercado Pago (começa com `APP_USR-`). Clique em **Testar**: a tela consulta o Mercado Pago e diz se o token está certo. Veja a [seção 7](#7-mercado-pago-chave-pix-e-access-token). |
| **Maquininha** | Só se tiver Mercado Pago Point, vinculada à mesma conta do token. Clique em **Procurar**, escolha a sua e, se a tela pedir, clique em **Ativar modo PDV nesta maquininha**. Sem maquininha, deixe em **Sem maquininha**: o cartão some da tela. |

### Noteiro e botões
| Campo | O que pôr |
|---|---|
| **Porta da placa do noteiro** | Na máquina da JukeLinux, **deixe "Sem noteiro"**. O noteiro dela chega pelos botões (campo abaixo). Só escolha uma porta se você ligar um noteiro novo numa placa USB/serial. |
| **Placa de botões da máquina** | **JukeLinux** nas máquinas que vieram da JukeLinux. Assim os botões, o noteiro, o moedeiro e a chave de créditos funcionam como sempre, sem trocar fio. Em máquina montada do zero, **Padrão**. |

### Som e ferramentas
A tela mostra ✓ ou ✗ para o **player (mpv)**, o **ffmpeg** e o **yt-dlp**. No modo Atender clientes o player
precisa estar ✓. Se aparecer ✗ no player, rode no terminal: `sudo apt install mpv` e abra o Jukebox Pix de novo.

Clique em **Salvar**. A jukebox abre em tela cheia.

---

## 7. Mercado Pago: chave Pix e Access Token

O dinheiro do Pix cai na conta **dona do token**. Decida antes de quem é a conta (sua, do parceiro ou do ponto) e
deixe isso no contrato.

### Chave Pix
1. ☐ No app do Mercado Pago: **Pix → Minhas chaves**. Precisa ter **pelo menos uma** (CPF, celular, e-mail ou
   aleatória). Sem chave cadastrada, o Mercado Pago não gera o QR.

### Access Token
1. ☐ No computador, entre em https://www.mercadopago.com.br/developers com a mesma conta (a do Mercado Livre é a
   mesma).
2. ☐ **Suas integrações → Criar aplicação**. Nome: "Jukebox" + nome da boate. Tipo: pagamentos online / Pix.
3. ☐ Abra a aplicação → **Credenciais de produção** → copie o **Access Token** (`APP_USR-…`).
4. ☐ Cole na tela de configuração e clique em **Testar**.

> 🔒 **O token dá acesso ao dinheiro da conta.** Cole só na tela de configuração. Não mande por WhatsApp, e-mail
> nem para ninguém (nem para o Claude). Se vazar, gere outro no mesmo lugar e cole o novo.

### Limites de cada compra
Por padrão cada Pix (ou cartão) vai de **R$ 10 a R$ 50**, e os botões da tela de créditos são R$ 10, 20, 30 e 50.
Para mudar, edite o `.env` (menu **Jukebox Pix → Editar configuração avançada**) e ajuste `VALOR_MIN` e
`VALOR_MAX`. Dinheiro no noteiro não tem limite.

---

## 8. Primeiro acesso ao painel e importação das músicas

### Entrar no painel
1. ☐ Aperte **Alt** → **Jukebox Pix → Painel administrativo**.
2. ☐ Digite a **senha do painel** (a da tela de configuração).

### Importar o acervo da JukeLinux (sem mover nada do HD)
1. ☐ Aba **📥 Importar** → botão **💽 ACERVO DE OUTRA JUKEBOX**.
2. ☐ Aparece a lista de CDs encontrados no HD. Cada pasta "ARTISTA - CD" vira um CD: o artista é o que vem antes
   do primeiro " - ".
3. ☐ **Desmarque tudo** (tire o ✓ de **Selecionar todos**) e **marque os CDs de um ritmo só** (ex.: todos de funk).
4. ☐ Escolha a **categoria** (Funk), **Entram como: Direto na categoria (acervo antigo)** e **preço 1**.
5. ☐ Clique em **IMPORTAR**. CDs grandes demoram alguns segundos cada.
6. ☐ Repita para cada ritmo (Sertanejo, Pagode, Forró, Arrocha…).

> As músicas **tocam direto do HD da JukeLinux**: nada é movido, copiado ou apagado lá. Só a capa (se houver) é
> copiada. Se o HD for desligado, essas músicas param de tocar até ele voltar.
>
> Pastas que só têm clipes (.mpg/.mp4) aparecem como "ignoradas": o Jukebox Pix toca só áudio.

Para criar uma categoria que não existe: aba **🏷 Cadastros**.

---

## 9. Os botões da máquina

Com **Placa de botões: JukeLinux**, os botões fazem o mesmo de antes:

| Botão da máquina | No Jukebox Pix |
|---|---|
| **Crédito** (noteiro, moedeiro, chave dos 20) | +R$ 1 por pulso. R$ 20 aparecem de uma vez: "+20 CRÉDITOS". |
| **CD+ / CD-** | Próximo / anterior CD (gira o carrossel de capas). |
| **Música+ / Música-** | Próxima / anterior faixa do CD. |
| **Ritmo** | Troca o ritmo (Todos, Lançamentos, Funk… e **🔎 BUSCAR**). |
| **Tocar** | Põe a faixa na fila. Sem crédito, abre a tela de créditos (Pix e cartão). |
| **Cancelar** | Volta / fecha a janela aberta. |
| **Menu** (dentro da máquina) | **Menu do operador**: relógio e fechamento do caixa. |

### Buscar pelo nome (novidade que a JukeLinux não tinha)
1. Aperte **Ritmo** até chegar em **🔎 BUSCAR** e aperte **Tocar**.
2. No teclado da tela: **CD+ / CD-** andam pelas letras, **Música+ / Música-** trocam de linha e **Tocar** aperta.
3. **🔎 BUSCAR** procura em todos os CDs da casa. **🌐 INTERNET** (se ligada no painel) procura no YouTube.
4. Escolha a música e aperte **Tocar**.

### Menu do operador
Aperte o botão **Menu** (o de dentro da máquina). Aparece:
- **PARCIAL:** o que entrou desde o último fechamento (dinheiro, Pix, cartão), músicas tocadas e a divisão
  **empresa / ponto**.
- **TOTAL:** o mesmo, desde a instalação (nunca zera).
- **Tocar** fecha o caixa (aperte de novo para confirmar). O parcial volta a zero e fica guardado como "último
  fechamento". **Cancelar** sai.

A porcentagem da divisão vem de `DIVISAO_USUARIO` no `.env` (padrão 50, igual à JukeLinux). O relatório completo,
por dia, fica no painel → **📈 Relatório**.

---

## 10. Regras recomendadas para o piloto

Tudo no painel. Comece assim e ajuste com o tempo.

### ⚙ Regras
| Regra | Sugestão para o piloto | Para quê |
|---|---|---|
| Pedidos por pessoa | 0 (sem limite) | É uma máquina só, todos usam a mesma sessão. |
| Não repetir música por X minutos | 30 | Evita a mesma música tocando várias vezes seguidas. |
| ⚡ Furar a fila | Ligado, **+2 créditos**, máx. 3 esperando | Ao apertar Tocar, a tela pergunta: fila normal ou tocar a seguir. Dá mais dinheiro sem atrapalhar. |
| 🎁 Sorteio de crédito | **1 a cada 50** | A tela comemora "Você ganhou 1 crédito!". Atrai gente. O prêmio é cortesia e não entra no faturamento. |
| 🛡️ Limite de Pix e cartão | **R$ 100** a cada 30 min | Segura quem bebeu demais. |
| Bônus de recarga | Ex.: segunda a quarta, das 18h às 22h: pague 20, ganhe +2 | Movimento em horário fraco. |

### ▶ Player (playlist automática)
| Ajuste | Sugestão |
|---|---|
| Playlist automática | Ligada |
| Intervalo de silêncio | 5 minutos |
| Sortear só entre as mais tocadas | Ligado |
| **Palhinha** | **2 minutos**: a aleatória toca só um trecho e a tela mostra "coloque crédito e ouça inteira" |
| Volume da aleatória | 80% |
| Vinheta de chamada | Ligada (grave uma vinheta "coloque seus créditos e escolha sua música" na aba 📢 Divulgação) |

### 📲 Alertas (Telegram no seu celular)
Siga o passo a passo da própria aba. Ligue pelo menos:
- 🔇 **player falhou**
- 📲 **Pix fora**
- 🚨 **dinheiro demais entrando de uma vez**: avisa se entrar mais que R$ 150 em 10 minutos pelo noteiro, moedeiro
  ou chave. Pode ser alguém com um teclado na máquina ou a placa com defeito. O crédito **não é bloqueado** (nota
  aceita é dinheiro de verdade); você só é avisado para conferir.
- **Fechamento diário** com a versão resumida para o contato da boate.

---

## 11. Teste final antes de liberar para os clientes

Com o modo **Atender clientes** e o som ligado:

☐ **Nota:** coloque a nota de R$ 2. Tem que aparecer **+2 CRÉDITOS**.
☐ **Chave dos 20:** aperte uma vez. Tem que aparecer **+20 CRÉDITOS**.
☐ **Botões:** CD+, CD-, Música+, Música-, Ritmo, Cancelar. Cada um faz o que a [tabela](#9-os-botões-da-máquina) diz.
☐ **Tocar:** escolha uma música e aperte Tocar. Ela tem que **sair no som**.
☐ **Busca:** Ritmo até 🔎 BUSCAR, escreva o nome de um artista, toque uma música.
☐ **Pix:** zere o saldo tocando músicas, aperte Tocar → **PIX → R$ 10**. Pague com o celular. Em poucos segundos
   aparecem **+10 CRÉDITOS**.
☐ **Menu do operador:** aperte Menu. O parcial tem que mostrar R$ 2 + R$ 20 em dinheiro e R$ 10 no Pix.
☐ **Fechamento:** feche o caixa (Tocar duas vezes) para começar o piloto do zero.
☐ **Queda de energia:** tire a máquina da tomada e ligue de novo. Ela tem que voltar sozinha na tela da jukebox.

Tudo ✓? A máquina está pronta. 🎉

---

## 12. Problemas comuns

| Problema | O que fazer |
|---|---|
| **Sem som** | Na tela de configuração, o player tem que estar ✓. Confira o cabo de som e o volume no ícone de som do Linux (deixe em 100%). No painel → ▶ Player, veja o volume da jukebox. |
| **Os créditos não entram** (nota ou chave) | Confira se **Placa de botões** está em **JukeLinux** na configuração. A tela da jukebox precisa estar **em primeiro plano** (clique nela uma vez): a placa funciona como teclado e só a janela da frente recebe as teclas. |
| **Botões fazem coisa errada** | Mesma coisa: perfil **JukeLinux** na configuração. |
| **"Pasta do acervo não encontrada. O HD está ligado?"** | O HD não montou. Refaça a [seção 4](#4-deixar-o-hd-da-jukelinux-como-disco-de-músicas) e confira o caminho `/mnt/jukelinux/home/jkb/musicas`. |
| **Músicas importadas sumiram / não tocam** | O HD da JukeLinux foi desligado ou não montou. Ligue e reinicie. Painel → 🖥 Sistema mostra quantas músicas estão com o arquivo faltando. |
| **O Pix não gera o QR** | Teste a internet. Na configuração, clique em **Testar** no token. Confira se a conta tem chave Pix. |
| **"Limite de R$ 100 a cada 30 minutos"** | É a proteção do painel → ⚙ Regras. Aumente ou ponha 0 para desligar. |
| **"Informe um valor inteiro entre R$ 10 e R$ 50"** | São os limites de cada compra (`VALOR_MIN` e `VALOR_MAX`). |
| **A tela travou** | O aplicativo recarrega a tela sozinho em até 15 segundos. Se o servidor cair, ele reinicia tudo sozinho. Se continuar, reinicie a máquina. |
| **Esqueci a senha do painel** | Menu Alt → **Jukebox Pix → Configurações…**: a senha está lá. |
| **A máquina não liga sozinha depois da queda de energia** | BIOS: "Restore on AC Power Loss" = Power On. Linux: login automático (Menu → Janela de Início de Sessão → Usuários). |
| **Preciso de ajuda** | Menu Alt → **Abrir pasta de dados e logs**. O arquivo `logs/desktop.log` mostra o que aconteceu (sem senhas). |

---

## 13. Voltar para a JukeLinux

O HD dela ficou intacto (montado só para leitura).

- **Por um dia:** ligue a máquina e aperte **F11** no começo. Escolha o HD de 500 GB. A JukeLinux abre como antes,
  com o pendrive-chave dela no lugar.
- **De vez:** na BIOS, deixe o HD como primeiro disco. Ou desligue o SSD.

Os créditos e relógios da JukeLinux não sabem do que entrou pelo Jukebox Pix, e vice-versa: faça o fechamento
dos dois antes de trocar.

---

## 14. Onde ficam os dados e como fazer backup

Tudo do Jukebox Pix fica em **`~/.config/Jukebox Pix`** (menu Alt → **Abrir pasta de dados e logs**):

| Pasta/arquivo | O que é |
|---|---|
| `.env` | A configuração (senha, token, perfil de botões…). **Nunca envie para ninguém.** |
| `database/` | O banco: CDs, fila, pagamentos, relógio. |
| `musicas/` | Capas e músicas que **não** vêm do HD antigo (baixadas da internet ou importadas por cópia). |
| `backups/` | Backup diário automático do banco (guarda os últimos 14). |
| `logs/desktop.log` | Registro de quando ligou, desligou, travou… sem senhas nem tokens. |

**Backup extra:** no `.env`, `BACKUP_COPIA_DIR` pode apontar para um pendrive. O sistema copia o backup do dia
para lá também.

**Atualizar o Jukebox Pix:** baixe o `.deb` novo (mesmo caminho da [seção 2](#2-antes-de-abrir-a-máquina)) e
instale por cima. Os dados continuam. Faça um backup da pasta antes, por garantia.
