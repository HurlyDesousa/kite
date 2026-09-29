// WebAuthn Level 3 hints; lib.dom only declares them on the *JSON option types.
export {};

declare global {
  interface PublicKeyCredentialCreationOptions {
    hints?: string[];
  }

  interface PublicKeyCredentialRequestOptions {
    hints?: string[];
  }
}
