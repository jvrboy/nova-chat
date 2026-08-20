# Nova Unsigned Build Report

## Project

Repository: `jvrboy/nova-chat`

The repository is already an Expo SDK 54 application. Expo native projects were generated for Android and iOS, and an EAS build profile was added for future signed builds.

## Changes made

| Area | Change |
|---|---|
| Expo native projects | Generated `android/` and `ios/` using Expo prebuild |
| Android release | Removed the release signing assignment so the release variant is configured as unsigned |
| EAS configuration | Added `eas.json` with preview and production iOS profiles |
| Local development | Expo `android` and `ios` scripts now target native run commands after prebuild |
| Validation | TypeScript compiler completed successfully with `./node_modules/.bin/tsc --noEmit` |

## Build status

The unsigned Android APK was not produced because the Gradle build could not resolve the React Native Gradle plugin from the configured Maven/plugin repositories in this Linux environment. The Gradle distribution itself was downloaded successfully, but the build stopped before compilation.

An iOS IPA was not produced because iOS native compilation requires Apple’s Xcode toolchain, including `xcodebuild`, which is unavailable on this Linux build host. Expo’s cloud iOS builds also require an authenticated EAS account and Apple signing credentials; those were intentionally not used.

> An unsigned iOS IPA package would not be installable on a physical iPhone. The app must ultimately be code-signed by Apple tooling before device installation or App Store distribution.

## Reproduction commands

```bash
pnpm install --frozen-lockfile --config.minimum-release-age=0
./node_modules/.bin/tsc --noEmit
npx expo prebuild --no-install --clean
cd android
./gradlew assembleRelease
```

Before producing a distributable Android APK, restore a release keystore configuration and sign the artifact. Before producing an iOS IPA, build on macOS with Xcode and apply an Apple Developer signing identity and provisioning profile.
