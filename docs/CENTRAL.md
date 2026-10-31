# Central e app de acompanhamento (PWA)

A **central** é um site na nuvem. As jukeboxes mandam para ela um relatório **a cada 6 horas**, ao ligar e em
**cada fechamento do caixa**. O **app** é esse mesmo site, instalado no celular como aplicativo: você, o parceiro
e cada dono de boate entram com o próprio login e veem só o que é deles.

```
Jukeboxes ──(relatório a cada 6 h e no fechamento)──→ CENTRAL (nuvem) ←── App no celular
```

- A jukebox **nunca abre porta** para a internet: quem chama é sempre ela.
- Se a internet da boate cair, nada se perde: cada relatório é uma foto completa (relógio, últimos 40 dias, mais
  pedidas), e o próximo traz tudo.
- O token do Mercado Pago **não vai** para a central. Vai só o resumo do caixa.

---

## 1. Quem vê o quê

| Acesso | Vê | Pode |
|---|---|---|
| **Dono** (você) | Todas as máquinas, tudo | Cadastrar máquinas e acessos, gerar tokens |
| **Parceiro** | As máquinas ligadas a ele: valores, relógio, empresa e ponto | Só olhar |
| **Ponto** (dono da boate) | Só a máquina da boate dele: o que entrou e **a parte dele** | Só olhar. Não vê a parte da empresa |

No app aparecem:
- **Painel:** quanto entrou **hoje / 7 dias / mês**, separado em Pix, dinheiro e cartão, e quantas músicas.
- **Alertas:** máquina que **nunca enviou** ou está **há mais de 7 horas sem enviar** (internet caída ou máquina
  desligada).
- **Lista de máquinas:** 🟢 em dia, 🔴 sem enviar, ⚪ nunca enviou, com o valor do período.
- **Detalhe da máquina:**
  - gráfico dos últimos 14 dias;
  - **relógio** parcial e total, igual ao menu do operador;
  - histórico de **fechamentos** e as **mais pedidas**;
  - situação do noteiro, disco livre e versão.

---

## 2. Colocar a central no ar (Render, cerca de 15 minutos)

O repositório já traz o arquivo `render.yaml`, que cria **dois** serviços:

| Serviço | Para quê | Plano |
|---|---|---|
| `jukebox-pix-central` | A central **de verdade**, com as máquinas reais | **Starter** (cerca de US$ 7/mês + US$ 0,25 do disco). O banco precisa de disco persistente. |
| `jukebox-pix-demo` | **Demonstração** com 30 máquinas inventadas, para apresentar | **Grátis**. Recria os dados toda vez que liga; dorme sem uso e leva uns 50 s para acordar. |

### Passo a passo
1. ☐ Crie uma conta em https://render.com (pode entrar com o GitHub).
2. ☐ **New → Blueprint**. Escolha o repositório **Jukebox-pix**. O Render lê o `render.yaml`.
3. ☐ Ele pede as variáveis marcadas como "sync: false":
   - `CENTRAL_DONO_LOGIN`: o seu login (ex.: `william`).
   - `CENTRAL_DONO_SENHA`: a sua senha (pelo menos 10 caracteres). **Anote.**
   - `DEMO_SENHA`: a senha dos logins de demonstração (ex.: `quarta2026`). Em branco, fica `demo-jukebox-2026`.
4. ☐ Clique em **Apply**. Espere os dois serviços ficarem **Live** (uns 5 minutos).
5. ☐ Cada serviço ganha um endereço `https://….onrender.com`. Abra o da **central** e entre com o seu login.

> `CENTRAL_SEGREDO` é gerado sozinho pelo Render. Ele mantém todo mundo logado entre um deploy e outro. Não apague.
>
> Prefere outro lugar (VPS, Fly.io, Railway)? A pasta `central/` tem um `Dockerfile`. Monte um volume em `/dados`
> e defina as mesmas variáveis. Precisa de **HTTPS** (o app só instala no celular com HTTPS, e a jukebox recusa
> central sem `https://`).

---

## 3. Ligar uma jukebox à central

1. ☐ No app, entre como **dono** → **⚙ Cadastros** → **Nova máquina**.
2. ☐ Preencha o **nome** (ex.: "Máquina 224", o mesmo número da etiqueta), o **local** (a boate) e, se já tiver, o
   **parceiro** e o **ponto**.
