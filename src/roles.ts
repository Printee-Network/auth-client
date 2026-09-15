/**
 * Vocabolario dei ruoli — **unica definizione** per tutto l'ecosistema.
 *
 * Esiste perché la stessa lista copiata in N servizi diverge: è già successo con le liste di
 * label riservati di `fe` e `cc-fe`, che oggi non coincidono. Con cinque stringhe l'incidente è
 * piccolo; con quindici servizi non lo è più.
 */
export const ROLES = [
  "ADMIN",
  "SELLER",
  "OPERATOR",
  "COMMERCIAL_RESP",
  "PRODUCTION_RESP",
  "SERVICE",
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Gerarchia. I primi cinque livelli replicano **esattamente** quelli del `be`
 * (`modules/users/domain/userRole.ts`): adottare questo pacchetto non deve cambiare chi passa
 * un controllo e chi no.
 *
 * `SERVICE` è nuovo e sta a **0** di proposito. A livello 1 sarebbe intercambiabile con SELLER e
 * OPERATOR — la gerarchia è piatta — e un token di servizio passerebbe da solo ogni controllo non
 * ADMIN. Le identità di servizio vanno ammesse **una rotta alla volta** con `authorizeAny`, che è
 * il principio del token exchange: privilegio minimo, non massimo.
 */
const hierarchy: Readonly<Record<Role, number>> = {
  ADMIN: 2,
  SELLER: 1,
  OPERATOR: 1,
  COMMERCIAL_RESP: 1,
  PRODUCTION_RESP: 1,
  SERVICE: 0,
};

export const isRole = (value: string): value is Role =>
  (ROLES as readonly string[]).includes(value);

/** Normalizza e valida. `null` invece di eccezione: un ruolo ignoto è un 403, non un 500. */
export const toRole = (value: string | undefined): Role | null => {
  const normalized = (value ?? "").toUpperCase().trim();
  return isRole(normalized) ? normalized : null;
};

export const hasPermission = (role: Role, required: Role): boolean =>
  hierarchy[role] >= hierarchy[required];
