'use strict';

const {execSync} = require('child_process');
const fs         = require('fs');
const path       = require('path');
const semver     = require('semver');

const PKG     = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const version = PKG.version;
const parsed  = semver.parse(version);
const tag     = `v${version}`;

// Tag only on major/minor releases: patch === 0, no pre-release
const isTaggable = parsed.patch === 0 && parsed.prerelease.length === 0;

let tagAlreadyExists = false;
if (isTaggable) {
  try {
    const existing = execSync(`git tag -l ${tag}`, {stdio: 'pipe'}).toString().trim();
    tagAlreadyExists = existing.length > 0;
  } catch (_) {
    // git unavailable — conservative: don't tag
    tagAlreadyExists = true;
  }
}

const shouldTag = isTaggable && !tagAlreadyExists;

// Write outputs — to GITHUB_OUTPUT file in CI, or stdout locally
const output = process.env.GITHUB_OUTPUT;
if (output) {
  fs.appendFileSync(output, `should-tag=${shouldTag}\n`);
  fs.appendFileSync(output, `version=${version}\n`);
  fs.appendFileSync(output, `tag=${tag}\n`);
} else {
  console.log(`should-tag: ${shouldTag}`);
  console.log(`version:    ${version}`);
  console.log(`tag:        ${tag}`);
}
