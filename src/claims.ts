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
  readonly tenant?: string;
  readonly slug?: string;
  readonly role?: Role;
  readonly iss: string;
  readonly exp: number;
};

/** True se il token rappresenta un servizio e non una persona. */
export const isServiceIdentity = (claims: AuthClaims): boolean =>
  claims.sub.startsWith("service:");
