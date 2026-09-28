export class ServiceTokenError extends Error {
  constructor(status: number, detail: string) {
    super(`auth token request failed (${status}): ${detail}`);
  }
}

export type ServiceTokenProviderOptions = {
  /** Issuer di `auth`. */
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
};

type CachedToken = { readonly token: string; readonly expiresAt: number };

/** Quanto prima della scadenza rinnovare, per non usare mai un token al limite. */
const DEFAULT_SKEW_SECONDS = 30;

/**
 * Ottiene i token di servizio da `auth` e li tiene in cache fino a poco prima della scadenza.
 *
 * Senza cache si chiamerebbe l'IdP a ogni richiesta in uscita, il che lo renderebbe una
 * dipendenza di rete nel percorso critico — esattamente ciò che il modello token-centric evita.
 * Con la cache, `auth` viene contattato una volta ogni TTL.
 *
 * Le richieste concorrenti sulla stessa chiave condividono la stessa fetch: all'avvio, dieci
 * chiamate in parallelo producono un solo giro verso `auth`, non dieci.
 */
export class ServiceTokenProvider {
  private readonly cache = new Map<string, CachedToken>();
  private readonly inFlight = new Map<string, Promise<string>>();
  private readonly issuer: string;

  constructor(private readonly options: ServiceTokenProviderOptions) {
    this.issuer = options.issuer.replace(/\/+$/, "");
  }

  /**
   * Token per una chiamata **senza utente** (job, snapshot, render).
   * `tenantSlug` è il tenant per cui si sta operando: `auth` lo concede solo se il client è
   * autorizzato per quel tenant.
   */
  async forService(audience: string, tenantSlug?: string): Promise<string> {
    const key = `${audience}|${tenantSlug ?? ""}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.request(key, {
      grant_type: "client_credentials",
      audience,
      ...(tenantSlug ? { tenant_slug: tenantSlug } : {}),
    });

    this.inFlight.set(key, request);
    return request;
  }

  /**
   * Token per una chiamata **per conto di un utente**: l'identità dell'utente viene preservata,
   * e il servizio chiamante compare come `azp`. Non si mette in cache — è legato a quell'utente
   * e a quella richiesta.
   */
  async onBehalfOf(audience: string, userToken: string): Promise<string> {
    const body = await this.post({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience,
      subject_token: userToken,
    });
    return body.accessToken;
  }

  private async request(key: string, extra: Record<string, string>): Promise<string> {
    try {
      const body = await this.post(extra);
      const lifetime = Math.max(body.expiresIn - DEFAULT_SKEW_SECONDS, 1);

      this.cache.set(key, { token: body.accessToken, expiresAt: Date.now() + lifetime * 1000 });
      return body.accessToken;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async post(
    extra: Record<string, string>,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const response = await fetch(`${this.issuer}/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        ...extra,
      }),
    });

    if (!response.ok) {
      throw new ServiceTokenError(response.status, await response.text().catch(() => ""));
    }

    return (await response.json()) as { accessToken: string; expiresIn: number };
  }
}
