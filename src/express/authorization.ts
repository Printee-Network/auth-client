import type { NextFunction, Request, Response } from "express";
import { hasPermission, toRole, type Role } from "../roles";

/**
 * Stessa semantica e stessa firma dell'`authorization.ts` del `be`: adottare il pacchetto non
 * deve richiedere di toccare le 83 chiamate esistenti.
 *
 * Resta **locale e senza I/O**: legge un claim già firmato e lo confronta. `auth` non viene
 * contattato — l'autorizzazione non è centralizzata, e non deve diventarlo
 * (AUTH_ARCHITETTURA.md §2).
 */
/**
 * Il ruolo con cui si decide. Un servizio vale sempre `SERVICE`, qualunque ruolo porti il token: il
 * claim `role` di un token di servizio è quello con cui il client è stato registrato, e un client
 * registrato come `SELLER` passava `authorize("SELLER")`. Il soggetto invece è `service:<clientId>`
 * per costruzione (`isServiceIdentity`).
 */
const roleOf = (req: Request): Role | null =>
  req.user?.id?.startsWith("service:") ? "SERVICE" : toRole(req.user?.role);

export const authorize = (requiredRole: Role) =>
  async function authorization(req: Request, res: Response, next: NextFunction) {
    const role = roleOf(req);

    if (!role) {
      return res.status(401).json({
        message: "Unauthorized - User not authenticated or missing role",
      });
    }

    if (!hasPermission(role, requiredRole)) {
      return res.status(403).json({
        message: "Insufficient permissions",
        requiredRole,
        yourRole: role,
      });
    }

    return next();
  };

/**
 * Autorizzazione per elenco esplicito, senza gerarchia. È il modo corretto di ammettere le
 * identità di servizio: `SERVICE` sta a livello 0 e non passa nessun controllo gerarchico, quindi
 * ogni rotta che un servizio deve poter chiamare va dichiarata qui, una alla volta.
 */
export const authorizeAny = (allowedRoles: readonly Role[]) =>
  async function authorizationAny(req: Request, res: Response, next: NextFunction) {
    const role = roleOf(req);

    if (!role) {
      return res.status(401).json({
        message: "Unauthorized - User not authenticated or missing role",
      });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        message: "Insufficient permissions",
        requiredRoles: allowedRoles,
        yourRole: role,
      });
    }

    return next();
  };
