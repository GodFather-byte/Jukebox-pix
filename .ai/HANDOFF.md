# Handoff
Atualizado por: ChatGPT/Codex em 2026-10-29 (branch `codex/testes-pagamento-idempotencia`)

## Objetivo atual
Jukebox de bar no computador da máquina: música por créditos, Pix, Point, noteiro, busca YouTube e tela por toque/botões físicos.

## Situação da equipe
- O PR #9 do Claude Code já foi integrado na `main`. O instalador e a tela "palco neon" seguem aguardando teste prático e aprovação do dono antes da distribuição.
- O PR #10 do ChatGPT/Codex permanece em rascunho, isolado da `main`: testes de pagamento Pix sem crédito duplicado.
- Nenhum arquivo de implementação do Claude foi modificado nesta branch.

## Feito nesta sessão
- Lidos `AGENTS.md`, `.ai/MAPA.md` e este handoff.
- Criado `tests/pagamento-idempotencia.test.js`: confirmações repetidas não geram crédito extra; cancelar após confirmação preserva o saldo; confirmação tardia de cobrança já marcada como falha credita apenas uma vez.
- Código enviado ao GitHub, mas execução do teste **não verificada**: ambiente local sem acesso à rede do GitHub e sem dependências do projeto.

## Próximos passos
1. Na branch do PR #10 executar `npm ci && npm --prefix frontend ci` e `node --test tests/pagamento-idempotencia.test.js`; depois `npm test`.
2. Atualizar o PR #10 com a `main` atual (o PR #9 já foi integrado), resolver conflitos se houver e pedir revisão do diff ao Claude Code.
3. Dono testar instalador do CI e equipamentos reais: Point, noteiro e encoder de botões.
4. Não fazer merge nem distribuir versão sem validação dos testes e aprovação do dono.

## Arquivos e decisões importantes
- Pix e cartões: `backend/services/pagamentos.js`, `backend/services/gateways/`.
- Máquina: `frontend/src/maquina/`. Desktop: `desktop/`.
- 1 crédito = R$ 1; nunca creditar pagamento real sem confirmação do provedor.
- Servidor restrito à própria máquina; nunca expor rotas na rede.
- O proprietário não quer estilo Spotify nem reprodução exata da máquina de referência.
- Tela do cliente única; sem tela de celular.
- `npm run desktop:rebuild` altera o SQLite para Electron: executar `npm ci` antes dos testes Node.
