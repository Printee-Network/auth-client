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

```ts
import { AuthVerifier, createAuthentication, authorize, authorizeAny } from "@printee-network/auth-client";

const verifier = new AuthVerifier({
  issuer: process.env.AUTH_ISSUER!,   // es. https://auth.<dominio>
  audience: "be",                      // il nome di QUESTO servizio
});

const authentication = createAuthentication(verifier);

router.get("/quotes", authentication, authorize("SELLER"), controller);
router.post("/catalog/sync", authentication, authorizeAny(["SERVICE"]), controller);
```

`createAuthentication` sostituisce l'`authentication.ts` del servizio — **è l'unico file di
autenticazione che il refactoring cambia**. `authorize()` e `authorizeAny()` hanno la stessa firma
e la stessa semantica di quelli del `be`: le chiamate esistenti non si toccano.

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
identità di servizio si ammettono **una rotta alla volta** con `authorizeAny(["SERVICE"])`.

## Autorizzazione: dove NON sta

`authorize()` legge un claim già firmato e lo confronta in memoria. Nessun I/O, nessuna chiamata
all'IdP. L'autorizzazione resta **distribuita**: centralizzare la decisione trasformerebbe ogni
controllo in una dipendenza di rete su un solo servizio. È una scelta deliberata, non una semplificazione.

## Installazione

```bash
npm install github:Printee-Network/auth-client#v0.1.0
```

La versione si fissa col tag. Aggiornare è cambiare il tag: per una dipendenza di autenticazione
un aggiornamento esplicito è preferibile a uno automatico.
