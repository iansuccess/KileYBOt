const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./dataDir');

const DATA_PATH = path.join(DATA_DIR, 'guild-prefixes.json');
const DEFAULT_PREFIX = ',';

function readPrefixes() {
  try {
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function writePrefixes(prefixes) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(prefixes, null, 2) + '\n', 'utf8');
}

function getPrefix(guildId) {
  const prefixes = readPrefixes();
  return prefixes[guildId] || DEFAULT_PREFIX;
}

function setPrefix(guildId, prefix) {
  const prefixes = readPrefixes();
  prefixes[guildId] = prefix;
  writePrefixes(prefixes);
}

module.exports = { DEFAULT_PREFIX, getPrefix, setPrefix };
