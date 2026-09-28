import type { Role } from "./roles";

export const REALMS = ["tenant-staff", "platform-admin", "op-customers"] as const;
export type Realm = (typeof REALMS)[number];

/** Contratto del token emesso da `auth` (AUTH_ARCHITETTURA.md §8.2). */
export type AuthClaims = {
  readonly sub: string;
  readonly aud: string;
  /** Il servizio che sta effettuando la chiamata. Assente se chiama direttamente l'utente. */
  readonly azp?: string;
  readonly realm: Realm;
  readonly email?: string;
  /** Il tenant, per slug. È l'unico riferimento al tenant nel token: `tenant` non esiste più. */
  readonly slug?: string;
  readonly role?: Role;
  readonly iss: string;
  readonly exp: number;
};

/**
 * True se il token rappresenta un servizio e non una persona. Il soggetto è l'unico discriminante
 * affidabile: `service:<clientId>` per costruzione. Il realm no — i token di servizio nascono
 * `platform-admin` — e nemmeno il ruolo, che è una convenzione di registrazione del client.
 */
export const isServiceIdentity = (claims: AuthClaims): boolean =>
  claims.sub.startsWith("service:");
