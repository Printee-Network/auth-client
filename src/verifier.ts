import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthClaims, Realm } from "./claims";
import { toRole } from "./roles";

export class InvalidTokenError extends Error {
  constructor(reason: string) {
    super(`Invalid token: ${reason}`);
  }
}

export type VerifierOptions = {
  /** Issuer di `auth`, diverso per ambiente. Confrontato come stringa esatta. */
  readonly issuer: string;
  /** Nome di QUESTO servizio: un token emesso per un altro destinatario va rifiutato. */
  readonly audience: string;
};

/** Tolleranza sugli orologi fra `auth` e il servizio. */
const TOLLERANZA_OROLOGIO_SECONDI = 5;

/**
 * Verifica i token di `auth` usando **solo la chiave pubblica** presa dal JWKS.
 *
 * Il servizio non possiede alcun segreto di firma e quindi non può forgiare token: è la
 * differenza con `ACCESS_SECRET`/`INSTANCE_AUTH_SECRET`, dove chi verifica può anche firmare.
 *
 * La verifica è **locale**: `auth` non viene contattato a ogni richiesta. Il JWKS è in cache e
 * viene ri-scaricato solo quando compare un `kid` sconosciuto — cioè a una rotazione di chiave,
 * che in questo modo non richiede alcun deploy.
 */
export class AuthVerifier {
  private readonly keys: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly options: VerifierOptions) {
    const issuer = options.issuer.replace(/\/+$/, "");
    this.keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
    });
  }

  async verify(token: string): Promise<AuthClaims> {
    const { payload } = await jwtVerify(token, this.keys, {
      issuer: this.options.issuer.replace(/\/+$/, ""),
      audience: this.options.audience,
      clockTolerance: TOLLERANZA_OROLOGIO_SECONDI,
    }).catch((error: Error) => {
      throw new InvalidTokenError(error.message);
    });

    if (typeof payload.sub !== "string" || typeof payload.realm !== "string") {
      throw new InvalidTokenError("claim obbligatori mancanti");
    }

    const role = toRole(typeof payload.role === "string" ? payload.role : undefined);

    return {
      sub: payload.sub,
      aud: this.options.audience,
      azp: typeof payload.azp === "string" ? payload.azp : undefined,
      realm: payload.realm as Realm,
      email: typeof payload.email === "string" ? payload.email : undefined,
      slug: typeof payload.slug === "string" ? payload.slug : undefined,
      role: role ?? undefined,
      iss: payload.iss as string,
      exp: payload.exp as number,
    };
  }
}
