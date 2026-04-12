'use strict';

const fs     = require('fs');
const path   = require('path');
const semver = require('semver');

const ROOT = path.join(__dirname, '..');
const PKG  = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const version     = PKG.version;
const ghPagesBase = PKG.ghPagesBase;   // e.g. "https://crosseye.github.io/TW5-SimpleOutlinePlugin"
const repo        = process.env.REPO;  // e.g. "CrossEye/TW5-SimpleOutlinePlugin"
const fullHash    = process.env.COMMIT_HASH;
const shortHash   = fullHash ? fullHash.slice(0, 7) : 'unknown';
const commitUrl   = repo ? `https://github.com/${repo}/commit/${fullHash}` : '#';
const message     = (process.env.COMMIT_MESSAGE || '').trim();
const date        = process.env.COMMIT_DATE
  ? process.env.COMMIT_DATE.slice(0, 10)
  : new Date().toISOString().slice(0, 10);

// Compute sort key: pad each semver segment to 3 digits, append pre-release if present
function sortKey(ver) {
  const p = semver.parse(ver);
  if (!p) throw new Error(`Invalid semver: ${ver}`);
  const base = String(p.major).padStart(3, '0')
             + String(p.minor).padStart(3, '0')
             + String(p.patch).padStart(3, '0');
  if (p.prerelease.length === 0) return base;
  const tag = p.prerelease[0];
  const num = String(p.prerelease[1] || 0).padStart(3, '0');
  return `${base}-${tag}.${num}`;
}

// Encode a tiddler title to its TW5 filesystem filename
// TW5 rule: : → _, / → _, _ stays as _
function tidFilename(title) {
  return title.replace(/:/g, '_').replace(/\//g, '_') + '.tid';
}

const tiddlerTitle = `$:/_/so/version/${version}`;
const filename     = tidFilename(tiddlerTitle);
const filepath     = path.join(ROOT, 'wiki', 'tiddlers', filename);

const key         = sortKey(version);
const downloadUrl = `${ghPagesBase}/${version}/`;
const heading     = `!!! [[${version}|${downloadUrl}]] - ${date} <small>([[${shortHash}|${commitUrl}]])</small>`;

// Split the commit message into a summary line and optional body.
// Normalise bullet lists in the body: convert leading '- ' to '* ' and
// ensure a blank line precedes the first item of each bullet run.
function formatBody(text) {
  const lines = text.split('\n');
  const out   = [];
  for (const line of lines) {
    const norm     = /^- /.test(line) ? '* ' + line.slice(2) : line;
    const isBullet = norm.startsWith('* ');
    if (isBullet) {
      const prev        = out.length > 0 ? out[out.length - 1] : null;
      const prevIsBullet = prev !== null && prev.startsWith('* ');
      if (prev !== null && prev !== '' && !prevIsBullet) {
        out.push('');
      }
    }
    out.push(norm);
  }
  return out.join('\n').trim();
}

const msgLines  = message.split('\n');
const firstLine = msgLines[0].trim();
const bodyText  = msgLines.slice(1).join('\n').trim();
const body      = bodyText ? formatBody(bodyText) : '';

const entry = body
  ? `${heading}\n\n<details>\n<summary>''${firstLine}''</summary><div>\n\n${body}\n\n</div></details>\n\n----------\n`
  : `${heading}\n\n''${firstLine}''\n\n----------\n`;

let content;
if (!fs.existsSync(filepath)) {
  content = [
    `title: ${tiddlerTitle}`,
    `tags: so-version`,
    `version: ${version}`,
    `sort-key: ${key}`,
    `download: ${downloadUrl}`,
    ``,
    ``,
  ].join('\n');
} else {
  content = fs.readFileSync(filepath, 'utf8');
  if (!content.endsWith('\n')) content += '\n';
}

content += entry;

fs.writeFileSync(filepath, content, 'utf8');
console.log(`Updated ${filename}`);
