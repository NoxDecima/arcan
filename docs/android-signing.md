# Android signing & release

## One-time keystore generation (run locally, keep out of git)

    keytool -genkey -v -keystore arcan-release.jks -keyalg RSA \
      -keysize 2048 -validity 10000 -alias arcan

Store the .jks + both passwords in your password manager. This key doubles
as the Play upload key if we ever enroll — losing it means users must
uninstall/reinstall.

## Fingerprint for App Links (assetlinks.json)

    keytool -list -v -keystore arcan-release.jks -alias arcan | grep SHA256

Paste the SHA256 value into deploy's assetlinks.json (see deploy/README.md).

## GitHub Actions secrets (repo → Settings → Secrets and variables)

Secrets: ANDROID_KEYSTORE_B64 (`base64 -w0 arcan-release.jks`),
ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS (=arcan), ANDROID_KEY_PASSWORD.
Variable: ARCAN_ORIGIN (=https://<your-domain>).

## Cutting a release

    git tag android-v0.1.0 && git push origin android-v0.1.0

CI builds the signed APK and attaches it to a GitHub Release. Obtainium
users add the repo URL once; new releases update automatically.

## One-time: wire signing into the generated Gradle project (after `tauri android init`)

After running `tauri android init` in your nix shell (entering `nix-shell shell.android.nix`
first), the `gen/android/` directory is created. Before committing it, wire in signing
support by editing `gen/android/app/build.gradle.kts`.

**This step is a prerequisite for release tags.** The CI workflow checks for
`keystore.properties` references in the file and fails loudly if they are absent.

Add the following at the top of `gen/android/app/build.gradle.kts` (before the `android {`
block), then extend the existing `android { ... }` block:

```kotlin
import java.util.Properties
import java.io.FileInputStream

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }
    buildTypes {
        getByName("release") {
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }
}
```

The `keystorePropertiesFile.exists()` guards mean an unsigned debug/CI build still compiles
if `keystore.properties` is absent. The file is written by the CI workflow at release time
from GitHub Actions secrets.

### gen/android/.gitignore additions

After `tauri android init` creates `gen/android/`, add (or create) `gen/android/.gitignore`
with these entries so the secrets never land in git:

```
keystore.properties
keystore.jks
```

### Committing gen/android is required for signed releases

The CI workflow runs `tauri android init --ci` only when `gen/android/` is absent. Once you
commit the initialized and wired project, CI uses your committed version (with signing wiring)
instead of re-generating it. Until `gen/android/` is committed:

- Non-release CI builds (push to main, PRs) compile fine but produce an unsigned APK.
- Release tag pushes (`android-v*`) fail at the signing wiring check step with a clear error.

Workflow to prepare the first release:

1. Enter the android nix shell: `nix-shell shell.android.nix`
2. Initialize: `npx tauri android init`
3. Wire signing: edit `gen/android/app/build.gradle.kts` per the block above.
4. Add gitignore: create/update `gen/android/.gitignore` with `keystore.properties` and `keystore.jks`.
5. Commit: `git add gen/android && git commit -m "chore(android): committed gen/android with signing wiring"`
6. Then push the release tag: `git tag android-v0.1.0 && git push origin android-v0.1.0`
