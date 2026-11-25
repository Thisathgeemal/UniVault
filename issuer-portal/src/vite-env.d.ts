/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL including /api/v1 (public, bundled into the app) */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
