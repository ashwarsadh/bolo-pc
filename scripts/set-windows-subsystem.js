const fs = require('fs');
const path = require('path');

const SUBSYSTEM_WINDOWS_GUI = 2;
const SUBSYSTEM_WINDOWS_CUI = 3;

function usage() {
    console.error('Usage: node scripts/set-windows-subsystem.js <exe-path> <windows|console>');
    process.exit(2);
}

const exePath = process.argv[2] ? path.resolve(process.argv[2]) : null;
const mode = process.argv[3];

if (!exePath || !['windows', 'console'].includes(mode)) {
    usage();
}

const targetSubsystem = mode === 'windows' ? SUBSYSTEM_WINDOWS_GUI : SUBSYSTEM_WINDOWS_CUI;
const buffer = fs.readFileSync(exePath);

if (buffer.length < 0x100 || buffer.toString('ascii', 0, 2) !== 'MZ') {
    throw new Error(`${exePath} is not a valid Windows PE executable.`);
}

const peOffset = buffer.readUInt32LE(0x3c);
if (buffer.toString('ascii', peOffset, peOffset + 4) !== 'PE\u0000\u0000') {
    throw new Error(`${exePath} is missing a valid PE header.`);
}

const optionalHeaderOffset = peOffset + 24;
const magic = buffer.readUInt16LE(optionalHeaderOffset);
if (magic !== 0x10b && magic !== 0x20b) {
    throw new Error(`${exePath} has an unsupported optional header magic: 0x${magic.toString(16)}.`);
}

// IMAGE_OPTIONAL_HEADER.Subsystem is 68 bytes from the optional header start
// for both PE32 and PE32+.
const subsystemOffset = optionalHeaderOffset + 68;
const previousSubsystem = buffer.readUInt16LE(subsystemOffset);
buffer.writeUInt16LE(targetSubsystem, subsystemOffset);
fs.writeFileSync(exePath, buffer);

console.log(
    `[Build] Windows subsystem updated: ${previousSubsystem} -> ${targetSubsystem} (${mode})`
);
