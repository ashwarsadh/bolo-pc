# Bolo PC: voice typing for Windows from your phone

**Use your Android phone as a wireless microphone for your PC. Speak into the phone, and the text appears at your PC cursor over Wi-Fi.** Dictation in up to 34 languages, including Hindi, with optional AI clean-up.

[![Download latest release](https://img.shields.io/github/v/release/ashwarsadh/bolo-pc?label=Download%20Bolo%20PC&logo=windows)](https://github.com/ashwarsadh/bolo-pc/releases/latest)
[![Get it on Google Play](https://img.shields.io/badge/Google%20Play-Bolo%20AI-3DDC84?logo=googleplay&logoColor=white)](https://play.google.com/store/apps/details?id=com.ashwar.bolo)

Bolo PC is the Windows companion to the **Bolo AI** Android app. The phone listens and transcribes; this small PC app receives the text and types it into whatever window has focus: Word, Chrome, Notepad, Excel, your email, your code editor.

> Search **Bolo AI** on Google Play, or open the [Play Store listing](https://play.google.com/store/apps/details?id=com.ashwar.bolo).

## Features

- **Phone as a PC microphone.** Dictate on your phone, text lands at the cursor on your PC.
- **Voice typing in 34 languages** through Bolo Cloud, including English, Hindi, Bengali, Telugu, Marathi, Gujarati, Tamil, Kannada, Malayalam and Urdu. Full list below.
- **AI clean-up of dictation.** Adds punctuation and removes fillers such as "umm" and "ahh" (uses OpenAI models).
- **Two-way clipboard sync** between phone and PC.
- **Offline option.** On-device dictation on the phone, with no cloud needed.
- **Bring your own key.** Use your own OpenAI or Gemini key if you prefer. Bolo Cloud has a limited free trial.
- **Automatic discovery.** The phone finds your PC on the same network; you confirm with a PIN.
- **Clipboard preserved.** Your existing clipboard is saved and restored after each insert.
- **Floating mic bubble** on Android to dictate into text fields on the phone itself.
- **Tray app.** Runs quietly in the background.

## Quick start

1. Install **Bolo AI** on your Android phone: [Google Play](https://play.google.com/store/apps/details?id=com.ashwar.bolo).
2. Install the PC app, by either route:
   - **Download:** get `Bolo-Server-windows.zip` from the [latest release](https://github.com/ashwarsadh/bolo-pc/releases/latest), unzip it and run `Bolo-Server.exe`.
   - **winget** (*pending approval*, [microsoft/winget-pkgs#464848](https://github.com/microsoft/winget-pkgs/pull/464848); it will not work until that is merged):
     ```powershell
     winget install ashwarsadh.Bolo
     ```
3. Put the phone and PC on the **same Wi-Fi network**.
4. In the Bolo app, open the **PC Mode** tab. Your PC appears in the list; tap it and confirm the PIN.
5. Click into any text field on the PC, tap the mic on the phone and speak.

**Requirements:** Windows 10 or 11, an Android phone with the Bolo app, and both on the same local network.

**About the Windows warning:** the PC app is not yet code-signed, so Windows SmartScreen may show a warning the first time you run it. Choose "More info", then "Run anyway", only if you downloaded it from this repository's releases.

## Supported languages (34)

English, Hindi, Bengali, Telugu, Marathi, Gujarati, Tamil, Kannada, Malayalam, Urdu, Spanish, Portuguese, French, German, Italian, Dutch, Polish, Romanian, Czech, Hungarian, Greek, Swedish, Russian, Ukrainian, Turkish, Arabic, Hebrew, Indonesian, Malay, Vietnamese, Thai, Japanese, Chinese, Swahili.

Accuracy varies by language, voice and microphone. Dictation is verified for the languages above; others are not claimed.

## FAQ

### How do I use my phone as a microphone for my PC?
Install Bolo on your Android phone and Bolo PC on Windows, connect both to the same Wi-Fi, then pair them from the **PC Mode** tab in the app. Whatever you speak into the phone is typed at the cursor on your PC.

### Is there voice typing for Windows that works from a phone?
Yes. Bolo PC receives text that the Android app transcribes and types it into any Windows program where your cursor is. You do not need a headset or a PC microphone.

### Can I do Hindi voice typing on Windows?
Yes. Hindi is one of the supported languages. Dictate in Hindi on your phone and the text appears on your PC. Marathi, Gujarati, Bengali, Telugu, Tamil, Kannada, Malayalam and Urdu are also supported.

### Is there a free speech-to-text option for Windows?
The Bolo PC app is free to download. Dictation can run offline on the phone, through Bolo Cloud (which has a limited free trial), or with your own OpenAI or Gemini key. Check the Play Store listing for current details.

### Does it work without internet?
Offline dictation on the phone works without cloud. The phone and PC still need to be on the same local network to talk to each other.

### What is the clipboard sync?
Copy on the phone and paste on the PC, or the other way round. Sync is explicit and two-way.

### Does Bolo read what is on my screen or in other apps?
No. On Android, Bolo uses the Accessibility service only to detect a text field and insert the text you dictated. It does not read screen content.

### Why does Windows warn me when I run it?
The executable is not code-signed yet, so SmartScreen may flag it. See "About the Windows warning" above.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Phone cannot find PC | Make sure both are on the same Wi-Fi, then try again. |
| Text not typing | Click into a text field on the PC first, then speak on the phone. |
| Firewall prompt | Allow Bolo through Windows Firewall when asked on first run. |
| Port in use | Close other instances of the PC app. |

## Updates

The PC app checks this repository's releases on startup and can update itself from `bolo-pc-manifest.json`.

## For developers

Source is in `src/`. Requires Node.js 18+.

```bash
npm install
npm start          # run the server
npm run build      # build the EXE
```

Release publishing uses `npm run publish-release` with `GITHUB_TOKEN` and `BOLO_RELEASE_REPOSITORY=ashwarsadh/bolo-pc` set. Optional code signing is configured through `WINDOWS_SIGNTOOL_PATH` with `WINDOWS_CERT_SHA1` or `WINDOWS_CERT_PFX`.

---

*Keywords: voice typing for PC from phone, phone as microphone for PC, wireless microphone, Hindi voice typing Windows, speech to text Windows, dictation, clipboard sync.*
