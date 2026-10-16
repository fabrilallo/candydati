# Altri modi di installare

L'[installer con un solo comando](./quick-start) è la strada più semplice. Lo stesso stack (`docker-compose.prod.yml`)
funziona anche in questi casi.

## Dokploy

[Dokploy](https://dokploy.com) esegue progetti Docker Compose dietro il suo Traefik, con domini e certificati gestiti
dalla sua interfaccia. Candydati usa il tipo di deploy **Docker Compose** con `docker-compose.prod.yml` senza
modifiche:

1. Crea un progetto e un servizio Compose, con il tuo repository (o un tag di release) e il percorso del compose
   `./docker-compose.prod.yml`. Attiva **Isolated Deployments**.
2. Incolla le variabili d'ambiente nella scheda Environment di Dokploy: l'URL pubblico `https`, i segreti generati, il
   fornitore email, `WEB_BIND=127.0.0.1`.
3. Aggiungi il dominio sul servizio `web`, porta `3000`, con HTTPS da Let's Encrypt, e fai il deploy.
4. Crea il primo proprietario su `/signup?setup` con il `BOOTSTRAP_TOKEN`.

Dokploy si può anche far gestire da un agente di programmazione (Claude Code, Codex, Cursor) tramite il suo server MCP o
la sua CLI. Guida completa, con backup, risoluzione dei problemi e cosa espone la chiave di un agente:
[docs/deploy/dokploy.md](https://github.com/fabrilallo/candydati/blob/main/docs/deploy/dokploy.md) (in inglese).

## Docker Compose a mano

Se preferisci gestire ogni file da solo: clona il repository sul server, copia `.env.example` in `.env`, imposta i
segreti e il fornitore email, metti davanti al container web un reverse proxy con TLS (la guida usa Caddy) e avvia lo
stack con `docker compose -f docker-compose.prod.yml --profile backup up -d --build`. Così le immagini vengono
compilate sul server, che ha bisogno di circa 4 GB di memoria libera.

Guida completa, con la configurazione di Caddy, gli aggiornamenti, la rete e più installazioni sullo stesso host:
[docs/deploy/docker-compose.md](https://github.com/fabrilallo/candydati/blob/main/docs/deploy/docker-compose.md)
(in inglese).

## Database e archivio gestiti

Postgres 17 e qualsiasi archivio compatibile S3 possono sostituire quelli inclusi quando vuoi i backup e il failover
del fornitore; non serve per la velocità. Vedi
[OPERATIONS.md](https://github.com/fabrilallo/candydati/blob/main/docs/OPERATIONS.md) (in inglese) per l'architettura,
le impostazioni del reverse proxy (dimensione delle richieste e timeout per import fino a 200 MiB) e la checklist di
sicurezza per chi gestisce l'installazione.
