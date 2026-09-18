const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto').webcrypto;
let network = async () => { throw Error('offline'); };
let testNow;
class TestDate extends Date {
    constructor(...args) { super(...(args.length ? args : [testNow ?? Date.now()])); }
    static now() { return testNow ?? Date.now(); }
}
const modules = new Map();
function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText;
    vm.runInNewContext(source, { exports, console, Date: TestDate, window: { crypto, setTimeout, clearTimeout },
        require: name => {
            if (name === 'obsidian') return { Notice: class {}, Platform: {}, requestUrl: (...args) => network(...args) };
            if (name.endsWith('/i18n')) return { t: value => value };
            if (!name.startsWith('.')) return require(name);
            return load(path.resolve(path.dirname(file), name) + '.ts');
        }
    }, { filename: file });
    return exports;
}
const { FSRSService } = load('src/flashcard/services/FSRSService.ts');
const { FSRSAdapter } = load('src/flashcard/services/FSRSAdapter.ts');
const { FlashcardStorageService } = load('src/flashcard/services/FlashcardStorageService.ts');
const { CardGroupRepository } = load('src/flashcard/services/CardGroupRepository.ts');
const { FlashcardGroupService } = load('src/flashcard/services/FlashcardGroupService.ts');
const { FlashcardStudyService } = load('src/flashcard/services/FlashcardStudyService.ts');
const { DailyStatsService } = load('src/flashcard/services/DailyStatsService.ts');
const { FlashcardReviewService } = load('src/flashcard/services/FlashcardReviewService.ts');
const { LicenseManager } = load('src/services/LicenseManager.ts');
const { loadFlashcardUIState, saveFlashcardUIState } = load('src/flashcard/components/FlashcardUIState.ts');

