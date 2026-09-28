# @printee-network/auth-client

Ciò che un servizio installa per parlare con `auth`: il **vocabolario dei ruoli** e la
**verifica dei token via JWKS**. Nessun segreto, nessuna chiamata a runtime verso l'IdP.

## Perché esiste

Due cose che devono essere identiche in tutti i servizi, e che copiate a mano divergono — è già
successo con le liste di label riservati di `fe` e `cc-fe`, che oggi non coincidono:

1. **quali ruoli esistono e chi passa un controllo** (5 stringhe e una gerarchia);
2. **come si verifica un token** (issuer, audience, JWKS, rotazione delle chiavi).

Con 15-16 servizi in arrivo, l'onboarding di un nuovo servizio deve essere "installa, configura
issuer e audience" — non "copia questi file e ricordati di aggiornarli".

## Uso

### Verificare un token in ingresso

```ts
import { AuthVerifier, isServiceIdentity } from "@printee-network/auth-client";

const verifier = new AuthVerifier({
  issuer: process.env.AUTH_ISSUER!,   // es. https://auth.<dominio>
  audience: "be",                      // il nome di QUESTO servizio
});

const claims = await verifier.verify(token); // lancia se firma, issuer o audience non tornano
```

**Verificare il token non basta a decidere chi entra.** Ogni utente ha un token valido: la rotta
deve dire chi ammette.

- **Un servizio si riconosce dal soggetto**: `claims.sub === "service:<clientId>"`, oppure
  `isServiceIdentity(claims)` per «un servizio qualsiasi». **Mai dal realm**: i token di servizio
  nascono `realm: "platform-admin"`, quindi il realm non distingue una persona da un servizio.
- **Il tenant sta nel claim `slug`.** Non esiste un claim `tenant`.

### Chiamare un altro servizio

```ts
import { ServiceTokenProvider } from "@printee-network/auth-client";

const tokens = new ServiceTokenProvider({
  issuer: process.env.AUTH_ISSUER!,
  clientId: process.env.AUTH_CLIENT_ID!,
  clientSecret: process.env.AUTH_CLIENT_SECRET!,
});

await tokens.forService("be", "acme");           // senza utente; tenant opzionale
await tokens.onBehalfOf("cc-api", userToken);    // per conto di un utente (token exchange)
```

I token di servizio restano in cache fino a poco prima della scadenza, e le richieste concorrenti
per la stessa audience condividono una sola chiamata ad `auth`.

### Strato express

`createAuthentication`, `authorize` e `authorizeAny` esistono ma oggi nessun servizio li usa, e
`createAuthentication` ammette qualunque token valido: prima di adottarli va fatto il refactoring
che rende obbligatorio dichiarare chi è ammesso (`revisione/REFACTORING.md`). `authorize` e
`authorizeAny` trattano già ogni token `service:*` come `SERVICE`, qualunque ruolo porti.

## Verifica locale

Il JWKS è in cache e `auth` **non viene contattato a ogni richiesta**. Viene ri-scaricato solo
quando compare un `kid` sconosciuto, cioè a una rotazione di chiave — che quindi non richiede
alcun deploy dei consumer.

Il servizio ha solo chiavi **pubbliche**: non può forgiare token. È la differenza con
`ACCESS_SECRET` / `INSTANCE_AUTH_SECRET`, dove chi verifica può anche firmare.

## Ruoli

| Ruolo | Livello |
|---|---|
| `ADMIN` | 2 |
| `SELLER`, `OPERATOR`, `COMMERCIAL_RESP`, `PRODUCTION_RESP` | 1 |
| `SERVICE` | **0** |

I primi cinque livelli replicano esattamente quelli del `be`: adottare il pacchetto non cambia chi
passa un controllo.

`SERVICE` sta a 0 di proposito. La gerarchia è piatta, quindi a livello 1 sarebbe intercambiabile
con SELLER e OPERATOR e un token di servizio passerebbe da solo ogni controllo non ADMIN. Le
identità di servizio si ammettono **una rotta alla volta**, e si riconoscono dal soggetto (`service:*`),
non dal claim `role`.

## Autorizzazione: dove NON sta

`authorize()` legge un claim già firmato e lo confronta in memoria. Nessun I/O, nessuna chiamata
all'IdP. L'autorizzazione resta **distribuita**: centralizzare la decisione trasformerebbe ogni
controllo in una dipendenza di rete su un solo servizio. È una scelta deliberata, non una semplificazione.

## Installazione

```bash
npm install github:Printee-Network/auth-client#v0.3.0
```

La versione si fissa col tag. Aggiornare è cambiare il tag: per una dipendenza di autenticazione
un aggiornamento esplicito è preferibile a uno automatico.
