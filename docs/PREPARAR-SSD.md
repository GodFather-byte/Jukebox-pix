# Preparar o SSD no notebook (sem abrir nada) e levar pronto para a jukebox

Você instala o **Linux Mint** e o **Jukebox Pix** num SSD ligado ao notebook por um **adaptador USB**, configura
tudo e testa com som e Pix de verdade. Na boate, é só encaixar o SSD na jukebox, montar o HD das músicas e importar.

Tempo: cerca de **1 hora** no notebook e **30 minutos** na boate.

---

## O que você precisa

☐ **SSD** (120 GB ou mais).
☐ **Adaptador USB para o SSD**:
   - SSD 2,5" SATA: "cabo adaptador USB 3.0 SATA" ou "case gaveta 2,5" USB 3.0";
   - SSD M.2: "case M.2 NVMe/SATA USB-C".
☐ **Pendrive de 8 GB** com o **Linux Mint 22 Xfce** gravado pelo balenaEtcher (guia de instalação, seção 2).
☐ O instalador **`.deb`** do Jukebox Pix (GitHub → Actions → Desktop → Artifacts → `desktop-linux-x64-deb`).
☐ O **Access Token** do Mercado Pago, o **endereço da central** e o **token da máquina** (cadastre a máquina no app
   antes: ⚙ Cadastros → Nova máquina).
☐ Internet no notebook.

### ⚠️ Antes de começar: se o notebook tem Windows com BitLocker
Mexer na ordem de inicialização pode fazer o Windows pedir a **chave de recuperação do BitLocker** no próximo boot.
Pegue a sua antes, em https://aka.ms/myrecoverykey (entre com a conta Microsoft do notebook) e anote. Sem
BitLocker, pode ignorar este aviso.

---

## Parte 1: instalar o Linux Mint no SSD (no notebook)

1. ☐ Ligue o **SSD no adaptador** e o adaptador numa **USB do notebook**. Ligue também o **pendrive do Linux**.
2. ☐ Reinicie o notebook e aperte a tecla do **menu de boot**. Depende da marca: Dell **F12**, Lenovo **F12** (ou o
   botão Novo), HP **F9**, Acer **F12**, Asus **Esc** ou **F8**, Samsung **F10**, Positivo **F7** ou **F12**.
3. ☐ Escolha o **pendrive** (o nome da marca dele). Se aparecer duas vezes, escolha o que começa com **UEFI**.
4. ☐ **Start Linux Mint**. Na área de trabalho, conecte no Wi-Fi e abra **Install Linux Mint**.
5. ☐ Idioma **Português do Brasil**, teclado **Portuguese (Brazil)**, marque **Instalar codecs multimídia**.
6. ☐ Em **Tipo de instalação**, escolha **Algo diferente** (é a única que garante que só o SSD vai ser mexido).
7. ☐ Na lista de discos, **ache o SSD pelo tamanho** (ex.: `/dev/sda`, 120 GB). O disco do notebook costuma ser
   `/dev/nvme0n1` ou outro com o tamanho dele. **Não toque no disco do notebook.**
   - Selecione o **SSD** (a linha do disco, não uma partição) → **Nova tabela de partição…** → Continuar.
   - Selecione o **espaço livre** do SSD → **+**:
     - Tamanho **512** MB → Usar como **Partição de sistema EFI** → OK.
   - Selecione o espaço livre que sobrou do SSD → **+**:
     - Tamanho: deixe o resto → Usar como **Sistema de arquivos ext4** → Ponto de montagem **/** → OK.
   - Embaixo, em **Dispositivo para instalação do carregador de inicialização**, escolha **o SSD**
     (ex.: `/dev/sda`), **não** o disco do notebook.
   - Confira a tabela: as partições com **Formatar ✓** têm que ser **só do SSD**. Se tiver alguma do notebook
     marcada, desmarque ou volte.
8. ☐ **Instalar agora** → confirme.
9. ☐ Fuso **São Paulo**. Usuário:
   - Seu nome: `Jukebox`
   - Nome do computador: `jukebox-` + nome da boate
   - Usuário: `jukebox`
   - Senha: anote.
   - ☑ **Entrar automaticamente**.
10. ☐ Terminou: **Reiniciar agora**, tire o **pendrive** (deixe o SSD ligado) e aperte Enter.

---

## Parte 2: ligar o notebook pelo SSD e deixar ele "levável"

1. ☐ Na reinicialização, aperte de novo o **menu de boot** e escolha o **SSD** (aparece com o nome do adaptador ou do
   SSD, ou "ubuntu"). Se o notebook mostrar direto um menu preto do Linux (GRUB), escolha **Linux Mint**.
2. ☐ O Linux Mint abre pelo SSD. Conecte no Wi-Fi.
3. ☐ Abra o **Terminal** (menu → Terminal) e confira onde está o boot:
   ```bash
   lsblk -o NAME,SIZE,MOUNTPOINTS
   ```
   As linhas com `/` e `/boot/efi` têm que estar **embaixo do SSD** (ex.: `sda1 512M /boot/efi` e `sda2 … /`).
4. ☐ Deixe o SSD **ligável em qualquer computador** (a jukebox não conhece o notebook). Cole no terminal:
   ```bash
   sudo grub-install --target=x86_64-efi --efi-directory=/boot/efi --removable && sudo update-grub
   ```
   Digite a senha. Tem que terminar com **"Installation finished. No error reported."**
5. ☐ Atualize o sistema: ícone do escudo (canto da tela) → **Instalar atualizações**. Reinicie se pedir, sempre
   escolhendo o **SSD** no menu de boot.

> **O Windows do notebook parou de abrir sozinho?** Entre na BIOS (geralmente **F2** ou **Del** ao ligar) → aba
> **Boot** → coloque **Windows Boot Manager** em primeiro → salve (**F10**). Ou escolha "Windows Boot Manager" no menu
> de boot quando quiser o Windows.

---

## Parte 3: instalar e configurar o Jukebox Pix (ainda no notebook)

1. ☐ Copie o `.deb` para a pasta **Downloads** do Linux do SSD e clique duas vezes → **Instalar pacote**.
2. ☐ Abra **Jukebox Pix** pelo menu. Na tela de configuração:
   | Campo | Valor |
   |---|---|
   | Modo | **Atender clientes** |
   | Nome do local | o nome da boate |
   | Senha do painel | a sugerida (**anote**) |
   | Pasta de músicas de outra jukebox | `/mnt/jukelinux/home/jkb/musicas` (vai existir quando o SSD estiver na jukebox) |
   | Endereço da central / Token da máquina | os do app |
   | Abrir sozinho ao ligar | ☑ |
   | Access Token | o do Mercado Pago → **Testar** |
   | Noteiro | **Sem noteiro** |
   | Placa de botões | **JukeLinux** |
3. ☐ **Salvar**. A jukebox abre em tela cheia.

### Testar no notebook (vale a pena)
O notebook não tem a placa de botões, mas o **teclado** faz o papel dela no perfil JukeLinux:

| Tecla no notebook | Na jukebox |
|---|---|
| **U** | 1 crédito (como uma nota de R$ 1) |
| **↑ / ↓** | CD+ / CD- |
| **D / →** | Música+ / Música- |
| **R** | Ritmo |
| **Enter** | Tocar |
| **\*** do teclado numérico (ou **Esc**) | Cancelar |
| **/** do teclado numérico (ou **F10**) | Menu do operador |

