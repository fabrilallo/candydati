# Configurazione

Tutte le impostazioni di un'installazione stanno in un solo file, `/opt/candydati/.env`, scritto dall'installer. Si
modifica con:

```bash
sudo candydati config
```

Il comando apre il file nel tuo editor (`$EDITOR`) e applica la modifica quando lo chiudi. Il file contiene segreti: lo
può leggere solo root. Tienine una copia nel tuo gestore di password.

L'elenco completo delle variabili, con i valori predefiniti, è generato dal codice:
[ENVIRONMENT.md](https://github.com/fabrilallo/candydati/blob/main/docs/ENVIRONMENT.md) (in inglese). L'esempio
commentato è [.env.example](https://github.com/fabrilallo/candydati/blob/main/.env.example).

## Controlli all'avvio

L'installazione non parte con un segreto di esempio o troppo corto, con un `PLATFORM_URL` che non è `https`, o senza
un vero fornitore email. L'errore nomina la variabile, mai il suo valore. L'installer genera segreti che superano
questi controlli: li incontri solo se modifichi il file a mano.

## Impostazioni più comuni

### Identità

| Variabile | Predefinito | Significato |
|---|---|---|
| `PLATFORM_NAME` | `Candydati` | nome mostrato nell'interfaccia e nelle email. Puoi mettere il tuo |
| `PLATFORM_URL` | (obbligatorio) | indirizzo pubblico `https` dell'installazione |
| `PLATFORM_SUPPORT_EMAIL` | | indirizzo di supporto mostrato agli utenti |
| `PLATFORM_DEFAULT_LOCALE` | `it` | lingua predefinita: `it` o `en` |
| `PLATFORM_TIME_ZONE` | `Europe/Rome` | fuso orario delle date nelle email |

### Chi può entrare

| Variabile | Predefinito | Significato |
|---|---|---|
| `SIGNUP_MODE` | `invite_only` | `invite_only`: si entra solo con un invito (più il primo proprietario). `open`: chiunque può creare un account |
| `ORGANIZATION_CREATION` | `one_per_user` con `invite_only` | chi può creare organizzazioni: `open`, `one_per_user` (una sola organizzazione creata per account) o `instance_admins` |
| `INSTANCE_ADMIN_EMAILS` | | indirizzi separati da virgola che possono sempre creare organizzazioni |
| `BOOTSTRAP_TOKEN` | | token monouso per la registrazione del primo proprietario. Toglilo quando quell'account è confermato |

Ogni account conferma l'email prima del primo accesso. L'autenticazione a due fattori è disponibile per tutti, e
proprietari e amministratori possono renderla obbligatoria nella loro organizzazione.

### Modulo di candidatura pubblico

| Variabile | Predefinito | Significato |
|---|---|---|
| `APPLICATIONS_DAILY_MAX_PER_ORGANIZATION` | `500` | candidature per organizzazione in 24 ore; oltre, il modulo risponde con garbo che è pieno |
| `APPLICATIONS_DAILY_MAX_PER_JOB` | `200` | lo stesso, per annuncio |
| `RECEIPTS_DAILY_MAX_PER_ORGANIZATION` | `300` | email di ricevuta della candidatura per organizzazione al giorno |
| `NUXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | | controllo Cloudflare Turnstile facoltativo sul modulo. Spento se vuoto: Cloudflare non è mai obbligatorio |

### Annunci

| Variabile | Predefinito | Significato |
|---|---|---|
| `PLATFORM_AD_QUALITY_THRESHOLD` | `6` | punteggio di qualità (da 0 a 10) sotto il quale un annuncio viene segnalato prima della pubblicazione. Non blocca mai la pubblicazione |

### Altri gruppi

- Email: [Email](./email).
- AI e i suoi budget: [Assistente AI](./ai).
- Backup, metriche e segnalazione degli errori: [Gestione quotidiana](./operations).
- Chiavi API: `API_KEY_DEFAULT_TTL_DAYS` (predefinito 90 giorni, al massimo un anno) e `API_KEY_RATE_LIMIT` (richieste
  al minuto per chiave). Vedi [API, webhook e MCP](./api).
