import { describe, it, expect } from "vitest";
import { canonicalUri, sdkDate, signRequest, urlEncode } from "./signer";

// Golden values produced by the official @huaweicloud/huaweicloud-sdk-core
// AKSKSigner for the same inputs (fake credentials).
const AK = "FAKEACCESSKEY1234567";
const SK = "fakeSecretKey/with+chars=";
const NOW = new Date("2026-10-20T08:30:00Z");
const BASE = "https://kms.example-region-1.myhuaweicloud.com";

describe("signRequest", () => {
  it("matches the official SDK for a GET with query params", () => {
    const h = signRequest({
      method: "GET",
      url: `${BASE}/v1/proj123/secrets?limit=50&marker=dev-a+b`,
      headers: { "X-Project-Id": "proj123" },
      accessKey: AK,
      secretKey: SK,
      now: NOW,
    });
    expect(h.Authorization).toBe(
      "SDK-HMAC-SHA256 Access=FAKEACCESSKEY1234567, SignedHeaders=host;x-project-id;x-sdk-date, Signature=38ef7d79218201f81b4ca7305bde00d47aa392fc1dfc787c8aef08eab6c0c7ca"
    );
    expect(h["X-Sdk-Date"]).toBe("20261020T083000Z");
    expect(h.host).toBe("kms.example-region-1.myhuaweicloud.com");
  });

  it("matches the official SDK for a POST with a JSON body", () => {
    const body = { action: "filter", limit: "1000", tags: [{ key: "environment", values: ["dev"] }] };
    const h = signRequest({
      method: "POST",
      url: `${BASE}/v1/proj123/csms/resource_instances/action`,
      headers: { "X-Project-Id": "proj123", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      accessKey: AK,
      secretKey: SK,
      now: NOW,
    });
    expect(h.Authorization).toBe(
      "SDK-HMAC-SHA256 Access=FAKEACCESSKEY1234567, SignedHeaders=content-type;host;x-project-id;x-sdk-date, Signature=02aaf0a06ea09f3f1fd65c661e3903d9b9f8b55e57a8441d71d361f994d5f199"
    );
  });
});

describe("canonicalisation helpers", () => {
  it("always ends the canonical URI with a slash and encodes segments", () => {
    expect(canonicalUri("/v1/p/secrets")).toBe("/v1/p/secrets/");
    expect(canonicalUri("/v1/p/secrets/")).toBe("/v1/p/secrets/");
    expect(canonicalUri("/v1/p/a b")).toBe("/v1/p/a%20b/");
  });

  it("escapes everything outside the RFC 3986 unreserved set", () => {
    expect(urlEncode("a-b_c.d~e")).toBe("a-b_c.d~e");
    expect(urlEncode("a b!*'()")).toBe("a%20b%21%2A%27%28%29");
  });

  it("formats X-Sdk-Date as compact UTC", () => {
    expect(sdkDate(NOW)).toBe("20261020T083000Z");
  });
});
