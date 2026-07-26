const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

function runSendInputScript(text, backspaceCount = 0) {
    return new Promise((resolve) => {
        const tmpFile = path.join(os.tmpdir(), `bolo_type_${Date.now()}.txt`);
        const tmpPs1 = path.join(os.tmpdir(), `bolo_type_${Date.now()}.ps1`);

        // Write the text to a temp file (avoids all escaping issues)
        fs.writeFileSync(tmpFile, text || '', 'utf8');

        const ps1Content = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class SendInputHelper {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [StructLayout(LayoutKind.Explicit, Size = 40)]
    public struct INPUT {
        [FieldOffset(0)]
        public uint type;
        [FieldOffset(8)]
        public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

        public static uint TypeText(string text) {
            if (string.IsNullOrEmpty(text)) return 0;
            var inputList = new System.Collections.Generic.List<INPUT>();
            for (int i = 0; i < text.Length; i++) {
                char ch = text[i];
                if (ch == '\\r') continue;
                if (ch == '\\n') {
                    inputList.Add(CreateKeyInput(0x10, 0, 0));
                    inputList.Add(CreateKeyInput(0x0D, 0, 0));
                    inputList.Add(CreateKeyInput(0x0D, 0, 0x0002));
                    inputList.Add(CreateKeyInput(0x10, 0, 0x0002));
                    continue;
                }
                ushort scan = (ushort)ch;
                inputList.Add(CreateKeyInput(0, scan, 0x0004));
                inputList.Add(CreateKeyInput(0, scan, 0x0004 | 0x0002));
            }
            if (inputList.Count == 0) return 0;
            INPUT[] inputs = inputList.ToArray();
            return SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        public static uint PressBackspace(int count) {
            if (count <= 0) return 0;
            INPUT[] inputs = new INPUT[count * 2];
            for (int i = 0; i < count; i++) {
                inputs[i * 2].type = 1;
                inputs[i * 2].ki.wVk = 0x08;
                inputs[i * 2].ki.wScan = 0;
                inputs[i * 2].ki.dwFlags = 0;
                inputs[i * 2].ki.time = 0;
                inputs[i * 2].ki.dwExtraInfo = IntPtr.Zero;

                inputs[i * 2 + 1].type = 1;
                inputs[i * 2 + 1].ki.wVk = 0x08;
                inputs[i * 2 + 1].ki.wScan = 0;
                inputs[i * 2 + 1].ki.dwFlags = 0x0002;
                inputs[i * 2 + 1].ki.time = 0;
                inputs[i * 2 + 1].ki.dwExtraInfo = IntPtr.Zero;
            }
            return SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        }

        private static INPUT CreateKeyInput(ushort vk, ushort scan, uint flags) {
            INPUT input = new INPUT();
            input.type = 1;
            input.ki.wVk = vk;
            input.ki.wScan = scan;
            input.ki.dwFlags = flags;
            input.ki.time = 0;
            input.ki.dwExtraInfo = IntPtr.Zero;
            return input;
        }
    }
"@

$backspaces = ${backspaceCount}
if ($backspaces -gt 0) {
    [SendInputHelper]::PressBackspace($backspaces) | Out-Null
}
$text = [System.IO.File]::ReadAllText('${tmpFile.replace(/\\/g, '\\\\')}', [System.Text.Encoding]::UTF8)
$sent = [SendInputHelper]::TypeText($text)
Remove-Item '${tmpFile.replace(/\\/g, '\\\\')}' -ErrorAction SilentlyContinue
Write-Output "SENT:$sent"
`;

        fs.writeFileSync(tmpPs1, ps1Content, 'utf8');

        execFile('powershell', [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-File', tmpPs1
        ], { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
            // Clean up temp files
            try { fs.unlinkSync(tmpFile); } catch (_) {}
            try { fs.unlinkSync(tmpPs1); } catch (_) {}

            if (err) {
                console.error('[Typer] Error:', err.message);
                if (stderr) console.error('[Typer] stderr:', stderr.trim());
                resolve(false);
                return;
            }

            const output = stdout.trim();
            const match = output.match(/SENT:(\d+)/);
            if (match && parseInt(match[1]) > 0) {
                console.log(`[Text] Typed ${text.length} chars via SendInput (${match[1]} events sent)`);
                resolve(true);
            } else {
                console.error('[Typer] SendInput returned 0 or unexpected output:', output);
                if (stderr && stderr.trim()) console.error('[Typer] stderr:', stderr.trim());
                resolve(false);
            }
        });
    });
}

/**
 * Type text at the current cursor position using PowerShell + SendInput.
 */
async function typeAtCursor(text) {
    if (!text || text.trim().length === 0) {
        console.log('[WARN] Empty text, skipping');
        return false;
    }
    return runSendInputScript(text, 0);
}

/**
 * Replace previously typed realtime preview text with new text.
 */
async function replaceTypedText(previousText, newText) {
    const safePrevious = previousText || '';
    const safeNext = newText || '';
    if (safePrevious === safeNext) return true;

    let commonPrefixLength = 0;
    const maxPrefix = Math.min(safePrevious.length, safeNext.length);
    while (
        commonPrefixLength < maxPrefix &&
        safePrevious[commonPrefixLength] === safeNext[commonPrefixLength]
    ) {
        commonPrefixLength += 1;
    }

    const backspaceCount = safePrevious.length - commonPrefixLength;
    const suffixToType = safeNext.substring(commonPrefixLength);
    return runSendInputScript(suffixToType, backspaceCount);
}

module.exports = { typeAtCursor, replaceTypedText };
