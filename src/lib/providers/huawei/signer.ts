import { createHash, createHmac } from "node:crypto";

/**
 * Huawei Cloud AK/SK request signing ("SDK-HMAC-SHA256"), matching the
 * official SDK's AKSKSigner. Used only when HUAWEI_AUTH=aksk; with OIDC
 * federation requests carry an X-Auth-Token instead.
 */

const ALGORITHM = "SDK-HMAC-SHA256";

const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");

/** RFC 3986 encoding: everything except A-Z a-z 0-9 - _ . ~ is escaped. */
export function urlEncode(s: string): string {
  return encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/** Each path segment encoded; the canonical URI always ends with "/". */
export function canonicalUri(pathname: string): string {
  const uri = pathname.split("/").map(urlEncode).join("/");
  return uri.endsWith("/") ? uri : uri + "/";
}

export function canonicalQuery(params: URLSearchParams): string {
  const pairs: [string, string][] = [];
  params.forEach((v, k) => pairs.push([k, v]));
  pairs.sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a < b ? -1 : 1));
  return pairs.map(([k, v]) => `${urlEncode(k)}=${urlEncode(v)}`).join("&");
}

/** "20261020T083000Z" */
export function sdkDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export interface SignInput {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  accessKey: string;
  secretKey: string;
  now?: Date;
}

/**
 * Returns the headers to send: the input headers plus host, X-Sdk-Date and
 * Authorization. All input headers are signed.
 */
export function signRequest(input: SignInput): Record<string, string> {
  const u = new URL(input.url);
  const date = sdkDate(input.now ?? new Date());
  const all: Record<string, string> = { ...input.headers, host: u.host, "X-Sdk-Date": date };

  const names = Object.keys(all).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  const canonicalHeaders = names.map((n) => `${n.toLowerCase()}:${all[n]}\n`).join("");
  const signedHeaders = names.map((n) => n.toLowerCase()).join(";");

  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri(u.pathname),
    canonicalQuery(u.searchParams),
    canonicalHeaders,
    signedHeaders,
    sha256Hex(input.body ?? ""),
  ].join("\n");

  const stringToSign = [ALGORITHM, date, sha256Hex(canonicalRequest)].join("\n");
  const signature = createHmac("sha256", input.secretKey).update(stringToSign).digest("hex");

  return {
    ...all,
    Authorization: `${ALGORITHM} Access=${input.accessKey}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
