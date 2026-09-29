import { getPublicKey } from "nostr-tools";

// The nsec never reaches the YubiKey. The key's FIDO2 hmac-secret (WebAuthn
// PRF) yields a 32-byte secret that only comes back after a touch and PIN;
// that secret, stretched through HKDF, seals the nsec with AES-GCM here.
const VAULT = "kite.yubikey";
const HKDF_INFO = new TextEncoder().encode("kite nsec v1");
const TIMEOUT_MS = 120_000;

export type YubiKeyVault = {
  v: 1;
  credentialId: string;
  salt: string;
  iv: string;
  ciphertext: string;
  pubkey: string;
};

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
}

export function yubikeyAvailable(): boolean {
  return window.isSecureContext && typeof window.PublicKeyCredential === "function";
}

export function loadVault(): YubiKeyVault | null {
  const raw = localStorage.getItem(VAULT);
  if (!raw) return null;
  try {
    const vault = JSON.parse(raw) as YubiKeyVault;
    return vault.v === 1 && /^[0-9a-f]{64}$/.test(vault.pubkey) ? vault : null;
  } catch {
    return null;
  }
}

export function forgetVault(): void {
  localStorage.removeItem(VAULT);
}

function webauthnError(error: unknown): Error {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return new Error("No answer from the YubiKey: the prompt timed out, was closed, or it was a different key.");
    }
    if (error.name === "SecurityError") {
      return new Error("YubiKey login needs https or http://localhost.");
    }
    if (error.name === "NotSupportedError") {
      return new Error("This browser cannot talk to a security key here.");
    }
  }
  return error instanceof Error ? error : new Error("The YubiKey would not answer.");
}

async function sealingKey(prfSecret: BufferSource, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", prfSecret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: HKDF_INFO },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function prfFromAssertion(
  credentialId: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
): Promise<BufferSource> {
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: "public-key", id: credentialId, transports: ["usb", "nfc"] }],
        // hmac-secret keeps separate secrets with and without PIN; always
        // asking for the PIN keeps unlock deriving the secret setup used.
        userVerification: "required",
        timeout: TIMEOUT_MS,
        hints: ["security-key"],
        extensions: { prf: { eval: { first: salt } } },
      },
    })) as PublicKeyCredential | null;
  } catch (error) {
    throw webauthnError(error);
  }
  const secret = credential?.getClientExtensionResults().prf?.results?.first;
  if (!secret) {
    throw new Error("The YubiKey answered without a PRF secret. Kite needs FIDO2 hmac-secret (YubiKey 5 or newer).");
  }
  return secret;
}

export async function lockToYubiKey(secret: Uint8Array, label: string): Promise<YubiKeyVault> {
  const pubkey = getPublicKey(secret);
  const salt = randomBytes(32);
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        rp: { name: "Kite" },
        user: { id: randomBytes(16), name: label, displayName: `Kite ${label}` },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: "public-key", alg: -8 },
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "cross-platform",
          residentKey: "discouraged",
          requireResidentKey: false,
          userVerification: "required",
        },
        attestation: "none",
        timeout: TIMEOUT_MS,
        hints: ["security-key"],
        extensions: { prf: { eval: { first: salt } } },
      },
    })) as PublicKeyCredential | null;
  } catch (error) {
    throw webauthnError(error);
  }
  const prf = credential?.getClientExtensionResults().prf;
  if (!credential || !prf || (prf.enabled !== true && !prf.results)) {
    throw new Error("This key or browser cannot derive a PRF secret. Use a YubiKey 5 in Brave, Chromium, or Firefox.");
  }

  const credentialId = new Uint8Array(credential.rawId);
  // Most keys only hand out PRF output on sign-in, so setup asks for a second touch.
  const prfSecret = prf.results?.first ?? (await prfFromAssertion(credentialId, salt));
  const iv = randomBytes(12);
  const plain = new Uint8Array(secret);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(pubkey) },
    await sealingKey(prfSecret, salt),
    plain,
  );
  plain.fill(0);

  const vault: YubiKeyVault = {
    v: 1,
    credentialId: toBase64Url(credentialId),
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(new Uint8Array(sealed)),
    pubkey,
  };
  localStorage.setItem(VAULT, JSON.stringify(vault));
  return vault;
}

export async function unlockWithYubiKey(vault: YubiKeyVault): Promise<Uint8Array> {
  const salt = fromBase64Url(vault.salt);
  const prfSecret = await prfFromAssertion(fromBase64Url(vault.credentialId), salt);
  let opened: ArrayBuffer;
  try {
    opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(vault.iv), additionalData: new TextEncoder().encode(vault.pubkey) },
      await sealingKey(prfSecret, salt),
      fromBase64Url(vault.ciphertext),
    );
  } catch {
    throw new Error("That YubiKey does not open this string.");
  }
  const secret = new Uint8Array(opened);
  if (getPublicKey(secret) !== vault.pubkey) {
    throw new Error("That YubiKey does not open this string.");
  }
  return secret;
}
