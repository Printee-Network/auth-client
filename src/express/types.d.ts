import type { Realm } from "../claims";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        tenantId?: string;
        slug?: string;
        realm?: Realm;
        /** Il servizio che sta chiamando per conto dell'utente. */
        azp?: string;
      };
    }
  }
}

export {};
