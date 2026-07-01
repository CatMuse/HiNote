import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const bootstrap = readFileSync("src/plugin/PluginBootstrap.ts", "utf8");
const dataManager = readFileSync("src/storage/HiNoteDataManager.ts", "utf8");

assert.match(
  bootstrap,
  /const services = await plugin\.ensureServicesInitialized\(\);[\s\S]*await services\.highlightManager\.handleFileRename\(oldPath, file\.path\)/,
  "rename handler should initialize HiNote services before migrating highlights",
);

assert.doesNotMatch(
  bootstrap,
  /const services = plugin\.services;[\s\S]*if \(services\)/,
  "rename handler should not skip migration when services are still lazy",
);

assert.match(
  dataManager,
  /const newSafeFileName = FilePathUtils\.toSafeFileName\(newPath\);[\s\S]*const newStoragePath = `\$\{FilePathUtils\.getHighlightsDir\(this\.vaultPath\)\}\/\$\{newSafeFileName\}`;/,
  "highlight migration should compute the target storage path without creating a stale mapping first",
);

assert.match(
  dataManager,
  /this\.fileMappingStore\.set\(newPath, newSafeFileName\);/,
  "highlight migration should persist the new path mapping after the file data is written",
);

assert.doesNotMatch(
  dataManager,
  /const newStoragePath = this\.getStoragePathForFile\(newPath\);/,
  "highlight migration should not call getStoragePathForFile(newPath) before the old data is read",
);
