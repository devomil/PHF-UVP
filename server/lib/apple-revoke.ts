import crypto from "crypto";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export function buildAppleClientSecret(opts: {
  teamId: string;
  clientId: string;
  keyId: string;
  privateKeyPem: string;
  now?: number;
}): string {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: opts.keyId, typ: "JWT" };
  const payload = {
    iss: opts.teamId,
    iat: now,
    exp: now + 60 * 5,
    aud: "https://appleid.apple.com",
    sub: opts.clientId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const keyObject = crypto.createPrivateKey(normalizePrivateKey(opts.privateKeyPem));
  const signature = crypto.sign("SHA256", Buffer.from(signingInput), {
    key: keyObject,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

export interface RevokeAppleTokenInput {
  token: string;
  tokenTypeHint?: "refresh_token" | "access_token";
}

export interface RevokeAppleTokenResult {
  ok: boolean;
  status: number;
  body?: string;
  error?: string;
}

export async function revokeAppleToken(input: RevokeAppleTokenInput): Promise<RevokeAppleTokenResult> {
  const clientId = process.env.APPLE_CLIENT_ID;
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKey = process.env.APPLE_PRIVATE_KEY;
  if (!clientId || !teamId || !keyId || !privateKey) {
    return { ok: false, status: 0, error: "Apple credentials not configured" };
  }
  let clientSecret: string;
  try {
    clientSecret = buildAppleClientSecret({ teamId, clientId, keyId, privateKeyPem: privateKey });
  } catch (err: any) {
    return { ok: false, status: 0, error: `Failed to sign Apple client_secret: ${err?.message || err}` };
  }
  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);
  params.set("token", input.token);
  params.set("token_type_hint", input.tokenTypeHint || "refresh_token");

  try {
    const res = await fetch("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const body = await res.text().catch(() => "");
    if (res.ok) return { ok: true, status: res.status, body };
    return { ok: false, status: res.status, body, error: `Apple revoke responded ${res.status}` };
  } catch (err: any) {
    return { ok: false, status: 0, error: err?.message || String(err) };
  }
}
