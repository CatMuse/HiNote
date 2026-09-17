const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
class TFile { constructor(path) { this.path = path; this.basename = path.split('.')[0]; this.extension = path.split('.').pop(); } }
class Element {
    constructor() { this.classes = new Set(); this.children = []; this.attrs = {}; this.listeners = {}; this.value = ''; this.isConnected = true; this.scrollHeight = 500; this.clientHeight = 100; }
    addClass(...names) { names.forEach(n=>this.classes.add(n)); }
    removeClass(...names) { names.forEach(n=>this.classes.delete(n)); }
    toggleClass(n,on) { on ? this.addClass(n) : this.removeClass(n); }
    empty() { this.children=[]; }
    appendChild(child) { this.children.push(child); return child; }
    createDiv(options={}) { const child=new Element(); if(options.cls) child.addClass(...options.cls.split(' ')); if(options.text) child.text=options.text; this.appendChild(child); return child; }
    createSpan(options) { return this.createDiv(options); }
    createEl(_tag,options={}) { return this.createDiv(options); }
    querySelector() { return this.actions || null; }
    querySelectorAll() { return []; }
    setAttribute(k,v) { this.attrs[k]=v; }
    setText(text) { this.text=text; }
    setCssProps() {}
    remove() { this.isConnected=false; }
    addEventListener(name,handler) { this.listeners[name]=handler; }
    removeEventListener(name,handler) { if(this.listeners[name]===handler) delete this.listeners[name]; }
    contains() { return false; }
    getBoundingClientRect() { return {width:1000}; }
}
const modules = new Map();
const timers = new Map(); let timerId=0;
const fakeWindow = {innerWidth:1000, setTimeout: callback=>{timers.set(++timerId,callback); return timerId;}, clearTimeout:id=>timers.delete(id)};
function load(file, overrides) {
    file=path.resolve(file);
    if(!overrides && modules.has(file)) return modules.get(file);
    const exports={}; if(!overrides) modules.set(file,exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
    {exports,console,window:fakeWindow,activeDocument:{removeEventListener(){},querySelector(){return null;}},require:name=>{
        if(overrides) return overrides[name] || {};
        if(name==='obsidian') return {TFile,Component:class{},Notice:class{},Platform:{isMobile:false}};
        if(/\/i18n$/.test(name)) return {t:s=>s};
        const target=path.resolve(path.dirname(file),name);
        return load(fs.existsSync(target+'.ts')?target+'.ts':path.join(target,'index.ts'));
    }});
    return exports;
}
const {ViewState}=load('src/views/hinote/ViewState.ts');
const {HighlightListController}=load('src/views/highlight/list/HighlightListController.ts');
const {FileListController}=load('src/views/managers/FileListController.ts');
const {SearchService}=load('src/services/search/SearchService.ts');
const {LayoutManager}=load('src/views/layout/LayoutManager.ts');
const {InfiniteScrollManager}=load('src/views/highlight/list/InfiniteScrollManager.ts');
const {SearchUIManager}=load('src/views/managers/SearchUIManager.ts');
const deferred=()=>{let resolve,reject; const promise=new Promise((r,j)=>{resolve=r;reject=j;}); return {promise,resolve,reject};};
const A=new TFile('A.md'), B=new TFile('B.md');
const row=(text)=>({text,position:0,comments:[]});
function harness(loadFile=async()=>[],loadAll=async()=>[]) {
    const state=new ViewState(); state.setPlacement('main'); state.navigate(ViewState.filePage(A));
    const input=new Element(),container=new Element(),loading=new Element();
    const search=new SearchService({fsrsManager:{findCardsBySourceId:()=>[]}});
    const ui={filterHighlightsByTerm:(term,type)=>search.filterHighlights(state.highlights,term,type,state.search.scope==='vault'?null:state.currentFile),cancelScheduledSearch(){}};
    const env={state,input,container,loading,rendered:[],surface:'highlights',reads:0,vaultReads:0};
    const flashcard={getFlashcardMarkers:()=>new Set(),updateFlashcardMarkers(){},exitFlashcardMode(){},activateFlashcardMode:async()=>{env.surface='hicard';}};
    const controller=new HighlightListController({state,app:{},highlightContainer:container,loadingIndicator:loading,getSearchInput:()=>input,
        getSearchUIManager:()=>ui,getHighlightRenderManager:()=>({clear(){}}),getFlashcardViewManager:()=>flashcard,getInfiniteScrollManager:()=>null,
        getGlobalHighlightService:()=>({updateAllHighlights:()=>{env.vaultReads++;return loadAll();}}),
        getHighlightDataService:()=>({loadFileHighlights:f=>{env.reads++;return loadFile(f);}}),getVirtualHighlightManager:()=>null,
        getCanvasProcessor:()=>({processCanvasFile:loadFile}),getSelectionManager:()=>({clearSelection(){}})});
    controller.renderHighlights=rows=>{env.rendered=rows;env.surface='highlights';};
    const files=new FileListController({state,fileListManager:{updateFileListSelection(){}},flashcardViewManager:flashcard,
        highlightListController:controller,highlightContainer:container,searchContainer:new Element(),licenseManager:{},updateViewLayout:async()=>{}});
    return Object.assign(env,{controller,files});
}
async function races() {
    for(const first of ['A','B']) {
        const a=deferred(),b=deferred(); const env=harness(f=>f===A?a.promise:b.promise);
        const old=env.controller.updateHighlights(); const next=env.files.navigate(ViewState.filePage(B));
        await Promise.resolve();
        if(first==='B'){b.resolve([row('B')]);await next;a.resolve([row('A')]);}
        else {a.resolve([row('A')]);await old;b.resolve([row('B')]);}
        await Promise.all([old,next]); assert.equal(env.state.currentFile,B); assert.equal(env.rendered[0].text,'B');
    }
    const searchGate=deferred(), env=harness(async()=>[row('B')],()=>searchGate.promise);
    env.input.value='all: anything'; const searching=env.controller.handleSearch('anything','all');
    assert.equal(env.state.currentFile,A,'Searching must not change the selected page');
    env.input.value=''; const next=env.files.navigate(ViewState.filePage(B)); await next;
    searchGate.resolve([row('late all')]);await searching;
    assert.equal(env.state.currentFile,B);assert.equal(env.rendered[0].text,'B');
    const gate=deferred(),hi=harness(()=>gate.promise);const pending=hi.controller.updateHighlights();
    await hi.files.navigate({kind:'hicard'});gate.resolve([row('old file')]);await pending;
    assert.equal(hi.surface,'hicard');assert.equal(hi.state.isFlashcardMode,true);
    for(const fail of [false,true]) {
        const gate=deferred(),closed=harness(()=>gate.promise);const pending=closed.controller.updateHighlights();closed.state.dispose();
        if(fail) gate.reject(Error('late error')); else gate.resolve([row('old')]);
        await pending;assert.equal(closed.rendered.length,0);assert.equal(closed.container.children.length,1);
    }
    const canvasGate=deferred(),canvas=harness(f=>f.extension==='canvas'?canvasGate.promise:Promise.resolve([row('B')]));
    const canvasing=canvas.files.navigate(ViewState.filePage(new TFile('map.canvas')));await Promise.resolve();
    await canvas.files.navigate(ViewState.filePage(B));canvasGate.resolve([row('old canvas')]);await canvasing;
    assert.equal(canvas.rendered[0].text,'B');
    console.log('Navigation: file ordering, global search, HiCard, Canvas and closed-view late results passed.');
}
async function queries() {
    const rows=[{...row('annotated'),comments:[{content:'note'}]},row('plain')];const env=harness(async()=>rows,async()=>rows);
    env.input.value='comment:';await env.controller.handleSearch('','comment');assert.equal(env.rendered.length,1);
    await env.controller.updateHighlights();assert.equal(env.rendered.length,1);
    await env.files.navigate(ViewState.filePage(B));assert.equal(env.rendered.length,1);
    const reads=env.reads; env.input.value='plain';await env.controller.handleSearch('plain','');assert.equal(env.reads,reads);assert.equal(env.rendered[0].text,'plain');
    env.state.highlights[1].comments=[{content:'fresh'}];env.input.value='comment:';await env.controller.handleSearch('','comment');assert.equal(env.rendered.length,2,'Filtering must retain local comment edits');
    env.input.value='all: plain';await env.controller.handleSearch('plain','all');assert.equal(env.state.currentFile,B);assert.equal(env.rendered.length,1);
    const vaultReads=env.vaultReads;env.input.value='all: annotated';await env.controller.handleSearch('annotated','all');assert.equal(env.vaultReads,vaultReads,'Typing must reuse loaded scope');
    env.input.value='';await env.controller.handleSearch('','');assert.equal(env.state.currentFile,B);assert.equal(env.rendered.length,2);
    await env.files.navigate({kind:'all'});assert.equal(env.state.isInAllHighlightsView(),true);
    await env.files.navigate({kind:'empty'});assert.equal(env.state.isInAllHighlightsView(),false);assert.equal(env.rendered.length,0);
    console.log('Search: one prefix parser, refresh/navigation, scope clearing, local mutations and cache reuse passed.');
}
async function layoutAndLifetime() {
    const state=new ViewState();state.setPlacement('main');state.navigate(ViewState.filePage(A));
    const root=new Element();root.children=[new Element(),new Element()];const nav=new Element(),content=new Element(),search=new Element();search.actions=new Element();
    const layout=new LayoutManager(root,nav,content,search,state);
    const token=state.beginRequest();state.setViewport(false,true);await layout.updateViewLayout();
    assert.ok(nav.classes.has('highlight-display-none'));assert.ok(!content.classes.has('highlight-display-none'));
    state.setNavigationOpen(true);await layout.updateViewLayout();assert.ok(!nav.classes.has('highlight-display-none'));assert.ok(content.classes.has('highlight-display-none'));
    assert.equal(state.currentFile,A);assert.ok(state.isCurrent(token),'Resizing/navigation drawer must not invalidate content');
    state.setViewport(false,false);await layout.updateViewLayout();assert.ok(!nav.classes.has('highlight-display-none'));assert.ok(!content.classes.has('highlight-display-none'));
    state.setSearch('all:');await layout.updateViewLayout();assert.ok(search.actions.classes.has('highlight-display-none'));
    state.drafts.set('draft','keep');const session=state.snapshot();const restored=new ViewState();restored.restore(session);
    assert.equal(restored.search.raw,'all:');assert.equal(restored.drafts.get('draft'),'keep');
    const scroll=new InfiniteScrollManager(new Element());scroll.setLoadingIndicator(new Element());const gate=deferred();
    const old=scroll.loadMoreHighlights([row('old')],()=>gate.promise,false);
    scroll.reset();await scroll.loadMoreHighlights([row('new')],async()=>{},false);
    gate.resolve();await old;assert.equal(scroll.getCurrentBatch(),1,'Old pagination must not advance the new page');
    let invoked=false;await scroll.loadMoreHighlights([row('stale')],async()=>{invoked=true;},true,()=>false);assert.equal(invoked,false);
    scroll.destroy();
    console.log('Presentation/lifetime: desktop narrow navigation, scope actions, sessions and pagination reset passed.');
}
async function debounceAndLicense() {
    timers.clear();const state=new ViewState(),input=new Element(),indicator=new Element();
    const search=new SearchUIManager({},input,indicator,state);let calls=0;const gate=deferred();
    search.setCallbacks(async()=>{calls++;await gate.promise;},()=>[],()=>null);search.initialize();
    const old=state.beginRequest();input.value='all: query';input.listeners.input();assert.equal(state.isCurrent(old),false);
    [...timers.values()][0]();timers.clear();assert.equal(calls,1);
    search.cancelScheduledSearch();gate.resolve();await Promise.resolve();assert.ok(indicator.classes.has('highlight-display-none'));
    input.value='new';input.listeners.input();search.destroy();assert.equal(timers.size,0);assert.equal(input.listeners.input,undefined);
    const {FlashcardComponent}=load('src/flashcard/components/FlashcardComponent.ts',{obsidian:{Component:class{}}});
    const license=deferred();let renders=0;const fake={isActive:false,activationVersion:0,licenseManager:{isActivated:()=>license.promise,isFeatureEnabled:async()=>true},
        operations:{refreshCardList(){}},renderer:{render(){renders++;},renderActivation(){renders++;}}};
    let current=true;const activating=FlashcardComponent.prototype.activate.call(fake,()=>current);
    current=false;fake.isActive=false;license.resolve(true);await activating;assert.equal(renders,0);
    console.log('Async UI: immediate debounce invalidation, listener cleanup and late HiCard authorization passed.');
}
async function commentSources() {
    const {CommentService}=load('src/services/comment/CommentService.ts');
    const env=harness();
    const service=new CommentService({vault:{getAbstractFileByPath:path=>path===A.path?A:null}}, {}, {
        addHighlight:async(file,highlight)=>{assert.equal(file,A);assert.equal(highlight.filePath,A.path);}
    });
    service.updateState({currentFile:B,highlights:[]});
    const fromA={...row('A result'),id:'A-id',filePath:A.path};
    await service.addComment(fromA,'reply after switching to B');
    assert.equal(fromA.comments.length,1);
    let written=false;
    const missing=new CommentService({vault:{getAbstractFileByPath:()=>null}}, {}, {addHighlight:async()=>{written=true;}});
    missing.updateState({currentFile:B,highlights:[]});
    await missing.addComment({...row('removed result'),filePath:A.path},'must not go to B');
    assert.equal(written,false);
    console.log('Comment source: global results/late replies keep their origin; missing files never fall back to another note.');
}
async function drafts() {
    const inputs=[];class Input {
        constructor(_card,_highlight,_comment,_plugin,options){this.options=options;this.text=options.initialContent||'';inputs.push(this);}
        show(){this.options.onShown?.();}getDraft(){return this.text;}suspend(){this.options.onClosed?.();}
    }
    const {CommentInputManager}=load('src/views/highlight/comments/CommentInputManager.ts',{'../../../components/comment':{CommentInput:Input},
        '../../../components/highlight':{defaultHighlightCardRegistry:{findByElement:()=>null}}});
    const drafts=new Map();const manager=new CommentInputManager({},drafts);manager.setCallbacks({onCommentSave:async()=>{}});
    const highlight={id:'saved',filePath:'A.md',text:'text',position:0};manager.showCommentInput(new Element(),highlight);inputs[0].text='unsaved words';
    manager.suspendAll();assert.equal(drafts.size,1);manager.showCommentInput(new Element(),highlight);assert.equal(inputs[1].text,'unsaved words');
    inputs[1].text='edited before saving';
    await inputs[1].options.onSave('edited before saving');assert.equal(drafts.size,0,'Saving an edited restored draft must clear the old draft too');
    inputs[1].text='next draft';manager.clearEditingState();assert.equal(drafts.size,1);
    console.log('Drafts: navigation suspension, reopening, successful save and disposal capture passed.');
}
(async()=>{await races();await queries();await layoutAndLifetime();await debounceAndLicense();await commentSources();await drafts();})().catch(error=>{console.error(error);process.exitCode=1;});
