# Roteiro até quarta: piloto pronto e apresentação para os donos das máquinas

Objetivo: na **quarta**, mostrar a jukebox da boate funcionando com o sistema novo (Pix, busca, botões de sempre)
e, no celular, o **app** com os números da máquina e a demonstração das 30.

---

## Sexta e sábado: o que só você pode fazer

☐ **Mercado Pago:** confira a chave Pix da conta e gere o **Access Token de produção**
   ([guia, seção 7](GUIA-INSTALACAO.md#7-mercado-pago-chave-pix-e-access-token)).
☐ **Render:** crie a conta e suba a central e a demonstração pelo `render.yaml` ([CENTRAL.md, seção 2](CENTRAL.md#2-colocar-a-central-no-ar-render-cerca-de-15-minutos)).
   Anote os dois endereços.
☐ **Instalador:** baixe o `.deb` mais novo (GitHub → Actions → Desktop → execução da `main` → Artifacts →
   `desktop-linux-x64-deb`).
☐ **Pendrive** com o Linux Mint 22 Xfce gravado.
☐ **SSD**, cabo SATA e uma nota de R$ 2 separados.

## Domingo ou segunda: instalar na máquina da boate (cerca de 1 h 30)

Siga o [GUIA-INSTALACAO.md](GUIA-INSTALACAO.md) do começo ao fim. Resumo:
1. ☐ Fechamento na JukeLinux (anote os relógios).
2. ☐ Linux Mint no SSD, **com o HD da JukeLinux desligado**.
3. ☐ Religar o HD e montar só para leitura em `/mnt/jukelinux`.
4. ☐ Instalar o Jukebox Pix e configurar:
   - modo **Atender clientes**;
   - **Placa de botões: JukeLinux**;
   - pasta do acervo `/mnt/jukelinux/home/jkb/musicas`;
   - **endereço da central** e **token da máquina** (cadastre a máquina no app antes).
5. ☐ Importar o acervo, ritmo por ritmo.
6. ☐ Regras do piloto: tocar a seguir +2, sorteio 1/50, palhinha de 2 min, limite R$ 100/30 min.
7. ☐ **Teste final** do guia (nota, chave dos 20, Pix de R$ 10, busca, menu, queda de energia).
8. ☐ **Fechamento** no menu do operador para começar o piloto do zero. A máquina aparece 🟢 no app.

## Segunda e terça: deixar rodando de verdade

☐ Deixe a máquina atendendo os clientes. Assim, na quarta, o app já mostra **números reais** de 1 ou 2 noites.
☐ Olhe o app de manhã: a máquina tem que estar 🟢 e com o que entrou na noite.
☐ Anote qualquer coisa estranha e me mande. Dá tempo de corrigir até quarta.
☐ Instale o app no seu celular e teste os três logins da demonstração (`dono`, `parceiro`, `boate`).

## Quarta: a apresentação (uns 20 minutos)

**Antes de chegarem (15 min):**
☐ Abra a **demonstração** no celular uns 2 minutos antes (o plano grátis acorda devagar).
☐ Saldo da jukebox zerado e uma nota de R$ 2 no bolso.
☐ Celular com Pix e uns R$ 10 de saldo.

**1. O problema (2 min)**
"Hoje a máquina só aceita moeda e nota. A maioria das pessoas não anda mais com dinheiro: paga tudo no Pix.
Cada cliente sem nota é uma música que não toca."

**2. A máquina funcionando (6 min), na frente deles:**
1. Coloque a **nota de R$ 2**: "o noteiro de vocês continua igual".
2. Aperte **Tocar** sem crédito → **PIX → R$ 10** → pague com o celular → **+10 CRÉDITOS** em segundos.
3. **Ritmo → 🔎 BUSCAR**: escreva o nome de um artista que eles gostam. "Acha qualquer música do acervo de
   vocês pelo nome."
4. Mostre o **Tocar a seguir** (paga +2 e passa na frente) e o **sorteio**.
5. Aperte o botão **Menu**: o relógio com dinheiro e Pix separados e a divisão empresa/ponto, igual ao de hoje.
6. Fale da **segurança**:
   - Pix de R$ 10 a R$ 50 e no máximo R$ 100 a cada 30 minutos;
   - alerta no celular se entrar dinheiro demais;
   - o HD da JukeLinux continua intacto: volta em 5 minutos se quiserem.

**3. O app (6 min), no celular:**
1. Abra com o login **parceiro** da demonstração: "assim vocês veem as 30 máquinas de casa".
2. Hoje / 7 dias / mês, quanto entrou por Pix, dinheiro e cartão.
3. Os **alertas**: "essa máquina está sem enviar há 9 horas: internet caiu ou desligaram".
4. Entre numa máquina: gráfico, relógio, fechamentos, mais pedidas.
5. Saia e entre como **boate**: "o dono do bar vê só a máquina dele e a parte dele. Acaba a desconfiança no
   repasse."
6. Mostre a **máquina real** da boate no app de verdade, com os números das últimas noites.

**4. A proposta (4 min)**
- **Piloto de 30 dias** em 2 ou 3 máquinas, sem compromisso.
- Instalação: SSD novo em cada máquina (cerca de R$ 120) e o HD antigo guardado.
- Valor: **R$ 50 a R$ 80 por máquina por mês**, com sistema, app, atualizações e suporte. Ou combinem um
  percentual do Pix.
- Contrato simples: prazo, suporte, quem é dono de quê.

**Perguntas que podem aparecer:**
| Pergunta | Resposta |
|---|---|
| "E se a internet cair?" | Moeda e nota continuam funcionando. O Pix volta quando a internet voltar. O app atualiza no próximo relatório. |
| "O dinheiro do Pix cai onde?" | Na conta do Mercado Pago que vocês escolherem. O sistema nunca mexe no dinheiro. |
| "Perco minhas músicas?" | Não. Elas tocam direto do HD de vocês, que fica só para leitura. |
| "E a JukeLinux?" | Continua no HD. Se não gostarem, volta em 5 minutos. |
| "Quanto custa a instalação?" | O SSD (cerca de R$ 120) e uma visita de 1 h 30 por máquina. |
| "Dá para colocar cartão?" | Sim, com a maquininha Mercado Pago Point. Já está pronto no sistema. |
