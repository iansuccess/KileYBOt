const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', 'data');
const configuredDataDir = process.env.LIKEYBOT_DATA_DIR?.trim();
const DATA_DIR = path.resolve(configuredDataDir || DEFAULT_DATA_DIR);

function copyMissingFiles(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyMissingFiles(source, target);
    } else if (entry.isFile() && !fs.existsSync(target)) {
      fs.copyFileSync(source, target);
    }
  }
}

if (configuredDataDir && DATA_DIR !== DEFAULT_DATA_DIR) {
  copyMissingFiles(DEFAULT_DATA_DIR, DATA_DIR);
}

fs.mkdirSync(DATA_DIR, { recursive: true });
console.log('LikeyBot data directory: ' + DATA_DIR);

const PERSISTED_SETTINGS = new Set([
  'autoreact-settings.json',
  'guild-prefixes.json',
  'guild-settings.json',
  'jail-settings.json',
  'leveling-settings.json',
  'log-settings.json',
  'protection-settings.json',
  'server-ads.json',
  'server-boosts.json',
  'social-media.json',
  'ticket-settings.json',
  'welcomer-settings.json',
]);

function isPersistedSetting(relativePath) {
  return PERSISTED_SETTINGS.has(relativePath.split('/').pop());
}

function listSettings(directory = DATA_DIR, base = DATA_DIR, result = []) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, item.name);
    if (item.isDirectory()) listSettings(fullPath, base, result);
    else if (item.isFile()) {
      const relativePath = path.relative(base, fullPath).split(path.sep).join('/');
      if (isPersistedSetting(relativePath)) result.push({ fullPath, relativePath });
    }
  }
  return result;
}

async function initializeDataStore() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    console.warn('MONGODB_URI is missing. Hosted settings will use local files and may be lost after a restart.');
    return;
  }

  const mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await mongoClient.connect();
  const db = mongoClient.db(process.env.MONGODB_DATABASE?.trim() || 'likeybot');
  const collection = db.collection('server_settings_files');
  const remoteFiles = await collection.find({}).toArray();

  // The database is the durable source of truth after the first deployment.
  for (const record of remoteFiles) {
    if (typeof record._id !== 'string' || !isPersistedSetting(record._id) || typeof record.content !== 'string') continue;
    const target = path.resolve(DATA_DIR, record._id);
    if (target !== DATA_DIR && !target.startsWith(DATA_DIR + path.sep)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, record.content, 'utf8');
  }

  const syncedContent = new Map();
  const persistFile = async (relativePath) => {
    if (!isPersistedSetting(relativePath)) return;
    const target = path.resolve(DATA_DIR, relativePath);
    if (target !== DATA_DIR && !target.startsWith(DATA_DIR + path.sep)) return;
    try {
      const content = await fs.promises.readFile(target, 'utf8');
      if (syncedContent.get(relativePath) === content) return;
      await collection.updateOne(
        { _id: relativePath },
        { $set: { content, updatedAt: new Date() } },
        { upsert: true },
      );
      syncedContent.set(relativePath, content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await collection.deleteOne({ _id: relativePath });
        syncedContent.delete(relativePath);
      } else throw error;
    }
  };

  const syncAllSettings = async () => {
    const files = listSettings();
    const present = new Set(files.map((file) => file.relativePath));
    for (const file of files) await persistFile(file.relativePath);
    for (const relativePath of [...syncedContent.keys()]) {
      if (!present.has(relativePath)) {
        await collection.deleteOne({ _id: relativePath });
        syncedContent.delete(relativePath);
      }
    }
  };

  // Seed current settings on the first connection, then keep edits synchronized.
  await syncAllSettings();
  let queuedSync = Promise.resolve();
  let debounceTimer;
  const watcher = fs.watch(DATA_DIR, { recursive: true }, (_eventType, filename) => {
    if (!filename) return;
    const relativePath = String(filename).split(path.sep).join('/');
    if (!isPersistedSetting(relativePath)) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      queuedSync = queuedSync.then(() => persistFile(relativePath)).catch((error) => {
        console.error('Could not save a server setting to MongoDB:', error.message);
      });
    }, 100);
  });
  watcher.on('error', (error) => console.error('Settings watcher error:', error.message));

  const reconciliationTimer = setInterval(() => {
    queuedSync = queuedSync.then(syncAllSettings).catch((error) => {
      console.error('Could not sync server settings to MongoDB:', error.message);
    });
  }, 5000);
  reconciliationTimer.unref();
  console.log('MongoDB settings store connected; restored ' + remoteFiles.length + ' saved setting files.');
}

module.exports = { DATA_DIR, initializeDataStore };
