/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MATHPIX_APP_ID?: string;
  readonly VITE_MATHPIX_APP_KEY?: string;
  readonly VITE_OCR_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
