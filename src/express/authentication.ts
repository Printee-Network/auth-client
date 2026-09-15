import type { NextFunction, Request, Response } from "express";
import type { AuthVerifier } from "../verifier";

const bearerOf = (header: string | undefined): string | null => {
  const [type, token] = (header ?? "").split(" ");
  return type === "Bearer" && token ? token : null;
};

/**
 * Sostituisce l'`authentication.ts` di ogni servizio. Da HMAC con segreto condiviso a verifica
 * asimmetrica via JWKS: **è l'unico file di autenticazione che il refactoring cambia** per servizio.
 *
 * `req.user` mantiene la forma che i servizi già si aspettano (`id`, `email`, `role`, `tenantId`,
 * `slug`), più i campi nuovi: così `authorize()` e le sue chiamate restano identiche.
 */
export const createAuthentication = (verifier: AuthVerifier) =>
  async function authentication(req: Request, res: Response, next: NextFunction) {
    const token = bearerOf(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    try {
      const claims = await verifier.verify(token);

      req.user = {
        id: claims.sub,
        email: claims.email ?? "",
        role: claims.role ?? "",
        tenantId: claims.tenant,
        slug: claims.slug,
        realm: claims.realm,
        azp: claims.azp,
      };

      // Il tenant del token deve coincidere con quello risolto dal sottodominio: un token valido
      // per un tenant non deve poter operare su un altro.
      const requestTenant = (req as { tenant?: { slug?: string } }).tenant;
      if (requestTenant?.slug && claims.slug && claims.slug !== requestTenant.slug) {
        return res.status(403).json({ message: "Token tenant mismatch" });
      }

      return next();
    } catch {
      return res.status(401).json({ message: "Invalid token" });
    }
  };
