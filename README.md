# Bolo PC Server

Receives voice-transcribed text from the Bolo Android app and types it at the current cursor position on your Windows PC.

## Requirements

- **Node.js 18+** â€” [Download](https://nodejs.org/)
- **Windows 10/11**
- Both phone and PC must be on the **same Wi-Fi network**

## Setup

```bash
# Install dependencies (one-time)
npm install

# Start the server
npm start
```

## Release and auto-update

The PC app checks GitHub Releases on startup and updates from:

- `https://github.com/ashwarsadh/bolo-pc/releases/latest/download/bolo-pc-manifest.json`
- `https://github.com/ashwarsadh/bolo-pc/releases/latest/download/Bolo-Server.zip`

The short user-facing download URL shown in the Android app is:

- `https://tinyurl.com/bolo-pc`

Keep that TinyURL target pointed to:

- `https://github.com/ashwarsadh/bolo-pc/releases/latest/download/Bolo-Server.zip`

For every new PC release:

1. bump `version` in `package.json`
2. build the EXE
3. publish the ZIP + manifest to GitHub Releases

Commands:

```bash
npm run build
npm run publish-release
```

Required environment variables:

```powershell
$env:GITHUB_TOKEN="your_fine_grained_pat"
$env:BOLO_RELEASE_REPOSITORY="ashwarsadh/bolo-pc"
```

Optional:

```powershell
$env:BOLO_RELEASE_NOTES="Short release notes"
$env:BOLO_RELEASE_BODY="Full GitHub release notes"
```

Optional code signing:

```powershell
$env:WINDOWS_SIGNTOOL_PATH="C:\Program Files (x86)\Windows Kits\10\bin\x64\signtool.exe"
$env:WINDOWS_CERT_SHA1="certificate_thumbprint"
```

or:

```powershell
$env:WINDOWS_CERT_PFX="C:\path\to\certificate.pfx"
$env:WINDOWS_CERT_PASSWORD="pfx_password"
```

Unsigned builds can still show Windows SmartScreen warnings. A valid code-signing certificate plus release reputation is the real fix for SmartScreen.

`publish-release` will:

- create/update `dist/Bolo-Server.zip`
- create/update `dist/bolo-pc-manifest.json`
- create the `v<version>` GitHub release if needed
- replace existing release assets so installed PC clients auto-update to the new version

The release build patches the EXE to use the Windows GUI subsystem, so it starts as a tray/background app instead of opening a black console window.

## How It Works

1. **Start this server** on your PC (`npm start`)
2. **Open Bolo** on your phone â†’ go to **PC Mode** tab
3. Your PC will appear automatically in the discovery list
4. **Tap your PC name** to connect
5. **Tap the mic button** on your phone, speak, and the text appears at your PC's cursor position

## Features

- **Zero-config discovery** â€” your phone finds the PC automatically via mDNS
- **Cursor-position insertion** â€” text is pasted wherever your cursor is (any app: Word, Chrome, Notepad, etc.)
- **Email formatting** â€” if you dictate an email, the phone automatically adds proper line breaks
- **Clipboard preserved** â€” your clipboard content is saved and restored after each paste

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Phone can't find PC | Ensure both are on the same Wi-Fi. Try manual IP from the server console. |
| Port in use error | Close other instances or change `PORT` in `src/index.js` |
| Text not typing | Click on a text field on your PC first, then speak on your phone |
| Firewall blocking | Allow Node.js through Windows Firewall (usually prompted on first run) |

