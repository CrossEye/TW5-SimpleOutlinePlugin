'use strict';

const {mkdirSync, copyFileSync} = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const {version} = require(path.join(ROOT, 'package.json'));
const src     = path.join(ROOT, 'docs', 'index.html');
const destDir = path.join(ROOT, 'docs', version);
const dest    = path.join(destDir, 'index.html');

mkdirSync(destDir, {recursive: true});
copyFileSync(src, dest);
console.log(`docs/index.html → docs/${version}/index.html`);
