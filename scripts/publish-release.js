const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

async function githubRequest(url, options = {}) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error('GITHUB_TOKEN is required for publish-release.');
    }

    const res = await fetch(url, {
        ...options,
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'bolo-pc-release-script',
            ...(options.headers || {})
        }
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GitHub API ${res.status}: ${text}`);
    }

    if (res.status === 204) {
        return null;
    }

    return res.json();
}

async function ensureRelease(repo, tagName, version) {
    const apiBase = `https://api.github.com/repos/${repo}`;
    try {
        return await githubRequest(`${apiBase}/releases/tags/${encodeURIComponent(tagName)}`);
    } catch (error) {
        if (!String(error.message).includes('404')) {
            throw error;
        }
    }

    return githubRequest(`${apiBase}/releases`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            tag_name: tagName,
            name: tagName,
            body: process.env.BOLO_RELEASE_BODY || `Bolo PC Server ${version}`,
            draft: false,
            prerelease: false
        })
    });
}

async function deleteExistingAsset(repo, assetId) {
    await githubRequest(`https://api.github.com/repos/${repo}/releases/assets/${assetId}`, {
        method: 'DELETE'
    });
}

async function uploadAsset(uploadUrlTemplate, filePath, contentType) {
    const fileName = path.basename(filePath);
    const uploadUrl = `${uploadUrlTemplate.split('{')[0]}?name=${encodeURIComponent(fileName)}`;
    const fileBuffer = fs.readFileSync(filePath);
    const token = process.env.GITHUB_TOKEN;

    const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
            'Accept': 'application/vnd.github+json',
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'bolo-pc-release-script',
            'Content-Type': contentType,
            'Content-Length': String(fileBuffer.length)
        },
        body: fileBuffer
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Asset upload failed ${res.status}: ${text}`);
    }

    return res.json();
}

async function main() {
    const repoRoot = path.resolve(__dirname, '..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const version = packageJson.version;
    const tagName = `v${version}`;
    const repo = process.env.BOLO_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || 'ashwarsadh/bolo-pc';
    const zipPath = path.join(repoRoot, 'dist', 'Bolo-Server.zip');
    const manifestPath = path.join(repoRoot, 'dist', 'bolo-pc-manifest.json');

    execFileSync('node', [path.join(__dirname, 'prepare-release.js')], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: process.env
    });

    const release = await ensureRelease(repo, tagName, version);
    const assets = Array.isArray(release.assets) ? release.assets : [];
    for (const asset of assets) {
        if (asset.name === 'Bolo-Server.zip' || asset.name === 'bolo-pc-manifest.json') {
            console.log(`[Release] Deleting old asset ${asset.name}`);
            await deleteExistingAsset(repo, asset.id);
        }
    }

    await uploadAsset(release.upload_url, zipPath, 'application/zip');
    await uploadAsset(release.upload_url, manifestPath, 'application/json');

    console.log(`[Release] Published ${tagName} to ${repo}`);
    console.log(`[Release] ZIP: https://github.com/${repo}/releases/latest/download/Bolo-Server.zip`);
    console.log(`[Release] Manifest: https://github.com/${repo}/releases/latest/download/bolo-pc-manifest.json`);
}

main().catch((error) => {
    console.error('[Release] Publish failed:', error.message);
    process.exit(1);
});
