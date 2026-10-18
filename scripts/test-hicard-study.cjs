const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
    }).outputText, { exports, Date, require: name => {
        if (!(name in imports)) throw Error(`Unexpected import ${name}`);
        return imports[name];
    }});
    return exports;
}
const t = (text, vars = {}) => text.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
class Element {
    constructor(tag = 'div', options = {}) {
        this.tag = tag; this.options = options; this.children = []; this.events = {};
        this.classes = new Set((options.cls ?? '').split(' ')); this.classList = { add: cls => this.classes.add(cls), toggle: (cls, enabled) => this.toggleClass(cls, enabled) }; this.isConnected = true;
        this.value = '';
    }
    createEl(tag, options = {}) { const el = new Element(tag, options); this.children.push(el); return el; }
    createDiv(options) { return this.createEl('div', options); }
    createSpan(options) { return this.createEl('span', options); }
    addEventListener(name, handler) { this.events[name] = handler; }
    addClass(cls) { this.classes.add(cls); }
    toggleClass(cls, enabled) { if (enabled) this.classes.add(cls); else this.classes.delete(cls); }
    removeClass(cls) { this.classes.delete(cls); }
    setText(text) { this.options.text = text; }
    setAttribute(key, value) { this.options.attr ??= {}; this.options.attr[key] = value; }
    toggleAttribute(key, enabled) { this.options.attr ??= {}; if (enabled) this.options.attr[key] = ''; else delete this.options.attr[key]; }
    setCssProps(props) { this.css = props; }
    empty() { this.children = []; }
    focus() {}
    querySelectorAll(selector) {
        return this.children.flatMap(child => [child, ...child.querySelectorAll('*')])
            .filter(child => selector === '*' || selector.split(',').some(part => child.classes.has(part.trim().slice(1))));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}
const icons = [];
const menuItems = [];
class Menu {
    addItem(build) {
        const item = { setTitle(title) { this.title = title; return this; }, setIcon() { return this; },
            onClick(callback) { this.callback = callback; return this; } };
        build(item); menuItems.push(item); return this;
    }
    showAtMouseEvent() {}
}
let exitChoice = 'stay', saveSuccess = true, processing = false, saveCalls = 0, modalOpens = 0;
class FakeStudyExitModal {
    constructor() { this.result = Promise.resolve(exitChoice); }
    open() { modalOpens++; }
    close() {}
}
class TFile { constructor(path) { this.path = path; } }
class MarkdownView {
    constructor() { this.editor = { offsetToPos: offset => ({ line: offset, ch: 0 }), setCursor() {}, scrollIntoView() {} }; }
}
const { FlashcardCardRenderer } = load('src/flashcard/components/renderers/FlashcardCardRenderer.ts', {
    '../../../models/HighlightModels': {},
    './StudyExitModal': { StudyExitModal: FakeStudyExitModal },
    obsidian: { TFile, MarkdownView, Menu, Notice: class {}, setIcon() {}, setTooltip: (el, text) => el.tooltip = text },
    '../../../components/comment': {
        CommentInputSaveController: class {
            reset() {} isProcessing() { return processing; }
            async saveCurrentContent() { saveCalls++; return saveSuccess; }
        },
        CommentInputActionBar: class { constructor(el) { this.el = el; } render() { return this.el.createDiv(); } }
    },
    '../../../components/comment/CommentInputKeyboard': { setupCommentInputKeyboard() {} },
    '../../../i18n': { t }, '../../../utils/IdGenerator': {}, '../../types/FSRSTypes': { FSRS_RATING: {} }
});
const { FlashcardEmptyStateRenderer } = load('src/flashcard/components/renderers/FlashcardEmptyStateRenderer.ts', {
    obsidian: { setIcon: (_, icon) => icons.push(icon) }, '../../../i18n': { t, formatDateTime: value => String(value) },
    '../../types/FlashcardGroups': { ALL_CARDS_GROUP: 'all', PAUSED_CARDS_GROUP: 'paused' }
});
const { FlashcardProgressManager } = load('src/flashcard/components/controllers/FlashcardProgress.ts', {
    '../../../i18n': { t }, './FlashcardProgressStats': {}
});
async function main() {
    const root = new Element();
    const file = new TFile('source.md');
    const card = { id: 'card', text: 'A long question. '.repeat(40), answer: 'Answer', filePath: file.path, sourceId: 'source' };
    let openedType, openedFile, location, rated = 0, returned = 0, undone = 0, flipped = true;
    const manager = {
        canUndoReview: () => true, getCardGroups: () => [{ id: 'g' }], getCardPredictions: () => ({ 1: { nextReview: Date.now() + 60000 } }),
        getCardsByGroupId: () => [card]
    };
    const context = {
        getContainer: () => root, isCardFlipped: () => flipped, getFsrsManager: () => manager, getCurrentGroupId: () => 'g',
        getCurrentGroupName: () => 'Group', getCards: () => [card],
        getRatingButtons: () => [{ rating: 1, ratingText: 'again', label: 'Again', key: '1' }],
        getUtils: () => ({ addPagePreview() {} }), rateCard: () => rated++, undoReview: () => undone++,
        getPlugin: () => ({ highlightRepository: { findHighlightById: () => ({ filePath: file.path, position: 42 }) } }),
        getApp: () => ({ vault: { getAbstractFileByPath: () => file }, workspace: {
            getLeaf: type => { openedType = type; return { view: new MarkdownView(),
                openFile: async value => openedFile = value, setEphemeralState: state => location = state }; }
        } }),
        getSessionProgress: () => ({ completed: 1, reviews: 2, remaining: 0, studyTimeMs: 2300 }),
        getReturnLabel: () => 'Back to study groups', returnFromStudy: () => returned++
    };
    const renderer = new FlashcardCardRenderer(context, { render: async () => {} });
    renderer.render(root, card);
    const originalCard = root.querySelector('.flashcard');
    const originalFront = root.querySelector('.flashcard-front');
    const originalBack = root.querySelector('.flashcard-back');
    for (const side of [originalFront, originalBack]) {
        assert.ok(side.children[0].classes.has('flashcard-face-header'), 'Each face starts with its heading');
        assert.ok(side.children[0].querySelector('.flashcard-source-link'), 'Source is inside the face header');
    }
    assert.equal(root.querySelector('.flashcard-footer'), null, 'No duplicate source below the card');
    flipped = false;
    assert.equal(renderer.updateFace(root, card), true);
    assert.equal(root.querySelector('.flashcard'), originalCard, 'Flip must preserve the card element');
    assert.equal(root.querySelector('.flashcard-back'), originalBack, 'Flip must preserve rendered Markdown');
    assert.equal(originalFront.options.attr['aria-hidden'], 'false');
    assert.equal(originalBack.options.attr.inert, '');
    assert.ok(root.querySelector('.flashcard-reveal-button'));
    assert.equal(root.querySelector('.flashcard-reveal-button').children.length, 1, 'Reveal has no shortcut badge');
    flipped = true;
    assert.equal(renderer.updateFace(root, card), true);
    assert.equal(originalCard.classes.has('is-flipped'), true);
    assert.equal(originalBack.options.attr['aria-hidden'], 'false');
    assert.equal(originalFront.options.attr.inert, '');
    assert.equal(root.querySelector('.flashcard-reveal-button'), null);
    assert.equal(renderer.updateFace(root, { ...card, id: 'next' }), false, 'A different card must render normally');

    assert.equal(root.querySelector('.flashcard').events.click, undefined, 'Selecting card text cannot flip it');
    const question = root.querySelector('.flashcard-question-context');
    assert.equal(question.tag, 'details', 'Long question is collapsed on the answer side');
    assert.equal(question.children[0].tag, 'summary');
    const rating = root.querySelector('.flashcard-rating-button');
    assert.equal(rating.options.attr['aria-keyshortcuts'], '1');
    assert.equal(rating.tooltip, 'Could not recall the answer');
    assert.equal(rating.children[0].children.length, 1, 'Rating shortcut numbers are not displayed');
    root.querySelector('.flashcard-more').events.click({});
    const undo = menuItems.find(item => item.title === 'Undo last rating');
    assert.ok(undo, 'Undo remains available inside More actions');
    undo.callback(); assert.equal(undone, 1);
    assert.equal(root.querySelector('.flashcard-undo'), null, 'Undo has no persistent button');
    rating.events.click({ stopPropagation() {} }); assert.equal(rated, 1);
    const source = root.querySelector('.flashcard-source-link');
    assert.equal(source.tag, 'button');
    source.events.click({ stopPropagation() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(openedType, 'tab', 'Source must not replace the learning tab');
    assert.equal(openedFile, file); assert.equal(location.line, 42);
    renderer.renderAnswerEditor(root.querySelector('.flashcard-answer-content'), card);
    assert.equal(rating.disabled, true, 'Answer draft disables grading controls');
    assert.equal(root.querySelector('.hi-note-delete-link').tag, 'button');
    assert.equal(await renderer.prepareToLeave(), true, 'An empty draft exits without prompting');
    const draft = renderer.answerEditor.textarea;
    draft.value = 'Draft answer';
    exitChoice = 'stay';
    assert.equal(await renderer.prepareToLeave(), false, 'Keep studying protects the draft');
    assert.equal(draft.value, 'Draft answer');
    exitChoice = 'discard';
    assert.equal(await renderer.prepareToLeave(), true, 'Discard explicitly allows exit');
    exitChoice = 'save'; saveSuccess = false;
    assert.equal(await renderer.prepareToLeave(), false, 'Failed save must not exit');
    assert.equal(draft.value, 'Draft answer');
    saveSuccess = true;
    assert.equal(await renderer.prepareToLeave(), true, 'Successful save allows exit');
    assert.equal(saveCalls, 2);
    processing = true;
    const beforePrompt = modalOpens;
    assert.equal(await renderer.prepareToLeave(), false, 'Cannot leave during an in-flight answer save');
    assert.equal(modalOpens, beforePrompt);
    processing = false;
    await studyLayoutAndExit();
    await exitDialogDismissal();


    const empty = new Element();
    const emptyContext = { ...context, getCards: () => [], getReturnLabel: () => 'Back to study groups' };
    card.state = 1; card.nextReview = Date.now() + 60000; card.reviews = 1; card.lastReview = Date.now();
    new FlashcardEmptyStateRenderer(emptyContext).render(empty);
    assert.ok(icons.includes('clock'), 'Waiting is distinct from completion');
    assert.equal(empty.children[0].children.find(el => el.tag === 'h3').options.text, 'Waiting for learning cards');
    assert.match(empty.querySelector('.flashcard-session-summary').options.text, /1 card · 2 reviews/);
    empty.children.at(-1).events.click(); assert.equal(returned, 1);
    card.state = 2; card.nextReview = Date.now() - 1000;
    empty.empty(); new FlashcardEmptyStateRenderer(emptyContext).render(empty);
    assert.equal(empty.children[0].children.find(el => el.tag === 'h3').options.text, 'Daily limit reached');
    card.nextReview = Date.now() + 86400000;
    empty.empty(); new FlashcardEmptyStateRenderer(emptyContext).render(empty);
    assert.equal(empty.children[0].children.find(el => el.tag === 'h3').options.text, 'All caught up');
    const progress = new Element();
    new FlashcardProgressManager({ getProgressContainer: () => progress,
        getSessionProgress: () => ({ completed: 0, remaining: 1, total: 1 }) }).updateProgress();
    assert.equal(progress.children[0].options.text, '0 reviewed · 1 ready', 'Current card is not counted before rating');
    const track = progress.children[1];
    assert.equal(track.options.attr.role, 'progressbar');
    assert.equal(track.children[0].css.width, '0%', 'Unrated current card does not advance progress');
    const resumed = new FlashcardProgressManager({ getProgressContainer: () => progress,
        getSessionProgress: () => ({ completed: 1, remaining: 1, total: 2 }) });
    resumed.updateProgress();
    assert.equal(progress.children[1].children[0].css.width, '50%');
    assert.equal(progress.children[1].options.attr['aria-valuenow'], '1');
    console.log('HiCard study passed: explicit reveal, collapsed context, keyboard ratings, editor protection, source tab/location, honest progress and distinct completion states.');
}

async function exitDialogDismissal() {
    class Modal {
        constructor() { this.contentEl = new Element(); this.titleEl = new Element(); }
        open() { this.onOpen(); }
        close() { this.onClose(); }
    }
    const { StudyExitModal } = load('src/flashcard/components/renderers/StudyExitModal.ts', {
        obsidian: { Modal }, '../../../i18n': { t }
    });
    const closed = new StudyExitModal({}); closed.open(); closed.close();
    assert.equal(await closed.result, 'stay', 'Escape and window close keep the draft');
    const save = new StudyExitModal({}); save.open();
    save.contentEl.children[1].children[2].events.click();
    assert.equal(await save.result, 'save', 'Closing after a selection preserves that selection');
}
async function studyLayoutAndExit() {
    let canLeave = true, saves = 0;
    class Component {
        registerEvent() {} registerDomEvent(el, name, cb) { el.addEventListener(name, cb); }
        addChild() {} removeChild() {}
    }
    class Study {
        setProgressContainer() {} setLicenseManager() {} setCurrentGroupId() {} refreshCardList() {}
        setStudyExit(callback) { this.exit = callback; }
        async activate() {} canStudy() { return true; } deactivate() {}
        getRenderer() { return { prepareToLeave: async () => canLeave, render() {} }; }
        saveState() { saves++; }
    }
    class Page { render() {} destroy() {} }
    const { HiCardWorkspace } = load('src/views/hicard/HiCardWorkspace.ts', {
        obsidian: { Component, setIcon() {} }, '../../flashcard': { FlashcardComponent: Study },
        '../../services/LicenseManager': { LicenseManager: class {} }, '../../i18n': { t },
        '../../flashcard/types/FlashcardGroups': { isSystemCardGroup: () => false },
        './pages/HiCardGroupsPage': { HiCardGroupsPage: Page },
        './pages/HiCardCardsPage': { HiCardCardsPage: Page },
        './pages/HiCardAnalyticsPage': { HiCardAnalyticsPage: Page },
        './pages/HiCardSettingsPage': { HiCardSettingsPage: Page },
        './pages/HiCardTodayPage': { HiCardTodayPage: Page }
    });
    const root = new Element();
    const workspace = new HiCardWorkspace(root, {
        fsrsManager: { getAllCards: () => [], getCardGroups: () => [{ id: 'g', name: 'Group' }] },
        eventManager: { on() {} }
    });
    await workspace.open();
    assert.equal(root.querySelector('.hicard-workspace-toolbar-meta'), null, 'Brand header has no card total');
    await workspace.showPage('groups');
    await workspace.showStudyGroup('g');
    assert.equal(root.classes.has('is-studying'), true);
    assert.equal(root.querySelector('.hicard-study-surface').children.length, 2, 'Toolbar and learning content share the study surface');
    assert.equal(workspace.sidebarEl.hidden, true, 'Management navigation is hidden from keyboard and screen readers');
    const exit = root.querySelector('.hicard-study-exit');
    assert.equal(exit.children[1].options.text, 'Exit study', 'Exit is an explicit text action');
    canLeave = false;
    await workspace.showCards();
    assert.equal(workspace.currentPage, 'study', 'Programmatic navigation also respects the draft guard');
    canLeave = true;
    exit.events.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(workspace.currentPage, 'groups', 'Exit returns to the original group page');
    assert.equal(workspace.sidebarEl.hidden, false);
    assert.equal(root.classes.has('is-studying'), false);
    assert.equal(saves, 1, 'Normal exit saves the current position');
    await workspace.showPage('today');
    await workspace.showStudyGroup('g');
    workspace.studyComponent.exit();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(workspace.currentPage, 'today', 'Completion return uses the same exit path');
    workspace.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
