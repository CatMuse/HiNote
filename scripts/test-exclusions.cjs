const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
class TFile {
    constructor(path) {
        this.path = path; this.name = path.split('/').pop(); this.extension = this.name.split('.').pop();
        this.basename = this.name.slice(0, -(this.extension.length + 1)); this.stat = { mtime: 1, size: 1 };
    }
}
class Events {
    constructor(){ this.listeners = new Map(); }
    on(name,callback){const handlers=this.listeners.get(name)||[];handlers.push(callback);this.listeners.set(name,handlers);return {name,callback};}
    trigger(name,...args){(this.listeners.get(name)||[]).forEach(fn=>fn(...args));}
    off(name,fn){this.listeners.set(name,(this.listeners.get(name)||[]).filter(handler=>handler!==fn));}
}
const modules = new Map(), timers = new Map(); let timerId=0;
const windowMock={setTimeout: fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id)};
function load(file,overrides) {
    file=path.resolve(file); if(!overrides && modules.has(file))return modules.get(file);
    const exports={};if(!overrides)modules.set(file,exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
        {exports,console,window:windowMock,activeDocument:{},require:name=>{
            if(overrides)return overrides[name]||{};
            if(name==='obsidian')return {TFile,Events,Plugin:class{},Component:class{},Platform:{isMobile:false},moment:{locale:()=> 'en'}};
            const target=path.resolve(path.dirname(file),name);
            return load(fs.existsSync(target+'.ts')?target+'.ts':path.join(target,'index.ts'));
        }});
    return exports;
}
const {ExcludePatternMatcher}=load('src/services/ExcludePatternMatcher.ts');
const {HighlightIndexer}=load('src/services/highlight/HighlightIndexer.ts');
const {HighlightExtractor}=load('src/services/highlight/HighlightExtractor.ts');
const {GlobalHighlightService}=load('src/services/highlight/GlobalHighlightService.ts');
const {FileListDataSource}=load('src/views/managers/FileListDataSource.ts');
const {HighlightMatcher}=load('src/services/highlight/HighlightMatcher.ts');
const {EventManager}=load('src/services/EventManager.ts');
const {ViewState}=load('src/views/hinote/ViewState.ts');
const {registerHiNoteViewEvents}=load('src/views/hinote/HiNoteViewEventBindings.ts');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function environment() {
    const files=[new TFile('draw/HiNote.xcd.md'),new TFile('notes/normal.md')];
    const settings={excludePatterns:'',useCustomPattern:false,regexRules:[]};
    let reads=0;
    const app={metadataCache:{getFileCache:()=>null},vault:{
        getMarkdownFiles:()=>files,getAbstractFileByPath:path=>files.find(file=>file.path===path)||null,
        read:async()=>{reads++;return '==knowledge==';},on(){return {};},offref(){}
    }};
    const extractor=new HighlightExtractor(app,()=>settings);
    const raw=files.map(file=>({file,highlights:extractor.extractHighlights('==knowledge==',file)}));
    const index=new HighlightIndexer(app,extractor);
    const matcher=new HighlightMatcher();
    const service={
        shouldProcessFile:file=>extractor.shouldProcessFile(file),extractHighlights:(source,file)=>extractor.extractHighlights(source,file),
        getAllHighlightsFromCache:()=>index.getAllHighlightsFromCache(),getAllHighlights:()=>index.getAllHighlights(),
        searchHighlightsFromIndex:term=>index.searchHighlightsFromIndex(term),
        mergeHighlightsWithComments:(highlights,records,file)=>matcher.mergeHighlightsWithComments(highlights,records,file)
    };
    return {files,settings,app,extractor,index,service,raw,reads:()=>reads};
}
async function matchingAndCaches() {
    const env=environment(),{files,settings,index,service,app}=env;
    assert.equal(ExcludePatternMatcher.shouldExclude(files[0],'*.xcd'),false);
    assert.equal(ExcludePatternMatcher.shouldExclude(files[0],'*.xcd.md'),true);
    assert.equal(ExcludePatternMatcher.shouldExclude(new TFile('draw/notxcd.md'),'*.xcd.md'),false,'Suffix must include a dot boundary');
    assert.equal(ExcludePatternMatcher.shouldExclude(files[0],'draw'),true);
    assert.equal(ExcludePatternMatcher.shouldExclude(files[0],'[[HiNote.xcd]]'),true);
    await index.buildFileIndex();
    const list=new FileListDataSource({settings,app},service);
    assert.equal((await list.getFilesWithHighlights()).length,2);
    settings.excludePatterns='*.xcd.md'; // Even before notification, reads must use current rules.
    assert.equal(index.getAllHighlightsFromCache().length,1);
    assert.equal((await index.searchHighlightsFromIndex('knowledge')).length,1);
    assert.equal((await list.getFilesWithHighlights()).length,1);
    assert.equal(list.getTotalHighlightsCount(),1);
    assert.equal(await list.getFileHighlightsCount(files[0]),0);
    // Simulate an older provider handing out unfiltered cached data.
    const staleService={...service,getAllHighlightsFromCache:()=>env.raw.flatMap(group=>group.highlights)};
    const staleList=new FileListDataSource({settings,app},staleService);
    assert.equal((await staleList.getFilesWithHighlights()).length,1);
    assert.equal(staleList.getTotalHighlightsCount(),1);
    const record={id:'old-comment-record',kind:'highlight',filePath:files[0].path,text:'knowledge',position:0,createdAt:1,updatedAt:1,
        comments:[{id:'c',content:'keep this comment',createdAt:1,updatedAt:1}]};
    const serialized=JSON.stringify(record);let storedReads=0;
    const repo={getFileHighlights:async path=>{storedReads++;return path===files[0].path?[record]:[];}};
    const global=new GlobalHighlightService(app,staleService,repo);
    assert.equal((await global.updateAllHighlights()).length,1);
    assert.equal(storedReads,1,'Excluded records should not even be loaded');
    assert.equal((await global.updateAllHighlights('draw','path')).length,0);
    index.invalidateExclusions();await index.buildFileIndex();
    assert.equal(index.getAllHighlightsFromCache().length,1);
    settings.excludePatterns='';index.invalidateExclusions();await index.buildFileIndex();
    assert.equal((await list.getFilesWithHighlights()).length,2);
    const restored=await global.updateAllHighlights();
    assert.equal(restored.length,2);assert.equal(restored.find(item=>item.id===record.id).comments[0].content,'keep this comment');
    assert.equal(JSON.stringify(record),serialized,'Exclusion never rewrites records or comments');
    settings.excludePatterns='*.md';index.invalidateExclusions();await index.buildFileIndex();
    const reads=env.reads();assert.equal(index.getAllHighlightsFromCache().length,0);
    assert.equal((await index.searchHighlightsFromIndex('knowledge')).length,0);assert.equal(env.reads(),reads,'Empty valid index must not keep rebuilding');
    index.destroy();console.log('Exclusions: real suffixes, dot boundary, cached lists/counts/search, removal and comment preservation passed.');
}
async function races() {
    const env=environment();const gate=deferred();let scans=0;
    env.extractor.getAllHighlights=async()=>{scans++;if(scans===1)return gate.promise;return env.raw.filter(group=>env.extractor.shouldProcessFile(group.file));};
    const one=env.index.buildFileIndex(),two=env.index.buildFileIndex();assert.equal(scans,1,'Concurrent readers share one scan');
    env.settings.excludePatterns='*.xcd.md';env.index.invalidateExclusions();gate.resolve(env.raw);
    await Promise.all([one,two]);assert.equal(scans,2);assert.equal(env.index.getAllHighlightsFromCache().length,1);
    const incremental=deferred();env.app.vault.read=()=>incremental.promise;
    const update=env.index.updateFileInIndex(env.files[1]);env.settings.excludePatterns='*.md';env.index.invalidateExclusions();
    incremental.resolve('==late data==');await update;await env.index.buildFileIndex();assert.equal(env.index.getAllHighlightsFromCache().length,0);
    env.index.destroy();
    const disposed=environment(),pending=deferred();disposed.extractor.getAllHighlights=()=>pending.promise;
    const build=disposed.index.buildFileIndex();disposed.index.destroy();pending.resolve(disposed.raw);await build;
    assert.equal(disposed.index.getAllHighlightsFromCache(),null);
    const lists=environment(),listGate=deferred();let groupsRead=0;
    lists.settings.excludePatterns='*.xcd.md';
    const listService={...lists.service,getAllHighlightsFromCache:()=>null,getAllHighlights:async()=>{
        groupsRead++; return groupsRead===1?listGate.promise:lists.raw;
    }};
    const source=new FileListDataSource({settings:lists.settings,app:lists.app},listService);
    const loading=source.getFilesWithHighlights();
    lists.settings.excludePatterns='';source.invalidateCache();source.getTotalHighlightsCount();
    listGate.resolve([lists.raw[1]]);
    assert.equal((await loading).length,2,'An old list scan cannot cache missing files after exclusions are removed');
    lists.index.destroy();
    console.log('Index lifecycle: shared rebuild, rules changing mid-scan, late incremental updates and unload passed.');
}
async function savesAndViews() {
    const {default:Plugin}=load('main.ts',{obsidian:{Plugin:class{}} ,'./src/settings/SettingsMigration':{normalizeSettings:settings=>settings}});
    const events=new EventManager({});let invalidated=0,notified=0;
    events.on('exclusions:changed',()=>notified++);
    let saved={excludePatterns:''};
    const plugin=new Plugin();plugin.settings={excludePatterns:'*.xcd.md'};
    plugin.loadData=async()=>({...saved});plugin.saveData=async settings=>{saved={...settings};};
    plugin.initManager={currentServices:{highlightService:{invalidateExclusions:()=>invalidated++},eventManager:events}};
    await plugin.saveSettings();assert.equal(saved.excludePatterns,'*.xcd.md');assert.equal(invalidated,1);assert.equal(notified,1);
    await plugin.saveSettings();assert.equal(invalidated,1,'Unrelated settings saves must not rebuild the index');
    plugin.settings.excludePatterns='';await plugin.saveSettings();assert.equal(invalidated,2);
    plugin.settings.excludePatterns='*.md';plugin.saveData=async()=>{throw Error('save failed');};
    await assert.rejects(plugin.saveSettings(),/save failed/);assert.equal(invalidated,2);
    const {EventCoordinator}=load('src/views/managers/EventCoordinator.ts',{'obsidian':{TFile},'../../components/highlight':{}});
    let hook;const coordinator=new EventCoordinator({workspace:{on:()=>({})},vault:{on:()=>({})}},
        {register(){},registerEvent(){}},{on:(name,callback)=>{if(name==='exclusions:changed')hook=callback;return {};}});
    let changed=0;coordinator.setCallbacks({onExclusionsChanged:()=>changed++});coordinator.registerAllEvents(()=>null,()=>true);
    hook();assert.equal(changed,1);coordinator.destroy();hook();assert.equal(changed,1);
    timers.clear();let callbacks,refreshes=0,cancels=0,listInvalidations=0;
    const state=new ViewState();state.setPlacement('main');state.navigate({kind:'all'});
    registerHiNoteViewEvents({component:{register(){},registerDomEvent(){}},container:{addEventListener(){},removeEventListener(){}},state,
        eventCoordinator:{setCallbacks:value=>callbacks=value,registerAllEvents(){},registerKeyboardEvents(){}},highlightContainer:{},selectionManager:{},
        fileListManager:{invalidateCache(){listInvalidations++;},updateFileList:async()=>{}},fileListController:{},
        highlightListController:{cancelPending(){cancels++;state.invalidate();},refreshView:async()=>{refreshes++;}},commentController:{},checkViewPosition:async()=>{}});
    const old=state.beginRequest();callbacks.onExclusionsChanged();callbacks.onExclusionsChanged();
    assert.equal(state.isCurrent(old),false);assert.equal(timers.size,1,'Changes coalesce into one view refresh');
    [...timers.values()][0]();timers.clear();await Promise.resolve();assert.equal(refreshes,1);assert.equal(cancels,2);assert.equal(listInvalidations,2);
    state.navigate({kind:'favorites'});const favoritesToken=state.beginRequest();callbacks.onExclusionsChanged();
    [...timers.values()][0]();timers.clear();await Promise.resolve();assert.equal(state.isCurrent(favoritesToken),false);assert.equal(refreshes,2);
    console.log('Settings/views: successful-save notification, debounced refresh, stale request invalidation and favorites scope invalidation passed.');
}
(async()=>{await matchingAndCaches();await races();await savesAndViews();})().catch(error=>{console.error(error);process.exitCode=1;});
