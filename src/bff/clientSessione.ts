import type { Realm } from "../claims";
import type { CoppiaDiToken } from "./cookie";

/**
 * Com'è andato un rinnovo. `rifiutata` e `non-disponibile` finiscono entrambe senza sessione, ma
 * non sono la stessa cosa: un refresh token rifiutato da `auth` (401: scaduto, revocato) è morto e
 * va buttato; con `auth` giù o lento lo stesso token tornerà buono appena `auth` risponde.
 */
export type EsitoRinnovo =
  | { readonly esito: "rinnovata"; readonly sessione: CoppiaDiToken }
  | { readonly esito: "rifiutata" }
  | { readonly esito: "non-disponibile" };

export type EsitoAccesso =
  | {
    readonly ok: true;
    readonly coppia: CoppiaDiToken;
    /** `auth` chiede il cambio password al primo accesso. */
    readonly passwordResetRequired: boolean;
  }
  | { readonly ok: false; readonly messaggio: string };

export type CredenzialiAccesso = {
  readonly realm: Realm;
  /** Identificatore di accesso: per `platform-admin` contiene lo username. */
  readonly email: string;
  readonly password: string;
  /**
   * Il tenant, per i realm che vivono in un tenant. **Non arriva dal client**: il BFF lo ricava dal
   * sottodominio.
   */
  readonly slug?: string;
};

export type OpzioniClientSessione = {
  /** Issuer di `auth`; lo slash finale si toglie qui. */
  readonly issuer: string;
  /** Il servizio per cui si chiedono i token (es. il backend che il BFF chiama). */
  readonly audience: string;
  /** Iniettabile nei test. */
  readonly fetch?: typeof fetch;
};

const NON_DISPONIBILE: EsitoRinnovo = { esito: "non-disponibile" };

const coppiaCompleta = (dati: Partial<CoppiaDiToken>): dati is CoppiaDiToken =>
  Boolean(dati.accessToken && dati.refreshToken && dati.expiresIn);

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Le tre chiamate che un BFF fa ad `auth` per conto del browser: accesso, rinnovo, revoca.
 *
 * Nessuna lancia eccezioni: un BFF deve sempre poter rispondere all'utente, anche con `auth` giù.
 * Sono tutte POST, che nessuna cache conserva.
 */
export class ClientSessione {
  private readonly issuer: string;
  private readonly fetch: typeof fetch;

  constructor(private readonly opzioni: OpzioniClientSessione) {
    this.issuer = opzioni.issuer.replace(/\/+$/, "");
    this.fetch = opzioni.fetch ?? fetch;
  }

  async accedi(credenziali: CredenzialiAccesso): Promise<EsitoAccesso> {
    try {
      const risposta = await this.fetch(`${this.issuer}/login`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...credenziali, audience: this.opzioni.audience }),
      });
      const dati = (await risposta.json().catch(() => ({}))) as Partial<CoppiaDiToken> & {
        message?: string;
        passwordResetRequired?: boolean;
      };

      const passwordResetRequired = dati.passwordResetRequired === true;

      if (!risposta.ok) return { ok: false, messaggio: dati.message || "Credenziali non valide" };
      if (!coppiaCompleta(dati)) return { ok: false, messaggio: "Token non ricevuto dal server" };

      return {
        ok: true,
        coppia: { accessToken: dati.accessToken, refreshToken: dati.refreshToken, expiresIn: dati.expiresIn },
        passwordResetRequired,
      };
    } catch {
      return { ok: false, messaggio: "Servizio di autenticazione non raggiungibile, riprova tra poco" };
    }
  }

  async rinnova(refreshToken: string): Promise<EsitoRinnovo> {
    try {
      const risposta = await this.fetch(`${this.issuer}/sessions/refresh`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ refreshToken, audience: this.opzioni.audience }),
      });

      if (risposta.status === 401) return { esito: "rifiutata" };
      if (!risposta.ok) return NON_DISPONIBILE;

      const dati = (await risposta.json()) as Partial<CoppiaDiToken>;
      return coppiaCompleta(dati) ? { esito: "rinnovata", sessione: dati } : NON_DISPONIBILE;
    } catch {
      return NON_DISPONIBILE;
    }
  }

  /**
   * Chiude la sessione **presso `auth`**: cancellare i cookie toglie il token al browser, ma il
   * refresh token resterebbe valido per 30 giorni per chiunque ne avesse una copia.
   *
   * Best effort: se `auth` non risponde, l'utente esce comunque. Un logout che fallisce perché un
   * altro servizio è giù sarebbe peggio del difetto che chiude.
   */
  async revoca(refreshToken: string): Promise<void> {
    await this.fetch(`${this.issuer}/sessions/revoke`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ refreshToken }),
    }).catch((errore) => console.warn("[logout] revoca non riuscita:", String(errore)));
  }
}
