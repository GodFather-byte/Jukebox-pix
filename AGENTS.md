# Jukebox Pix: instruções para agentes

Fonte única de instruções para qualquer agente (Claude Code, Codex/ChatGPT, Copilot).
O `CLAUDE.md` só aponta para cá. Mantenha este arquivo curto: estado do trabalho vai em
`.ai/HANDOFF.md`, localização de código vai em `.ai/MAPA.md`.

## Ao começar

1. Leia `.ai/HANDOFF.md` (onde o trabalho parou e o próximo passo).
2. Leia `.ai/MAPA.md` só se precisar localizar algo.
3. Não leia o `README.md` nem `docs/` inteiros: abra só a seção que a tarefa pede.

## Ao terminar

Reescreva `.ai/HANDOFF.md` (substitua, não acumule; o histórico fica no git) e faça commit
junto com o trabalho. Se mudou pasta, ponto de entrada ou comando, ajuste `.ai/MAPA.md`.

## Rodar e testar

```
npm ci && npm --prefix frontend ci     # dependências
npm test                               # suíte (node --test tests/*.test.js)
node --test tests/quiosque.test.js     # um arquivo só (prefira durante o trabalho)
npm run build                          # compila a tela (frontend/dist)
npm run seed                           # acervo de teste num banco vazio
PAYMENT_PROVIDER=mock PLAYER=sim npm start   # servidor em modo teste: http://localhost:3000
```

Node 20+ (CI usa 24). Rode os testes antes de `npm run desktop:rebuild`: ele troca o módulo
SQLite para o Electron; para voltar ao Node, `npm ci`.

## Convenções

- Código, comentários, mensagens e textos da tela em **português**.
- 1 crédito = R$ 1,00 = 1 música. Valores em reais inteiros.
- O cliente só usa a **tela da máquina** (`frontend/src/maquina/`): botões físicos chegam como
  teclas (`teclas.js`) e tudo também funciona por toque. Não há mais tela de celular.
- O servidor só atende o próprio computador (`backend/server.js`); não abra rotas para a rede.
- Pagamento: Pix e cartão (Mercado Pago, `backend/services/gateways/`) e notas (noteiro,
  `backend/services/noteiro.js`). Nunca credite sem confirmação do provedor ou da placa.
- Toda regra nova entra com teste em `tests/`.
- Coluna nova: `garantirColuna(...)` em `backend/database.js`.

## Trabalho em dupla (Claude Code + Codex)

- Quem conversa com o dono é o **titular**: planeja e decide. O outro é o **reserva**.
- O reserva recebe tarefa fechada, responde em até 30 linhas com `arquivo:linha` e nunca
  chama outro agente.
- Vale delegar: localizar algo, diagnosticar saída grande de teste, escrever testes para
  código existente, mudança mecânica em muitos arquivos, revisar diff.
- Não vale delegar: tarefa de até 3 arquivos, decisão de regra de negócio.
- Pagamento, licença e segurança: o titular escreve, o reserva só revisa o diff.
- Revisão cruzada olha só o diff (`git diff main...HEAD`), em uma rodada.
- Um escritor por vez no mesmo arquivo. Pedido para o outro agente: escreva em
  "Pendências" no `.ai/HANDOFF.md`.
