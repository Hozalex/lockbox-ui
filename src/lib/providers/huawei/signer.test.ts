import { describe, it, expect } from "vitest";
import { canonicalUri, sdkDate, signRequest, urlEncode } from "./signer";

// Golden values produced by the official @huaweicloud/huaweicloud-sdk-core
// AKSKSigner for the same inputs (fake credentials).
const AK = "FAKEACCESSKEY1234567";
const SK = "fakeSecretKey/with+chars=";
const NOW = new Date("2026-10-20T08:30:00Z");
const BASE = "https://kms.la-south-2.myhuaweicloud.com";

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
      "SDK-HMAC-SHA256 Access=FAKEACCESSKEY1234567, SignedHeaders=host;x-project-id;x-sdk-date, Signature=bb4abb0c4b360d37beba7b9cb00453d4490739600d245771bb21c3344ea93e21"
    );
    expect(h["X-Sdk-Date"]).toBe("20261020T083000Z");
    expect(h.host).toBe("kms.la-south-2.myhuaweicloud.com");
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
      "SDK-HMAC-SHA256 Access=FAKEACCESSKEY1234567, SignedHeaders=content-type;host;x-project-id;x-sdk-date, Signature=1ec1d5c190646da28dac6581f52b10c821d6d30ab4c5b11d7436960e98fc69df"
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
