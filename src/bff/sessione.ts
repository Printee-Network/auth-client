import { isServiceIdentity } from "../claims";
import type { AuthClaims, Realm } from "../claims";
import type { AuthVerifier } from "../verifier";
import type { ClientSessione, EsitoRinnovo } from "./clientSessione";
import { cancellaCookieSessione, scriviCookieSessione } from "./cookie";
import type { Barattolo } from "./cookie";

/** Chi può avere una sessione in questo BFF. */
export type FiltroIdentita = (claims: AuthClaims) => boolean;

/**
 * Solo le persone di un realm. Un token di servizio è valido per `auth`, ma in un BFF non
 * rappresenta nessuno che abbia fatto login; e i token di servizio nascono `platform-admin`, quindi
 * senza questo controllo una console di piattaforma aprirebbe una sessione a un servizio.
 */
export const soloPersoneDelRealm =
  (realm: Realm): FiltroIdentita =>
  (claims) =>
    claims.realm === realm && !isServiceIdentity(claims) && claims.role !== "SERVICE";

/**
 * Verifica l'access token del cookie con la chiave **pubblica** di `auth` e lo accetta solo se
 * l'identità passa il filtro. `null` per tutto il resto: niente token, token non valido o scaduto,
 * identità non ammessa, verificatore non configurato.
 */
export async function verificaSessione(
  verifier: AuthVerifier | null,
  token: string | undefined,
  accetta: FiltroIdentita,
): Promise<AuthClaims | null> {
  if (!token || !verifier) return null;
  try {
    const claims = await verifier.verify(token);
    return accetta(claims) ? claims : null;
  } catch {
    return null;
  }
}

/**
 * Quanto prima della scadenza rinnovare. Il proxy gira a ogni richiesta: senza una soglia si
 * chiamerebbe `auth` di continuo, rendendolo una dipendenza sul percorso critico di ogni pagina.
 */
const SOGLIA_RINNOVO_SECONDI = 5 * 60;

export const vaRinnovata = (exp: number | undefined, adesso = Date.now()): boolean =>
  typeof exp !== "number" || exp * 1000 - adesso < SOGLIA_RINNOVO_SECONDI * 1000;

/**
 * La sessione di una richiesta, nel proxy: verifica l'access token e, se manca o sta per scadere,
 * lo rinnova col refresh token. Il proxy è l'unico punto che può **riscrivere** i cookie a ogni
 * richiesta, quindi è qui che si rinnova; l'esito va poi applicato alla risposta con
 * `applicaRinnovo`.
 */
export async function sessioneDellaRichiesta<S extends { readonly exp?: number }>(input: {
  readonly accessToken: string | undefined;
  readonly refreshToken: string | undefined;
  readonly verifica: (token: string | undefined) => Promise<S | null>;
  readonly client: ClientSessione | null;
}): Promise<{ readonly sessione: S | null; readonly rinnovo: EsitoRinnovo | null }> {
  const attuale = await input.verifica(input.accessToken);
  const rinnovo =
    input.client && input.refreshToken && (!attuale || vaRinnovata(attuale.exp))
      ? await input.client.rinnova(input.refreshToken)
      : null;
  const sessione =
    rinnovo?.esito === "rinnovata" ? await input.verifica(rinnovo.sessione.accessToken) : attuale;
  return { sessione, rinnovo };
}

/**
 * Cosa scrivere nei cookie dopo il rinnovo. Un refresh token **rifiutato** si butta: altrimenti
 * resta nel browser fino a 30 giorni e ogni richiesta richiama `auth` per sentirsi dire di no,
 * consumando il limite di rinnovi che serve agli altri utenti. Con `auth` non disponibile invece si
 * tiene: tornerà buono.
 */
const DOPO_IL_RINNOVO: {
  readonly [E in EsitoRinnovo["esito"]]: (
    barattolo: Barattolo,
    esito: Extract<EsitoRinnovo, { esito: E }>,
  ) => void;
} = {
  rinnovata: (barattolo, { sessione }) => scriviCookieSessione(barattolo, sessione),
  rifiutata: (barattolo) => cancellaCookieSessione(barattolo),
  "non-disponibile": () => undefined,
};

export function applicaRinnovo(barattolo: Barattolo, rinnovo: EsitoRinnovo | null): void {
  if (!rinnovo) return;
  (DOPO_IL_RINNOVO[rinnovo.esito] as (b: Barattolo, e: EsitoRinnovo) => void)(barattolo, rinnovo);
}

export type RispostaSenzaSessione = "prosegui" | "non-autorizzato" | "al-login";

/**
 * Cosa fare con una richiesta a una rotta protetta senza sessione, in ordine: la prima regola che
 * vale.
 *
 * - **Server action**: si lascia passare. Un redirect farebbe ripetere la POST sulla pagina di login
 *   e il client riceverebbe una risposta che non sa leggere; il controllo dentro l'azione produce
 *   invece un redirect che il router gestisce.
 * - **API** (`fetch` dal browser): 401, che un `fetch` sa leggere; un redirect gli restituirebbe
 *   l'HTML del login.
 * - **Pagina**: al login.
 */
export const rispostaSenzaSessione = (richiesta: {
  readonly serverAction: boolean;
  readonly api: boolean;
}): RispostaSenzaSessione =>
  ([
    [richiesta.serverAction, "prosegui"],
    [richiesta.api, "non-autorizzato"],
  ] as const).find(([vale]) => vale)?.[1] ?? "al-login";
