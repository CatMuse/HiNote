import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const bootstrap = readFileSync("src/plugin/PluginBootstrap.ts", "utf8");
const repository = readFileSync("src/repositories/HighlightRepository.ts", "utf8");
const dataManager = readFileSync("src/storage/HiNoteDataManager.ts", "utf8");

assert.match(
  bootstrap,
  /const services = await plugin\.ensureServicesInitialized\(\);[\s\S]*await services\.highlightManager\.handleFileRename\(oldPath, file\.path\)/,
  "rename handler should initialize HiNote services before migrating highlights",
);

assert.match(
  bootstrap,
  /file instanceof TFile[\s\S]*file\.extension !== 'md'/,
  "rename handler should ignore folders and non-Markdown files",
);

assert.doesNotMatch(
  bootstrap,
  /const services = plugin\.services;[\s\S]*if \(services\)/,
  "rename handler should not skip migration when services are still lazy",
);

assert.match(
  repository,
  /await this\.dataManager\.initialize\(\);[\s\S]*await this\.dataManager\.getFileHighlights\(oldPath\)/,
  "repository should load uncached highlights before migrating them",
);

assert.match(
  dataManager,
  /const newSafeFileName = FilePathUtils\.toSafeFileName\(newPath\);[\s\S]*const newStoragePath = `\$\{highlightsDir\}\/\$\{newSafeFileName\}`;/,
  "migration should compute the target path without pre-creating a mapping",
);

assert.match(
  dataManager,
  /await this\.app\.vault\.adapter\.write\(newStoragePath, content\);[\s\S]*this\.fileMappingStore\.set\(newPath, newSafeFileName\);[\s\S]*await this\.saveFileMapping\(\);/,
  "migration should publish the new mapping only after writing the data",
);

assert.doesNotMatch(
  dataManager,
  /const newStoragePath = this\.getStoragePathForFile\(newPath\);/,
  "migration should not create the new mapping while calculating its path",
);

assert.match(
  dataManager,
  /if \(oldStoragePath !== newStoragePath\)/,
  "migration should preserve data when old and new safe paths are identical",
);