async function main() {
    await upgradedScheduler();
    const service = new FSRSService();
    const adapter = new FSRSAdapter(service.getParameters());
    const lib = require('ts-fsrs');
    const original = service.initializeCard('Question', 'Answer', 'old.md');
    let native = lib.createEmptyCard(new Date(original.createdAt));
    let stored = original;
    const scheduler = lib.fsrs(adapter.getParameters());
    // Persist/reload after every grade; compare the entire scheduler input.
    for (const grade of [lib.Rating.Again, lib.Rating.Good, lib.Rating.Easy, lib.Rating.Again, lib.Rating.Good, lib.Rating.Good]) {
        const now = native.due;
        const result = scheduler.next(native, now, grade);
        stored = JSON.parse(JSON.stringify(adapter.fromTsFSRSCard(stored, result)));
        const restored = adapter.toTsFSRSCard(stored);
        for (const key of ['state', 'learning_steps', 'scheduled_days', 'reps', 'lapses', 'stability', 'difficulty']) {
            assert.equal(restored[key], result.card[key], 'FSRS roundtrip: ' + key);
        }
        native = result.card;
    }

    let disk = {};
    const plugin = { loadData: async () => structuredClone(disk), saveData: async value => { disk = structuredClone(value); } };
    const persistence = new FlashcardStorageService(plugin);
    const storage = await persistence.load();
    storage.parameters = { ...service.getParameters(), newCardsPerDay: 5, request_retention: 0.85 };
    storage.cards[original.id] = { ...original };
    await persistence.save(storage);
    const reloaded = await new FlashcardStorageService(plugin).load();
    assert.equal(reloaded.parameters.newCardsPerDay, 5);
    assert.equal(reloaded.parameters.request_retention, 0.85);
    assert.equal(reloaded.cards[original.id].state, 0);

    storage.cards = { a: { ...original, id: 'a' }, b: { ...original, id: 'b', filePath: 'new.md' } };
    storage.cardGroups = [{ id: 'g', name: 'G', filter: 'old', cardIds: ['a'] }];
    const repo = new CardGroupRepository({ storage, saveStorage: async () => {}, saveStorageDebounced: () => {}, emitFlashcardChanged: () => {} });
    const groups = new FlashcardGroupService({ getStorage: () => storage, getGroupRepository: () => repo, saveStorage: async () => {}, saveDebounced: () => {} });
    await groups.updateCardGroup('g', { filter: 'new' });
    storage.cards.c = { ...original, id: 'c', filePath: 'new.md' };
    repo.addCardToGroup('c', 'g');
    assert.equal(repo.getCardsByGroupId('g').map(card => card.id).join(','), 'b,c');
    storage.cards.b.filePath = 'other.md';
    assert.equal(repo.getCardsByGroupId('g').map(card => card.id).join(','), 'c');

    const cards = Array.from({ length: 30 }, (_, id) => ({ ...original, id: String(id) }));
    cards.push({ ...original, id: 'learning', state: 1, reviews: 1, lastReview: Date.now() - 120000, nextReview: Date.now() - 1 });
    const study = new FlashcardStudyService({ getGroupRepository: () => ({ getCardsByGroupId: () => cards }),
        getRemainingNewCardsToday: () => 5, getRemainingReviewsToday: () => 0 });
    assert.equal(study.getCardsForStudy('g').length, 6);
    assert.equal(study.getCardsForStudy('g')[0].id, 'learning');

    storage.dailyStats = [];
    storage.cards = { [original.id]: original };
    storage.cardGroups = ['a', 'b'].map(id => ({ id, settings: { useGlobalSettings: false, newCardsPerDay: 5, reviewsPerDay: 5 } }));
    const daily = new DailyStatsService({ getDailyStats: () => storage.dailyStats,
        setDailyStats: value => storage.dailyStats = value, getGlobalStats: () => storage.globalStats,
        getCardGroups: () => storage.cardGroups, getParameters: () => service.getParameters(), saveDebounced: () => {} });
    daily.updateDailyStats(true, 1, 'first', 'a');
    daily.updateDailyStats(false, 3, 'first', 'a', true);
    assert.equal(daily.getRemainingNewCardsToday('a'), 4);
    assert.equal(daily.getRemainingNewCardsToday('b'), 5);
    assert.equal(storage.dailyStats[0].cardsReviewed, 0);
    const tomorrow = new Date(); tomorrow.setHours(24, 0, 1, 0);
    testNow = tomorrow.getTime();
    assert.equal(daily.getRemainingNewCardsToday('a'), 5, 'Group limit resets on local midnight');
    testNow = undefined;

    let fail = true;
    let pending;
    const reviews = new FlashcardReviewService({ getStorage: () => storage, getFsrsService: () => service,
        getDailyStatsService: () => daily, saveStorage: async () => { if (fail) throw Error('disk full'); if (pending) await pending; }, emitFlashcardChanged: () => {} });
    const before = JSON.stringify(storage);
    await assert.rejects(reviews.trackStudyProgress(original.id, 1, 'a'), /disk full/);
    assert.equal(JSON.stringify(storage), before, 'Failed save must restore scheduling and statistics');
    fail = false;
    let resolve;
    pending = new Promise(done => { resolve = done; });
    const first = reviews.trackStudyProgress(original.id, 1, 'a');
    assert.equal(await reviews.trackStudyProgress(original.id, 1, 'a'), null, 'Concurrent rating must not double-count');
    resolve(); await first; pending = null;
    assert.equal(reviews.canUndo(), true);
    assert.equal(await reviews.undoLastReview(), true);
    assert.equal(JSON.stringify(storage), before, 'Undo must restore history, daily limits and global stats');

    let state = { currentGroupName: 'Same', groupProgress: { Same: { currentIndex: 2, isFlipped: true } } };
    const manager = { getUIState: () => state, updateUIState: value => state = value,
        getCardGroups: () => [{ id: 'one', name: 'Same' }, { id: 'two', name: 'Same' }] };
    const loaded = loadFlashcardUIState(manager);
    assert.equal(loaded.currentGroupId, 'one');
    saveFlashcardUIState(manager, { ...loaded, currentGroupId: 'two', cards: [original], currentIndex: 0 });
    assert.equal(loadFlashcardUIState(manager).currentGroupId, 'two');
    const { restoreReviewPosition } = load('src/flashcard/components/controllers/FlashcardReviewQueue.ts');
    assert.equal(restoreReviewPosition([original], { currentIndex: 3, currentCardId: 'removed', isFlipped: true }).isFlipped, false, 'Replacement card starts with its question');

    let licenseData = { 'vault-id': 'fake', 'flashcard-license': { token: 'fake', key: 'fake', vaultId: 'fake', features: ['flashcard'], lastVerified: Date.now() - 8 * 86400000 } };
    const licensePlugin = { loadData: async () => licenseData, saveData: async value => licenseData = value };
    assert.equal(await new LicenseManager(licensePlugin).isActivated(), true, 'Cold-start offline grace');
    licenseData['flashcard-license'].lastVerified = Date.now() - 31 * 86400000;
    assert.equal(await new LicenseManager(licensePlugin).isActivated(), false, 'Grace must be bounded');
    licenseData['flashcard-license'].lastVerified = Date.now() - 8 * 86400000;
    network = async () => ({ json: { valid: false } });
    assert.equal(await new LicenseManager(licensePlugin).isActivated(), false, 'Explicit rejection must not grant grace');
    network = async () => { throw Error('offline'); };
    assert.equal(await new LicenseManager(licensePlugin).isActivated(), false, 'Rejected license remains rejected after restart');

    const { FlashcardOperations } = load('src/flashcard/components/controllers/FlashcardOperations.ts');
    let visible = [];
    let flipped = false;
    let index = 0;
    let savedPosition = null;
    let renders = 0;
    let timerCallback;
    let cleared = 0;
    let editing = false;
    let statsRefreshes = 0;
    const learning = { ...original, id: 'short', state: 1, reviews: 1, lastReview: Date.now() - 60000, nextReview: Date.now() + 60000 };
    let queue = [original];
    const uiManager = {
        getCardGroups: () => [{ id: 'g', name: 'Group' }],
        getCardsForStudy: () => queue,
        getCardsByGroupId: () => [learning],
        trackStudyProgress: async () => { throw Error('disk full'); }
    };
    const ui = {
        getFsrsManager: () => uiManager,
        getCards: () => visible, setCards: cards => visible = cards,
        getCurrentGroupId: () => 'g', setCurrentGroupId: () => {},
        getCurrentIndex: () => index, setCurrentIndex: value => index = value,
        isCardFlipped: () => flipped, setCardFlipped: value => flipped = value,
        getGroupProgress: () => savedPosition,
        getIsActive: () => true,
        setCompletionMessage: () => {}, setGroupCompletionMessage: () => {},
        saveState: () => savedPosition = { currentIndex: index, currentCardId: visible[index]?.id, isFlipped: flipped },
        updateProgress: () => {},
        getRenderer: () => ({ renderStudyArea: () => renders++, refreshStatistics: () => statsRefreshes++ }),
        getContainer: () => ({ querySelector: () => editing ? {} : null, querySelectorAll: () => [], focus: () => {}, ownerDocument: { defaultView: {
            setTimeout: callback => { timerCallback = callback; return 1; }, clearTimeout: () => cleared++
        } } })
    };
    const operations = new FlashcardOperations(ui);
    operations.refreshCardList();
    assert.equal(visible.length, 1);
    operations.flipCard();
    assert.equal(flipped, true);
    const originalError = console.error;
    try { console.error = () => {}; await operations.rateCard(1); } finally { console.error = originalError; }
    assert.equal(visible[0].id, original.id, 'Failed rating stays visible for retry');
    uiManager.trackStudyProgress = async () => { queue = []; return learning; };
    await operations.rateCard(1);
    assert.equal(visible.length, 0);
    assert.equal(operations.getSessionProgress().completed, 1);
    learning.nextReview = Date.now() - 1;
    queue = [learning];
    const beforeWake = renders;
    timerCallback();
    assert.equal(visible[0].id, 'short', 'Learning card automatically returns');
    assert.equal(renders, beforeWake + 1, 'Empty study area refreshes when due');
    queue = [learning, original];
    editing = true;
    timerCallback();
    assert.equal(visible.length, 1, 'Timer must not replace a queue while editing an answer');
    editing = false;
    const beforeRefresh = renders;
    timerCallback();
    assert.equal(visible.length, 2);
    assert.equal(renders, beforeRefresh, 'Timer preserves current card DOM');
    assert.equal(statsRefreshes, 1, 'All counters refresh together');
    operations.dispose();
    assert.ok(cleared > 0, 'Timers cleaned on disposal');
    operations.refreshCardList();
    flipped = true;
    let finishRating;
    uiManager.trackStudyProgress = () => new Promise(resolve => { finishRating = resolve; });
    const lateRating = operations.rateCard(3);
    operations.dispose();
    const afterDispose = renders;
    finishRating(learning);
    await lateRating;
    assert.equal(renders, afterDispose, 'Late save must not redraw a disposed view');
    await transactions(original);
    console.log('Flashcard learning passed: FSRS-6 defaults and migration, parameter validation, preview parity, FSRS roundtrip, settings restart, groups, limits, transactional writes, undo, ID state, offline license, editor-safe timers and counters.');
}

