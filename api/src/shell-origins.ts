// Origins the Tauri shells run on. https://tauri.localhost is Android +
// Windows (useHttpsScheme: true); tauri://localhost is Linux/macOS webkit.
// http://tauri.localhost kept for safety if a build ships without the
// https scheme flag.
export const SHELL_ORIGINS = [
  "https://tauri.localhost",
  "http://tauri.localhost",
  "tauri://localhost",
];
