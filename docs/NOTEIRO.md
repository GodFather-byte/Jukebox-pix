# Noteiro (dinheiro) no Jukebox Pix

O jukebox aceita notas por um **noteiro ligado numa placa USB**. A placa conversa com o computador pela porta serial
(COM3, COM4… no Windows; `/dev/ttyUSB0` ou `/dev/ttyACM0` no Linux) e avisa cada nota que entrou. O crédito aparece
na tela na hora, com o bônus do horário se houver, e entra no relatório como "Notas".

## Como configurar

1. Ligue a placa na USB e abra **Jukebox Pix → Configurações…**.
2. Em **Noteiro (dinheiro)**, toque em **Procurar** e escolha a porta da placa.
3. Salve. O jukebox reinicia e passa a escutar a placa. Se o cabo soltar, ele tenta reconectar sozinho a cada 10 s.

No `.env` isso vira:

```
NOTEIRO=serial
NOTEIRO_PORTA=COM3
NOTEIRO_BAUD=9600            # velocidade da placa (padrão 9600)
NOTEIRO_REAIS_POR_PULSO=1    # só para o modo de pulsos (abaixo)
```

## O que a placa precisa mandar

Uma linha de texto por evento, terminada em quebra de linha (`\n`):

| Linha | Significado |
|---|---|
| `10` | entrou uma nota de R$ 10 (vale qualquer valor inteiro de 1 a 999) |
| `P` | um pulso do noteiro. Pulsos seguidos (até 0,6 s entre eles) formam uma nota só: 10 pulsos com `NOTEIRO_REAIS_POR_PULSO=1` viram R$ 10 |

Qualquer outra linha (mensagem de diagnóstico da placa) é ignorada.

## Exemplo com Arduino (noteiro no modo pulso)

A maioria dos noteiros de jukebox e de máquina de vendas (ICT, JCM, Mei e parecidos) tem um **modo pulso**: a cada nota
manda N pulsos numa saída (configure no noteiro, por exemplo 1 pulso por real). Ligue essa saída num pino do Arduino com
interrupção e mande um `P` por pulso:

```cpp
// Jukebox Pix: lê os pulsos do noteiro e manda "P" pela USB a cada pulso.
// Saída de pulso do noteiro (coletor aberto) -> pino 2; GND do noteiro -> GND do Arduino.
const byte PINO_PULSO = 2;
volatile unsigned int pulsos = 0;

void contar() {
  static unsigned long ultimo = 0;
  unsigned long agora = millis();
  if (agora - ultimo > 20) pulsos++;  // ignora ruído do contato (debounce de 20 ms)
  ultimo = agora;
}

void setup() {
  Serial.begin(9600);
  pinMode(PINO_PULSO, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PINO_PULSO), contar, FALLING);
}

void loop() {
  noInterrupts();
  unsigned int novos = pulsos;
  pulsos = 0;
  interrupts();
  while (novos--) Serial.println("P");
  delay(10);
}
```

Confira no manual do seu noteiro a largura e a tensão do pulso. Se a saída for de 12 V, use um optoacoplador
(ex.: PC817) entre o noteiro e o Arduino, nunca ligação direta.

## Testar sem o noteiro

No modo teste (**Só experimentar**), a aba **Dinheiro** da janela "Colocar créditos" tem botões de notas simuladas.
Com a placa ligada, dá para testar pelo Monitor Serial do Arduino: digitar `5` e Enter credita R$ 5.

## Cuidados

- O noteiro credita mesmo com as **vendas encerradas** no painel: o dinheiro já entrou na máquina.
- Os créditos não vencem: o saldo deixado na máquina fica para o próximo cliente. Para fazê-los vencer depois de um
  tempo sem uso, defina `SESSAO_TTL_MIN` (em minutos) no `.env`.
- Esvazie o noteiro e confira com o relatório (*Relatório* → Pix · Cartão · Notas).
