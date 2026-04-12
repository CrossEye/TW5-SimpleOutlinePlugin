'use strict';

// Rebuild all $:/_/so/version/* tiddlers from scratch using git history.
// Groups commits by the package.json version present at each commit, then
// writes one tiddler per version containing all non-bot commits for that
// version in chronological order.

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const semver = require('semver');

const ROOT = path.join(__dirname, '..');
const PKG  = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const ghPagesBase = PKG.ghPagesBase;
const repoUrl     = (PKG.repository && PKG.repository.url) || '';
const repoMatch   = repoUrl.match(/github\.com[/:](.+?)(?:\.git)?$/);
const repo        = repoMatch ? repoMatch[1] : '';

function sortKey(ver) {
  const p = semver.parse(ver);
  if (!p) throw new Error(`Invalid semver: ${ver}`);
  const base = String(p.major).padStart(3, '0')
             + String(p.minor).padStart(3, '0')
             + String(p.patch).padStart(3, '0');
  if (p.prerelease.length === 0) return base;
  return `${base}-${p.prerelease[0]}.${String(p.prerelease[1] || 0).padStart(3, '0')}`;
}

function tidFilename(title) {
  return title.replace(/:/g, '_').replace(/\//g, '_') + '.tid';
}

function stripVersionPrefix(msg) {
  return msg.replace(/^v\d+\.\d+\.\d+(-[\w.]+)?\s*:\s*/, '').trim();
}

// ---------------------------------------------------------------------------
// 1. Collect all commits (oldest first), skipping GA bot commits

const DELIM = '@@COMMIT@@';

const raw = execSync(
  `git log --format="${DELIM}%H%n%ai%n%B"`,
  { cwd: ROOT, encoding: 'utf8' }
);

const commits = raw.split(DELIM).slice(1).map(entry => {
  const nl1 = entry.indexOf('\n');
  const nl2 = entry.indexOf('\n', nl1 + 1);
  const fullHash = entry.slice(0, nl1).trim();
  const date     = entry.slice(nl1 + 1, nl2).trim().slice(0, 10);  // YYYY-MM-DD
  const message  = entry.slice(nl2 + 1).trim();
  return { fullHash, shortHash: fullHash.slice(0, 7), date, message };
}).filter(c =>
  c.fullHash &&
  !c.message.startsWith('docs: build for')  // skip GA commit-back commits
);

// ---------------------------------------------------------------------------
// 2. Read package.json version at each commit; group commits by version

const versionCache = new Map();

function versionAt(hash) {
  if (versionCache.has(hash)) return versionCache.get(hash);
  try {
    const pkg = JSON.parse(
      execSync(`git show "${hash}:package.json"`, { cwd: ROOT, encoding: 'utf8' })
    );
    const ver = pkg.version || null;
    versionCache.set(hash, ver);
    return ver;
  } catch {
    versionCache.set(hash, null);
    return null;
  }
}

// Map: version string -> commits array (chronological)
const byVersion = new Map();
for (const c of commits) {
  const ver = versionAt(c.fullHash);
  if (!ver) continue;
  if (!byVersion.has(ver)) byVersion.set(ver, []);
  byVersion.get(ver).push(c);
}

// ---------------------------------------------------------------------------
// 3. Write one tiddler per version

for (const [version, vCommits] of byVersion) {
  const tiddlerTitle  = `$:/_/so/version/${version}`;
  const filename      = tidFilename(tiddlerTitle);
  const versionsDir   = path.join(ROOT, 'wiki', 'plugins', 'simple-outline', 'versions');
  const filepath      = path.join(versionsDir, filename);
  fs.mkdirSync(versionsDir, { recursive: true });
  const key           = sortKey(version);
  const downloadUrl  = `${ghPagesBase}/${version}/`;

  const fields = [
    `title: ${tiddlerTitle}`,
    `tags: so-version`,
    `version: ${version}`,
    `sort-key: ${key}`,
    `download: ${downloadUrl}`,
    ``,
    ``,
  ].join('\n');

  let body = `!!! [[${version}|${downloadUrl}]]\n\n`;
  for (const c of vCommits) {
    const commitUrl = repo
      ? `https://github.com/${repo}/commit/${c.fullHash}`
      : '#';
    const stripped = stripVersionPrefix(c.message);
    body += `!!!! Commit [[${c.shortHash}|${commitUrl}]] (${c.date})\n\n\`\`\`\n${stripped}\n\`\`\`\n\n`;
  }
  body += '----------\n';

  fs.writeFileSync(filepath, fields + body, 'utf8');
  console.log(`  ${filename} (${vCommits.length} commit(s))`);
}

console.log('\nDone.');
