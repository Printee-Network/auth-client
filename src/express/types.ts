/**
 * Estensione di `req.user` per lo strato express della libreria. È un `.ts` e non un `.d.ts`: `tsc`
 * non copia i `.d.ts` di input nella build, quindi prima non arrivava mai nel pacchetto. Non è
 * importata dall'indice di proposito: i servizi dichiarano ancora il proprio `req.user`, e una seconda
 * dichiarazione globale diversa andrebbe in conflitto con la loro.
 */
import type { Realm } from "../claims";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        slug?: string;
        realm?: Realm;
        /** Il servizio che sta chiamando per conto dell'utente. */
        azp?: string;
      };
    }
  }
}

export {};