async function transactions(original) {
    const { FSRSManager } = load('src/flashcard/services/FSRSManager.ts');
    let disk = new FlashcardStorageService({}).createDefaultStorage();
    disk.cards[original.id] = { ...original, sourceId: 'source', sourceType: 'highlight' };
    disk.cardGroups = [{ id: 'group', name: 'Group', filter: '', cardIds: [original.id] }];
    let beforeWrite = async () => {};
    const data = {
        getFlashcardData: async () => structuredClone(disk),
        saveFlashcardData: async value => { await beforeWrite(); disk = structuredClone(value); }
    };
    const plugin = { registerEvent: () => {}, eventManager: { on: () => ({}), emitFlashcardChanged: () => {} } };
    const manager = new FSRSManager(plugin, data);
    await manager.initialize();
    let release;
    let started;
    let began = new Promise(resolve => started = resolve);
    let wait = new Promise(resolve => release = resolve);
    let fail = true;
    beforeWrite = async () => { started(); await wait; if (fail) { fail = false; throw Error('disk full'); } };
    const failedRating = manager.trackStudyProgress(original.id, 1, 'group');
    await began;
    assert.equal(manager.getAllCards()[0].reviews, 0, 'Pending review is invisible to other views');
    const ordinarySave = manager.saveStoragePublic();
    const rejected = assert.rejects(failedRating, /disk full/);
    release();
    const originalError = console.error;
    try { console.error = () => {}; await rejected; await ordinarySave; } finally { console.error = originalError; }
    assert.equal(disk.cards[original.id].reviews, 0, 'Queued save cannot persist a failed rating');

    began = new Promise(resolve => started = resolve);
    wait = new Promise(resolve => release = resolve);
    const rating = manager.trackStudyProgress(original.id, 1, 'group');
    await began;
    manager.updateCardsBySourceId('source', 'highlight', undefined, 'Answer edited during save');
    const laterSave = manager.saveStoragePublic();
    release(); await rating; await laterSave;
    assert.equal(disk.cards[original.id].reviews, 1);
    assert.equal(disk.cards[original.id].answer, 'Answer edited during save', 'Review commit must preserve source edits');
    assert.equal(manager.canUndoReview(), true);
    await manager.undoLastReview();
    assert.equal(disk.cards[original.id].reviews, 0);
    assert.equal(disk.cards[original.id].answer, 'Answer edited during save', 'Undo must preserve source edits');
    const schedule = disk.cards[original.id].nextReview;
    await manager.setCardSuspended(original.id, true);
    assert.equal(manager.getCardsForStudy('hinote:all').length, 0);
    assert.equal(manager.getCardsForStudy('hinote:paused').length, 1);
    assert.equal(manager.getGroupProgress('hinote:all').newCards, 0);
    assert.equal(await manager.trackStudyProgress(original.id, 3), null, 'Paused cards cannot be rated');
    assert.equal(disk.cardGroups.length, 1, 'Built-in groups must not be written into user groups');
    await manager.dispose();
    const restarted = new FSRSManager(plugin, data);
    await restarted.initialize();
    assert.equal(restarted.getAllCards()[0].reviews, 0);
    assert.equal(restarted.getAllCards()[0].suspended, true, 'Pause survives restart');
    await restarted.setCardSuspended(original.id, false);
    assert.equal(restarted.getAllCards()[0].nextReview, schedule, 'Resume preserves schedule');
    assert.equal(restarted.getCardsForStudy('hinote:all').length, 1);
    const orphan = restarted.addCard('Ungrouped question', 'Answer', 'orphan.md');
    assert.equal(restarted.getCardsByGroupId('hinote:ungrouped')[0].id, orphan.id);
    assert.equal(restarted.getTotalCardsCount(), 2, 'Count includes ungrouped cards exactly once');
    await restarted.dispose();
}
main().catch(error => { console.error(error); process.exitCode = 1; });

