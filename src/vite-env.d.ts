/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SYNC_URL?: string;
  readonly VITE_ARCAN_ORIGIN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