3. ☐ Clique em **Cadastrar máquina**. Aparece o **token** (`jbx_…`). **Ele aparece uma vez só:** copie.
4. ☐ Na jukebox: tecla **Alt** → **Jukebox Pix → Configurações…**
   - **Endereço da central:** o endereço do serviço `jukebox-pix-central` (com `https://`).
   - **Token da máquina:** cole o token.
   - **Salvar**. O aplicativo reinicia.
5. ☐ Em **1 minuto** a jukebox manda o primeiro relatório. No app, a máquina fica 🟢.
6. ☐ Para ver na hora, faça um **fechamento** no menu do operador: ele manda um relatório na mesma hora.

**Perdeu o token ou trocou o computador da máquina?** Cadastros → na máquina → **Token novo**. O antigo para de
funcionar na hora. Cole o novo na configuração da jukebox.

---

## 4. Criar os acessos

Cadastros → **Novo acesso**:
- **Ponto (dono da boate):** nome, login (ex.: `joao.estrela`) e senha. Depois, na máquina dele, escolha-o em
  **Ponto**.
- **Parceiro:** igual, e escolha-o em **Parceiro** em cada máquina dele.
- **Dono:** só para quem pode cadastrar e ver tudo (sócio).

Mande para a pessoa: o **endereço** da central, o **login** e a **senha**. Ela instala o app (seção 5).

---

## 5. Instalar o app no celular

**Android (Chrome):** abra o endereço da central → entre → aparece **📲 Instalar o app no celular → Instalar**.
Se não aparecer: menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").

**iPhone (Safari):** abra o endereço → botão **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.

O ícone aparece na tela como um aplicativo. Ele abre em tela cheia, fica logado por 30 dias e, sem internet,
mostra os últimos números com o aviso "Sem internet: dados de …".

---

## 6. Variáveis

**Na central (Render ou Docker):**

| Variável | Para quê |
|---|---|
| `CENTRAL_DONO_LOGIN`, `CENTRAL_DONO_SENHA`, `CENTRAL_DONO_NOME` | Criam o login do dono **no primeiro uso** (se ainda não houver nenhum usuário). |
| `CENTRAL_SEGREDO` | Assina as sessões do app. Sem ele, todos precisam entrar de novo a cada reinício. |
| `CENTRAL_DB` | Arquivo do banco (Docker: `/dados/central.db`). |
| `CENTRAL_FUSO` | Fuso para "hoje" e "mês" (padrão `America/Sao_Paulo`). |
| `CENTRAL_DEMO=1` | Central só de demonstração: recria as 30 máquinas de exemplo ao ligar. **Nunca** na central de verdade. |
| `DEMO_SENHA` | Senha dos logins da demonstração (`dono`, `parceiro`, `boate`). |

**Na jukebox** (`.env`, ou pela tela de configuração):

| Variável | Para quê |
|---|---|
| `CENTRAL_URL` | Endereço da central, com `https://`. |
| `CENTRAL_TOKEN` | Token da máquina (Cadastros → Nova máquina). |
| `CENTRAL_INTERVALO_H` | De quantas em quantas horas manda (padrão 6). |

---

## 7. Rodar no seu computador (sem nuvem)

```bash
cd central
npm install
npm run demo                               # cria dados/demo.db com 30 máquinas de exemplo
CENTRAL_DB=dados/demo.db npm start         # abre em http://localhost:4000
```

Logins da demonstração: `dono`, `parceiro` e `boate`, todos com a senha `demo-jukebox-2026`.

---

## 8. Problemas comuns

| Problema | O que fazer |
|---|---|
| Máquina continua ⚪ "nunca enviou" | Confira o endereço (com `https://`) e o token na configuração da jukebox. Painel da jukebox → 🖥 Sistema mostra o último erro de envio. A jukebox precisa de internet. |
| "token da máquina recusado pela central" | O token foi trocado ou digitado errado. Gere um **token novo** e cole de novo. |
| Máquina 🔴 "sem enviar há mais de 7 horas" | A internet da boate caiu ou a máquina está desligada. Quando voltar, o próximo relatório atualiza tudo. |
| O app pede login toda hora | Falta `CENTRAL_SEGREDO` na central. |
| A demonstração demora para abrir | O plano grátis dorme sem uso. Abra uns 2 minutos antes de apresentar. |
| O botão "Instalar" não aparece | Só aparece em HTTPS e no Chrome do Android. No iPhone use **Adicionar à Tela de Início**. |
