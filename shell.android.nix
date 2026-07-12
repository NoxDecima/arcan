# shell.android.nix — toolchain for building the Tauri Android shell.
# Kept separate from shell.nix so the everyday web dev shell stays light.
#
# Enter with:  nix-shell shell.android.nix
# First time:  rustup default stable && rustup target add aarch64-linux-android \
#                armv7-linux-androideabi i686-linux-android x86_64-linux-android
#
# Unfree acceptance is handled in-file (config.allowUnfree below). Only if
# you pass your own pkgs must you set NIXPKGS_ALLOW_UNFREE=1 yourself.

{ pkgs ? import <nixpkgs> { config.android_sdk.accept_license = true; config.allowUnfree = true; } }:

let
  androidComposition = pkgs.androidenv.composeAndroidPackages {
    # These versions must exist in your channel's androidenv repo.json.
    platformVersions = [ "34" "36" ];
    buildToolsVersions = [ "34.0.0" "35.0.0" ];
    includeNDK = true;
    ndkVersions = [ "27.0.12077973" ];
    includeEmulator = false;
  };
in
pkgs.mkShell {
  name = "arcan-android";

  buildInputs = with pkgs; [
    nodejs_22
    git
    rustup
    jdk21
    androidComposition.androidsdk
    pkg-config
    openssl
  ];

  shellHook = ''
    export ANDROID_HOME=${androidComposition.androidsdk}/libexec/android-sdk
    export NDK_HOME=$ANDROID_HOME/ndk-bundle
    export JAVA_HOME=${pkgs.jdk21.home}

    # NixOS: Gradle/AGP's Maven-downloaded aapt2 is dynamically linked against
    # /lib64 and dies with "AAPT2 Daemon startup failed" — use the SDK's own.
    # Keep the build-tools version in sync with buildToolsVersions above.
    export GRADLE_OPTS="-Dorg.gradle.project.android.aapt2FromMavenOverride=$ANDROID_HOME/build-tools/35.0.0/aapt2"

    # Tauri reads NDK_HOME; cargo-ndk and other tooling read these aliases.
    export ANDROID_NDK_HOME=$NDK_HOME
    export ANDROID_NDK_ROOT=$NDK_HOME

    echo
    echo "arcan android shell"
    echo "  ANDROID_HOME: $ANDROID_HOME"
    echo "  NDK_HOME:     $NDK_HOME"
    echo "  rustup:       $(rustup --version 2>/dev/null || echo 'run: rustup default stable')"
    echo
    echo "Dev (recommended):  npm run android:dev:all"
    echo "    one command: sync + auth + tauri android dev, served to the phone"
    echo "    over Tailscale Serve HTTPS. Add -- --print to inspect without launching."
    echo "Build APK:          npm run android:build"
    echo ""
    echo "First time on this machine? README.md 'Android' section:"
    echo "  rustup targets, npm ci + better-sqlite3 rebuild, adb device acceptance."
    echo
  '';
}
