import { describe, it, expect } from "vitest";
import nacl from "tweetnacl";
import { parsePairingURL, sealForRecipient, unsealFromSender } from "@/jazz/pairing";

// Helper: base64url-encode a Uint8Array
function toB64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Helper: base64url-decode a string
function fromB64url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(s.length + ((4 - (s.length % 4)) % 4), "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

describe("parsePairingURL", () => {
  it("round-trips with a constructed URL (pipe-delimited fragment)", () => {
    // Build a URL the same way createPairingInvite does:
    // /pair#<b64url(pairingCoValueID|pairingAgentSecret|initiatorPubkeyHex)>
    const pairingCoValueID = "co_zTestID";
    const pairingAgentSecret = "inviteSecret_zTestAgentSecret";
    const initiatorPubkeyHex = "a".repeat(64);
    const fragment = toB64url(
      new TextEncoder().encode(
        `${pairingCoValueID}|${pairingAgentSecret}|${initiatorPubkeyHex}`,
      ),
    );
    const url = `https://example.test/pair#${fragment}`;

    const parsed = parsePairingURL(url);
    expect(parsed.pairingCoValueID).toBe(pairingCoValueID);
    expect(parsed.pairingAgentSecret).toBe(pairingAgentSecret);
    expect(parsed.initiatorPubkeyHex).toBe(initiatorPubkeyHex);
  });

  it("throws on a URL that does not contain /pair", () => {
    expect(() => parsePairingURL("https://example.test/foo#whatever")).toThrow(
      /not a pairing URL/i,
    );
  });

  it("throws on a /pair URL with no fragment", () => {
    expect(() => parsePairingURL("https://example.test/pair")).toThrow();
  });

  it("throws when fragment has wrong number of parts", () => {
    const bad = toB64url(new TextEncoder().encode("only_two|parts"));
    expect(() => parsePairingURL(`https://example.test/pair#${bad}`)).toThrow();
  });
});

describe("sealForRecipient / unsealFromSender", () => {
  it("round-trips plaintext through a nacl box", () => {
    const plaintext = "hello pairing world — accountSecret here";
    const sender = nacl.box.keyPair();
    const recipient = nacl.box.keyPair();

    const ciphertext = sealForRecipient(
      plaintext,
      recipient.publicKey,
      sender.secretKey,
    );
    const recovered = unsealFromSender(
      ciphertext,
      sender.publicKey,
      recipient.secretKey,
    );
    expect(recovered).toBe(plaintext);
  });

  it("returns different ciphertext on each call (random nonce)", () => {
    const sender = nacl.box.keyPair();
    const recipient = nacl.box.keyPair();
    const c1 = sealForRecipient("same message", recipient.publicKey, sender.secretKey);
    const c2 = sealForRecipient("same message", recipient.publicKey, sender.secretKey);
    expect(c1).not.toBe(c2);
  });

  it("throws when opened with wrong recipient key", () => {
    const sender = nacl.box.keyPair();
    const recipient = nacl.box.keyPair();
    const wrong = nacl.box.keyPair();

    const ciphertext = sealForRecipient("secret", recipient.publicKey, sender.secretKey);
    expect(() => unsealFromSender(ciphertext, sender.publicKey, wrong.secretKey)).toThrow();
  });
});
