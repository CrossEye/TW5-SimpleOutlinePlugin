'use strict';

const fs   = require('fs');
const path = require('path');
const semver = require('semver');

const ROOT            = path.join(__dirname, '..');
const PKG_PATH        = path.join(ROOT, 'package.json');
const PLUGIN_INFO_PATH = path.join(ROOT, 'wiki', 'plugins', 'simple-outline', 'plugin.info');

const PRE_TYPES    = ['alpha', 'beta', 'rc'];
const STABLE_TYPES = ['patch', 'minor', 'major'];
const ALL_TYPES    = [...STABLE_TYPES, ...PRE_TYPES];

function computeNewVersion(current, type) {
  const parsed = semver.parse(current);
  if (!parsed) throw new Error(`Invalid current version: ${current}`);

  if (STABLE_TYPES.includes(type)) {
    return semver.inc(current, type);
  }

  if (PRE_TYPES.includes(type)) {
    const currentPre = parsed.prerelease[0]; // e.g. 'alpha', or undefined

    if (!currentPre) {
      // Stable → next major pre-release
      return `${parsed.major + 1}.0.0-${type}.1`;
    }

    if (currentPre === type) {
      // Same pre-release tag → bump the number
      const num = parsed.prerelease[1];
      return `${parsed.major}.${parsed.minor}.${parsed.patch}-${type}.${num + 1}`;
    }

    const currentIdx = PRE_TYPES.indexOf(currentPre);
    const newIdx     = PRE_TYPES.indexOf(type);

    if (newIdx > currentIdx) {
      // Later tag (e.g. alpha → beta) → same x.y.z base, new tag
      return `${parsed.major}.${parsed.minor}.${parsed.patch}-${type}.1`;
    }

    throw new Error(`Cannot bump to ${type} from ${current}: would go backwards`);
  }

  throw new Error(`Unknown bump type: ${type}. Use one of: ${ALL_TYPES.join(', ')}`);
}

function replaceField(text, field, value) {
  return text.replace(
    new RegExp(`("${field}":\\s*")[^"]+"`),
    `"${field}": "${value}"`
  );
}

const type = process.argv[2];
if (!type) {
  console.error(`Usage: node scripts/bump.js <${ALL_TYPES.join('|')}>`);
  process.exit(1);
}
if (!ALL_TYPES.includes(type)) {
  console.error(`Unknown bump type: ${type}. Use one of: ${ALL_TYPES.join(', ')}`);
  process.exit(1);
}

const pkg     = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const current = pkg.version;
const next    = computeNewVersion(current, type);

console.log(`${current} → ${next}`);

fs.writeFileSync(PKG_PATH,         replaceField(fs.readFileSync(PKG_PATH,         'utf8'), 'version', next), 'utf8');
fs.writeFileSync(PLUGIN_INFO_PATH, replaceField(fs.readFileSync(PLUGIN_INFO_PATH, 'utf8'), 'version', next), 'utf8');