async function upgradedScheduler() {
    const lib = require('ts-fsrs');
    const { DEFAULT_FSRS_PARAMETERS } = load('src/flashcard/types/FSRSTypes.ts');
    const legacy = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
        0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755, 0, 0, 0, 0];
    const equal = (a, b, message) => assert.equal(JSON.stringify(a), JSON.stringify(b), message);
    const service = new FSRSService();
    equal(service.getParameters().w, lib.default_w, 'New installs use upstream FSRS-6 defaults');
    service.loadParameters({ w: legacy, request_retention: 0.85, newCardsPerDay: 7 });
    equal(service.getParameters().w, lib.default_w, 'Exact legacy defaults migrate');
    assert.equal(service.getParameters().request_retention, 0.85);
    assert.equal(service.getParameters().newCardsPerDay, 7);
    const custom = [...legacy]; custom[0] = 0.6;
    service.loadParameters({ w: custom });
    const expected = lib.generatorParameters({ w: custom, enable_short_term: true, enable_fuzz: true }).w;
    equal(service.getParameters().w, expected, 'Custom weights are normalized, never replaced with defaults');
    equal(new FSRSAdapter(service.getParameters()).getParameters().w, expected, 'Saved weights match the scheduler');
    assert.equal(custom[20], 0, 'Normalization does not mutate caller data');
    const saved = service.getParameters();
    service.loadParameters(saved);
    equal(service.getParameters(), saved, 'Normalization is idempotent');
    for (const w of [[], [1], Array(21).fill(NaN), Array(21).fill(Infinity)]) {
        assert.throws(() => service.setParameters({ w }), /Invalid/);
        equal(service.getParameters(), saved, 'Failed validation leaves settings intact');
        assert.throws(() => new FSRSService({ w }), /Invalid/);
    }
    service.resetParameters();
    equal(service.getParameters(), DEFAULT_FSRS_PARAMETERS, 'Reset uses current defaults');
    const copy = service.getParameters(); copy.w[0] = 100;
    assert.equal(service.getParameters().w[0], lib.default_w[0]);

    testNow = new Date('2026-09-18T10:00:00Z').getTime();
    try {
        let card = service.initializeCard('Question', 'Answer');
        const before = JSON.stringify(card);
        let predictions = service.getSchedulingCards(card);
        assert.equal(predictions[1].nextReview - testNow, 60000, 'Again starts the one-minute learning step');
        assert.equal(predictions[3].nextReview - testNow, 600000, 'Good starts the ten-minute learning step');
        assert.equal(predictions[4].state, lib.State.Review);
        assert.equal(JSON.stringify(card), before, 'Preview never modifies the card or history');
        for (const grade of [1, 2, 3, 3, 1, 2, 3, 3, 4]) {
            predictions = service.getSchedulingCards(card);
            for (const option of [1, 2, 3, 4]) {
                equal(service.reviewCard(card, option), predictions[option], 'Every preview matches its rating');
            }
            const reviewed = service.reviewCard(card, grade);
            equal(reviewed, predictions[grade], 'All four previews use the same scheduling as actual reviews');
            assert.ok(Number.isFinite(reviewed.nextReview) && reviewed.nextReview > testNow);
            card = JSON.parse(JSON.stringify(reviewed));
            testNow = card.nextReview;
        }
        assert.equal(card.reviewHistory.length, 9);
        const { FSRSManager } = load('src/flashcard/services/FSRSManager.ts');
        let disk = new FlashcardStorageService({}).createDefaultStorage();
        disk.parameters = { ...DEFAULT_FSRS_PARAMETERS, w: legacy, newCardsPerDay: 7 };
        disk.cards[card.id] = card;
        const originalCard = JSON.stringify(card);
        let writes = 0;
        const data = {
            getFlashcardData: async () => structuredClone(disk),
            saveFlashcardData: async value => { writes++; disk = structuredClone(value); }
        };
        const plugin = { registerEvent: () => {}, eventManager: { on: () => ({}), emitFlashcardChanged: () => {} } };
        const manager = new FSRSManager(plugin, data);
        await manager.initialize();
        equal(disk.parameters.w, lib.default_w);
        assert.equal(disk.parameters.newCardsPerDay, 7);
        assert.equal(JSON.stringify(disk.cards[card.id]), originalCard, 'Migration preserves all card data and existing due dates');
        assert.equal(writes, 1);
        await manager.dispose();
        const restarted = new FSRSManager(plugin, data);
        await restarted.initialize();
        assert.equal(writes, 1, 'Restart does not repeat the migration');
        equal(restarted.fsrsService.getParameters(), disk.parameters);
        await restarted.dispose();
        disk.parameters.w = [...legacy];
        const oldDisk = JSON.stringify(disk);
        const failing = new FSRSManager(plugin, { ...data, saveFlashcardData: async () => { throw Error('disk full'); } });
        const previousError = console.error;
        try {
            console.error = () => {};
            await assert.rejects(failing.initialize(), /disk full/);
        } finally { console.error = previousError; }
        assert.equal(JSON.stringify(disk), oldDisk, 'Failed migration does not lose stored settings or reviews');
        await failing.dispose();
    } finally { testNow = undefined; }
}
