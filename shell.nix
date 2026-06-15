# Development shell for arcan.
#
# Enter with:    nix-shell
# Or with direnv: see .envrc (not provided by default)
#
# Provides:
#   - Node.js 22 LTS + npm
#   - Playwright browsers (chromium + firefox) bundled with all required
#     system libraries (X11, GTK, NSS, ALSA, etc.) — the bit that's missing
#     when running `npx playwright install` on a stock Linux without
#     `sudo npx playwright install-deps`
#   - SQLite CLI for poking at the local sync server's .jazz-data/sync.sqlite
#   - Build toolchain (gcc, python3, pkg-config) for native npm modules
#
# Notes:
#   - PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD prevents npm install from re-downloading
#     browsers; PLAYWRIGHT_BROWSERS_PATH points Playwright at the Nix store copy.
#   - PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS suppresses Playwright's startup
#     check that scans for libraries via apt; on Nix the libs live in the store
#     and the check would fail noisily without this.
#   - If `npm run test:e2e` complains about a browser-version mismatch between
#     `@playwright/test` and the Nix-bundled browsers, either:
#       (a) update @playwright/test to match what `playwright-driver` provides
#           (run `nix-shell --run 'playwright --version'` to see), or
#       (b) pin nixpkgs to a commit whose playwright-driver matches the npm
#           package version.

{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  name = "arcan-dev";

  buildInputs = with pkgs; [
    # Node toolchain
    nodejs_22

    # General dev tools
    git

    # Playwright browsers bundled with their runtime system deps
    playwright-driver.browsers

    # SQLite CLI for inspecting the local sync server's database
    sqlite

    # Build toolchain for native npm modules (better-sqlite3 etc. need it)
    python3
    gcc
    pkg-config
  ];

  shellHook = ''
    # Point Playwright at the Nix-bundled browsers and skip its system-library check.
    export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
    export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
    export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true

    # Friendly banner
    echo
    echo "arcan dev shell"
    echo "  Node:    $(node --version)"
    echo "  npm:     $(npm --version)"
    echo "  sqlite:  $(sqlite3 --version | cut -d' ' -f1)"
    echo "  PLAYWRIGHT_BROWSERS_PATH: $PLAYWRIGHT_BROWSERS_PATH"
    echo
    echo "First-time setup:"
    echo "  npm install"
    echo
    echo "Dev loop:"
    echo "  npm run dev:all"
    echo
    echo "Tests:"
    echo "  npm test              # Vitest (38 unit tests)"
    echo "  npm run test:e2e      # Playwright (chromium + firefox)"
    echo
  '';
}
