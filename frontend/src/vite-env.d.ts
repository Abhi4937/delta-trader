/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional bearer token for a gated prod backend. When set, the REST clients
   * send `Authorization: Bearer <token>` and the WS appends `?token=<token>`.
   * Unset in dev -> no auth, backend is permissive.
   */
  readonly VITE_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