☐ Aperte **U** 3 vezes → **+3 CRÉDITOS**.
☐ Painel (**Alt** → Jukebox Pix → Painel administrativo) → **➕ Novo CD**: suba 2 ou 3 MP3 seus, só para testar o
   som. Depois toque uma música com **Enter**: o som sai no notebook.
☐ **Pix de R$ 10** de verdade: Enter sem crédito → PIX → pague → **+10 CRÉDITOS**.
☐ **Menu** (`/` ou F10) → confira o relógio → **feche o caixa** (Enter duas vezes).
☐ No app da central, a máquina tem que aparecer 🟢 em até 1 minuto (ou na hora, depois do fechamento).
☐ Painel → **⚙ Regras** e **▶ Player**: deixe as regras do piloto (guia de instalação, seção 10).
☐ Antes de levar: apague os CDs de teste (painel → 💿 Biblioteca) e **feche o caixa** de novo para começar zerado.

Desligue o notebook (menu → Sair → Desligar) e tire o SSD.

---

## Parte 4: na boate (cerca de 30 minutos)

1. ☐ **Fechamento na JukeLinux** e anote os relógios.
2. ☐ Desligue a jukebox **da tomada** e abra.
3. ☐ Prenda o **SSD** e ligue nele o cabo **SATA de dados** e a **força**. Deixe o **HD da JukeLinux ligado** também:
   o Linux já está no SSD, então não há risco de instalar no disco errado.
   - SSD M.2 só funciona se a placa da jukebox tiver encaixe M.2 (a IPMH81G1 provavelmente não tem). Nesse caso,
     dá para usar o SSD M.2 **pelo adaptador USB** numa porta USB de trás da jukebox. Funciona, mas deixe o adaptador
     bem preso.
4. ☐ Ligue e entre na **BIOS** (tecla **Del**):
   - **Boot** → o **SSD** em primeiro (ou "UEFI: <nome do SSD>");
   - **Restore on AC Power Loss** → **Power On**;
   - salve com **F10**.
5. ☐ O Linux abre e o **Jukebox Pix abre sozinho**. Ligue a internet (cabo ou Wi-Fi da boate).
6. ☐ **Monte o HD das músicas** só para leitura (guia de instalação, seção 4: programa **Discos** → partição de
   500 GB → engrenagem → Editar opções de montagem → montar na inicialização, `/mnt/jukelinux`, acrescentar `,ro`).
   Reinicie.
7. ☐ Painel → **📥 Importar** → **💽 ACERVO DE OUTRA JUKEBOX**: importe ritmo por ritmo.
8. ☐ **Teste final** do guia de instalação (seção 11): nota de R$ 2, chave dos 20, botões, Pix, menu, queda de
   energia.
9. ☐ **Feche o caixa** para começar o piloto do zero.

**Não ligou pelo SSD?** No menu de boot (**F11** na IPMH81G1), escolha o SSD. Se ele não aparecer, a BIOS pode estar
só em modo "Legacy": procure **Boot Mode** ou **CSM** e deixe **UEFI** (ou "UEFI and Legacy"). Se mesmo assim não
der, me chame: o plano B é instalar direto na jukebox pelo guia de instalação (o pendrive do Linux resolve em 20 min).
