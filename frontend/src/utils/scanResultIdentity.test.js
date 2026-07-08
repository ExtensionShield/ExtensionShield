import { describe, expect, it } from "vitest";
import { doesScanResultMatchIdentifier, getScanResultIdentifiers } from "./scanResultIdentity";

describe("scanResultIdentity", () => {
  const authenticatorScan = {
    extension_id: "abcdefghijklmnopabcdefghijklmnop",
    extension_name: "Authenticator",
    slug: "authenticator",
    metadata: {
      title: "Authenticator",
    },
  };

  it("matches a scan by extension id", () => {
    expect(
      doesScanResultMatchIdentifier(
        authenticatorScan,
        "abcdefghijklmnopabcdefghijklmnop",
        "abcdefghijklmnopabcdefghijklmnop"
      )
    ).toBe(true);
  });

  it("matches a scan by persisted or derived slug", () => {
    expect(doesScanResultMatchIdentifier(authenticatorScan, "authenticator")).toBe(true);
    expect(getScanResultIdentifiers(authenticatorScan).has("authenticator")).toBe(true);
  });

  it("does not treat an unrelated slug route as cached just because context holds the current extension id", () => {
    expect(
      doesScanResultMatchIdentifier(
        authenticatorScan,
        "vidiq-vision-for-youtube",
        "abcdefghijklmnopabcdefghijklmnop"
      )
    ).toBe(false);
  });

  it("matches legacy extension_slug rows too", () => {
    expect(
      doesScanResultMatchIdentifier(
        {
          extension_id: "ponmlkjihgfedcbaponmlkjihgfedcba",
          extension_slug: "vidiq-vision-for-youtube",
          extension_name: "vidIQ Vision for YouTube",
        },
        "vidiq-vision-for-youtube"
      )
    ).toBe(true);
  });
});
