/**
 * I due cookie della sessione di un BFF: l'access token e il refresh token di `auth`.
 *
 * Li scrivono due punti con la stessa API `set`/`delete`: il login (lo store dei cookie di una
 * server action) e il rinnovo nel proxy (i cookie della risposta). Una funzione sola per entrambi:
 * quando ogni frontend ne aveva la sua copia, il flag `secure` era deciso in modi diversi e le
 * correzioni arrivavano in una copia sola.
 */

export const SESSION_COOKIE = "session";
export const REFRESH_COOKIE = "refresh";

/** Il refresh token vive più a lungo dell'access token: è ciò che tiene viva la sessione. */
const REFRESH_GIORNI = 30;

export type CoppiaDiToken = {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Durata dell'access token in secondi, come la dichiara `auth`. */
  readonly expiresIn: number;
};

/** Qualunque store di cookie con `set` e `delete`: quello di una server action o di una risposta. */
export type Barattolo = {
  set(nome: string, valore: string, opzioni: Record<string, unknown>): unknown;
  delete(nome: string): unknown;
};

/**
 * `httpOnly`: il browser li conserva e li rimanda, ma JavaScript non li legge.
 * `secure` sempre, tranne che in sviluppo.
 */
const opzioni = (scadenza: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV !== "development",
  sameSite: "lax" as const,
  path: "/",
  expires: scadenza,
});

/**
 * La scadenza del cookie di sessione segue quella del token (`expiresIn`) invece di un valore fisso:
 * con due durate scollegate, la più corta faceva sparire la sessione con un token ancora valido.
 */
export function scriviCookieSessione(
  barattolo: Barattolo,
  coppia: CoppiaDiToken,
  adesso = Date.now(),
): void {
  barattolo.set(SESSION_COOKIE, coppia.accessToken, opzioni(new Date(adesso + coppia.expiresIn * 1000)));
  barattolo.set(
    REFRESH_COOKIE,
    coppia.refreshToken,
    opzioni(new Date(adesso + REFRESH_GIORNI * 24 * 60 * 60 * 1000)),
  );
}

export function cancellaCookieSessione(barattolo: Barattolo): void {
  barattolo.delete(SESSION_COOKIE);
  barattolo.delete(REFRESH_COOKIE);
}
