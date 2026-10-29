# Hospedando na internet

A jukebox toca o áudio **onde o player (mpv/VLC) roda**, e o cliente escolhe e paga **só na tela do jukebox**: por padrão
o servidor recusa quem chega pela rede ou por túnel/proxy (só o webhook do Mercado Pago passa). Os cenários abaixo só
servem para o webhook ou, com `ACESSO_REDE=1` no `.env`, para abrir o painel e as telas de fora (por sua conta: quem
tiver o endereço alcança também a tela do jukebox e o saldo dela).

## 1. Notebook da boate + túnel (recomendado para uso real)
O servidor continua no notebook (o som sai nas caixas) e é exposto com HTTPS por um túnel, para o cliente acessar mesmo fora do WiFi e o Mercado Pago enviar webhooks:

```bash
cloudflared tunnel --url http://localhost:3000
```
No `.env`: `PUBLIC_URL=https://<url-do-túnel>`, `WEBHOOK_PUBLIC_URL=https://<url-do-túnel>`, `TRUST_PROXY=true`.

## 2. Servidor na nuvem (Docker)
```bash
cp .env.example .env   # defina ADMIN_PASSWORD, PAYMENT_PROVIDER, PUBLIC_URL
docker compose up -d --build
```
- Dados persistem em `database/`, `musicas/` e `backups/`.
- Atrás de HTTPS (Nginx, Caddy, Render, Railway), mantenha `TRUST_PROXY=true`.
- Verificação de saúde: `GET /healthz`.
- Em produção o servidor exige player; a imagem já traz `mpv`. Para apenas demonstrar online sem som, use `NODE_ENV=development`, `PLAYER=sim` e `PAYMENT_PROVIDER=mock`, **nunca** com pagamento real.
- Um servidor na nuvem não tem caixas de som da boate: use-o para demonstração ou para um painel remoto, e o cenário 1 para tocar de verdade.

## Checklist de segurança
- Troque `ADMIN_PASSWORD` e defina `ADMIN_SECRET`.
- Use `PAYMENT_PROVIDER=mercadopago` e `MERCADOPAGO_WEBHOOK_SECRET`.
- Sempre sirva por HTTPS.
