import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const listController = readFileSync(
  "src/views/highlight/list/HighlightListController.ts",
  "utf8",
);
const infiniteScrollManager = readFileSync(
  "src/views/highlight/list/InfiniteScrollManager.ts",
  "utf8",
);

assert.match(
  listController,
  /if \(searchTerm === '' && searchType === ''\)[\s\S]*await this\.renderSearchResults\(this\.options\.state\.highlights\);/,
  "clearing search should restore results through the bounded rendering path",
);

assert.match(
  listController,
  /private async renderSearchResults\([\s\S]*await this\.renderHighlightsPaginated\(highlights\);/,
  "search results should use pagination in both file and all-highlights views",
);

assert.match(
  listController,
  /await this\.updateHighlights\(false, false\);[\s\S]*await this\.renderSearchResults\(this\.options\.state\.highlights\);/,
  "restoring a file after global search should not render all highlights before pagination",
);

assert.match(
  listController,
  /loadMoreHighlights\([\s\S]*async \(batch, append\) => this\.renderHighlights\(batch, append\),[\s\S]*false[\s\S]*loadUntilScrollable[\s\S]*setupInfiniteScroll/,
  "paginated rendering should replace the first batch and append later batches",
);

assert.doesNotMatch(
  listController,
  /await this\.updateAllHighlights\(searchTerm, searchType\);[\s\S]{0,220}this\.renderHighlights\(this\.options\.state\.highlights\);/,
  "global search should not render every result again after paginated rendering",
);

assert.match(
  infiniteScrollManager,
  /renderCallback: \(batch: HighlightInfo\[\], append: boolean\) => Promise<void>,[\s\S]*append: boolean = true[\s\S]*await renderCallback\(batch, append\);/,
  "the initial infinite-scroll batch should support replacement rendering",
);
