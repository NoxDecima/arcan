# shell.android.nix — toolchain for building the Tauri Android shell.
# Kept separate from shell.nix so the everyday web dev shell stays light.
#
# Enter with:  nix-shell shell.android.nix
# First time:  rustup default stable && rustup target add aarch64-linux-android \
#                armv7-linux-androideabi i686-linux-android x86_64-linux-android
#
# Requires nixpkgs config allowing unfree (Android SDK):
#   export NIXPKGS_ALLOW_UNFREE=1   (or set in ~/.config/nixpkgs/config.nix)

{ pkgs ? import <nixpkgs> { config.android_sdk.accept_license = true; config.allowUnfree = true; } }:

let
  androidComposition = pkgs.androidenv.composeAndroidPackages {
    platformVersions = [ "34" ];
    buildToolsVersions = [ "34.0.0" ];
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

    echo
    echo "arcan android shell"
    echo "  ANDROID_HOME: $ANDROID_HOME"
    echo "  NDK_HOME:     $NDK_HOME"
    echo "  rustup:       $(rustup --version 2>/dev/null || echo 'run: rustup default stable')"
    echo
    echo "Dev:    npm run tauri android dev     (device via adb or emulator)"
    echo "Build:  npm run tauri android build -- --apk"
    echo
  '';
}
