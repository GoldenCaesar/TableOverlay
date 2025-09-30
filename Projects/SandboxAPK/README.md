# Sandbox APK

This project is a simple mobile application that functions as a basic HTML, CSS, and JavaScript editor. You can write code in the editor, preview it on a canvas, and download your work as an `.html` file. The primary purpose of this project is to demonstrate how to package a web application as a signed Android APK using Apache Cordova and GitHub Actions.

## Features

-   **HTML Editor:** A full-screen text area to write and edit HTML, CSS, and JavaScript.
-   **Live Preview:** An iframe canvas to render and display your HTML code.
-   **Settings:**
    -   **Download HTML:** Save your current work as an `index.html` file.
-   **Automated APK Build:** A GitHub Actions workflow automatically builds, signs, and prepares a release-ready APK.

## APK Signing Setup

To enable automatic signing of the Android APK in the GitHub workflow, you need to generate a Java KeyStore (JKS) and set up several secrets in your GitHub repository.

### 1. Generate a Keystore

You will need the Java Development Kit (JDK) installed to run the `keytool` command.

Open your terminal and run the following command. It will prompt you to create a password and answer a few questions about yourself or your organization.

```bash
keytool -genkey -v -keystore release.keystore -alias YOUR_ALIAS -keyalg RSA -keysize 2048 -validity 10000
```

-   Replace `YOUR_ALIAS` with a unique name for your key (e.g., `sandbox-apk-key`).
-   When prompted, create a secure password for the keystore and another for the key itself. It's recommended to use the same password for both to simplify things.
-   This command will generate a file named `release.keystore` in your current directory.

### 2. Encode the Keystore

The GitHub workflow requires the keystore to be Base64 encoded to be stored securely as a secret.

Run the following command in your terminal (ensure `release.keystore` is in the same directory):

**On macOS or Linux:**
```bash
base64 -i release.keystore
```

**On Windows (using PowerShell):**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore"))
```

Copy the entire output string. This will be the value for the `KEYSTORE_B64` secret.

### 3. Configure GitHub Secrets

Navigate to your GitHub repository and go to `Settings` > `Secrets and variables` > `Actions`. Create the following repository secrets:

-   `KEYSTORE_B64`: Paste the Base64 encoded string you copied in the previous step.
-   `KEYSTORE_PASSWORD`: The password you created for your keystore.
-   `KEY_ALIAS`: The alias you used when generating the keystore (e.g., `sandbox-apk-key`).
-   `KEY_PASSWORD`: The password for the key itself (if different from the keystore password).

Once these secrets are set, the GitHub Actions workflow will be able to sign the APK automatically on every push to the `main` branch.

## How the Workflow Works

The workflow (`.github/workflows/build-apk.yml`) performs the following steps:
1.  Checks out the code.
2.  Sets up Node.js and Java.
3.  Installs Cordova.
4.  Decodes the `KEYSTORE_B64` secret back into a `release.keystore` file.
5.  Replaces the placeholder values in `build.json` with the secrets you provided.
6.  Builds the release APK using the `build.json` configuration.
7.  Uploads the signed `app-release.apk` as a workflow artifact.