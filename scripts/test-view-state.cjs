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
    createDiv(options={}) { const child=new Element(); if(options.cls) child.addClass(...options.cls.split(' ')); if(options.text) child.text=options.text; if(options.attr) Object.assign(child.attrs,options.attr); this.appendChild(child); return child; }
    createSpan(options) { return this.createDiv(options); }
    createEl(_tag,options={}) { return this.createDiv(options); }
    querySelector() { return this.actions || null; }
    querySelectorAll() { return []; }
    setAttribute(k,v) { this.attrs[k]=v; }
    removeAttribute(k) { delete this.attrs[k]; }
    setText(text) { this.text=text; }
    setCssProps() {}
    focus() { this.focused=true; }
    blur() { this.focused=false; }
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
    {exports,console,window:fakeWindow,createFragment:()=>new Element(),activeDocument:{removeEventListener(){},querySelector(){return null;}},require:name=>{
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
function harness(loadFile=async()=>[],loadAll=async()=>[],loadFavorites=async()=>[]) {
    const state=new ViewState(); state.setPlacement('main'); state.navigate(ViewState.filePage(A));
    const input=new Element(),container=new Element(),loading=new Element();
    const search=new SearchService({fsrsManager:{findCardsBySourceId:()=>[]}});
    const ui={filterHighlightsByTerm:term=>search.filterHighlights(state.highlights,term,state.cardType,state.currentFile),cancelScheduledSearch(){}};
    const env={state,input,container,loading,rendered:[],surface:'highlights',reads:0,vaultReads:0,clears:0,patches:0,selectionsCleared:0};
    const flashcard={getFlashcardMarkers:()=>new Set(),updateFlashcardMarkers(){}};
    const controller=new HighlightListController({state,app:{},highlightContainer:container,loadingIndicator:loading,getSearchInput:()=>input,
        getSearchUIManager:()=>ui,getHighlightRenderManager:()=>({clear(){env.clears++;},refreshCardMetadata(){env.patches++;}}),getHighlightFlashcardMarkers:()=>flashcard,getInfiniteScrollManager:()=>env.scroll||null,
        getGlobalHighlightService:()=>({updateAllHighlights:()=>{env.vaultReads++;return loadAll();}}),
        getHighlightDataService:()=>({loadFavoriteHighlights:loadFavorites,loadFileHighlights:f=>{env.reads++;return loadFile(f);}}),
        getCanvasProcessor:()=>({processCanvasFile:loadFile}),getSelectionManager:()=>({clearSelection(){env.selectionsCleared++;}})});
    controller.renderHighlights=rows=>{env.rendered=rows;env.surface='highlights';};
    const files=new FileListController({state,fileListManager:{updateFileListSelection(){}},
        highlightListController:controller,highlightContainer:container,updateViewLayout:async()=>{}});
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
    const openingAll=env.files.navigate({kind:'all'});await Promise.resolve();
    env.input.value='anything'; const searching=env.controller.handleSearch('anything');
    assert.equal(env.state.page.kind,'all','Searching must not change the selected page');
    env.input.value=''; const next=env.files.navigate(ViewState.filePage(B)); await next;
    searchGate.resolve([row('late all')]);await Promise.all([openingAll,searching]);
    assert.equal(env.state.currentFile,B);assert.equal(env.rendered[0].text,'B');
    const gate=deferred(),hi=harness(()=>gate.promise);const pending=hi.controller.updateHighlights();
    await hi.files.navigate({kind:'all'});gate.resolve([row('old file')]);await pending;
    assert.equal(hi.state.page.kind,'all');assert.equal(hi.rendered.length,0);
    for(const fail of [false,true]) {
        const gate=deferred(),closed=harness(()=>gate.promise);const pending=closed.controller.updateHighlights();closed.state.dispose();
        if(fail) gate.reject(Error('late error')); else gate.resolve([row('old')]);
        await pending;assert.equal(closed.rendered.length,0);assert.equal(closed.container.children.length,1);
    }
    const canvasGate=deferred(),canvas=harness(f=>f.extension==='canvas'?canvasGate.promise:Promise.resolve([row('B')]));
    const canvasing=canvas.files.navigate(ViewState.filePage(new TFile('map.canvas')));await Promise.resolve();
    await canvas.files.navigate(ViewState.filePage(B));canvasGate.resolve([row('old canvas')]);await canvasing;
    assert.equal(canvas.rendered[0].text,'B');
    console.log('Navigation: file ordering, global search, all highlights, Canvas and closed-view late results passed.');
}
async function queries() {
    const rows=[{...row('annotated'),comments:[{content:'note'}]},row('plain')];const env=harness(async()=>rows,async()=>rows);
    env.state.setCardType('comment');await env.controller.updateHighlights();assert.equal(env.rendered.length,1);
    await env.controller.updateHighlights();assert.equal(env.rendered.length,1);
    await env.files.navigate(ViewState.filePage(B));assert.equal(env.rendered.length,1);
    const reads=env.reads; env.state.setCardType('all');env.input.value='plain';await env.controller.handleSearch('plain');assert.equal(env.reads,reads);assert.equal(env.rendered[0].text,'plain');
    env.state.highlights[1].comments=[{content:'fresh'}];env.state.setCardType('comment');env.input.value='';env.controller.renderWithCurrentSearch();assert.equal(env.rendered.length,2,'Filtering must retain local comment edits');
    env.state.setCardType('all');env.input.value='plain';await env.files.navigate({kind:'all'});assert.equal(env.state.currentFile,null);assert.equal(env.rendered.length,1);
    const vaultReads=env.vaultReads;env.input.value='annotated';await env.controller.handleSearch('annotated');assert.equal(env.vaultReads,vaultReads,'Typing must reuse loaded scope');
    env.input.value='';await env.controller.handleSearch('');assert.equal(env.state.currentFile,null);assert.equal(env.rendered.length,2);
    assert.equal(env.state.isInAllHighlightsView(),true);
    await env.files.navigate({kind:'empty'});assert.equal(env.state.isInAllHighlightsView(),false);assert.equal(env.rendered.length,0);
    const ordered=harness(async()=>[
        {...row('first in source'),position:10,updatedAt:100},
        {...row('last updated'),position:20,updatedAt:300},
        {...row('middle updated'),position:30,updatedAt:200}
    ]);
    await ordered.controller.updateHighlights();assert.equal(ordered.rendered[0].text,'first in source');
    ordered.state.setSort('updated-desc');ordered.controller.renderWithCurrentSearch();assert.equal(ordered.rendered[0].text,'last updated');
    ordered.state.setSort('updated-asc');ordered.controller.renderWithCurrentSearch();assert.equal(ordered.rendered[0].text,'first in source');
    const fileComment={...row('document note'),kind:'file-comment'};
    const commentRows=harness(async()=>[fileComment,row('plain')]);commentRows.state.setCardType('comment');
    await commentRows.controller.updateHighlights();assert.equal(commentRows.rendered[0].kind,'file-comment');
    console.log('Search/filter: plain text, explicit scope/type, local mutations and cache reuse passed.');
}
async function layoutAndLifetime() {
    const state=new ViewState();state.setPlacement('main');state.navigate(ViewState.filePage(A));
    const root=new Element();root.children=[new Element(),new Element()];const nav=new Element(),content=new Element(),search=new Element();search.actions=new Element();
    const layout=new LayoutManager(root,nav,content,state);
    const token=state.beginRequest();state.setViewport(false,true);await layout.updateViewLayout();
    assert.ok(nav.classes.has('highlight-display-none'));assert.ok(!content.classes.has('highlight-display-none'));
    state.setNavigationOpen(true);await layout.updateViewLayout();assert.ok(!nav.classes.has('highlight-display-none'));assert.ok(content.classes.has('highlight-display-none'));
    assert.equal(state.currentFile,A);assert.ok(state.isCurrent(token),'Resizing/navigation drawer must not invalidate content');
    state.setViewport(false,false);await layout.updateViewLayout();assert.ok(!nav.classes.has('highlight-display-none'));assert.ok(!content.classes.has('highlight-display-none'));
    state.drafts.set('draft','keep');const session=state.snapshot();const restored=new ViewState();restored.restore(session);
    assert.equal(restored.search.raw,'');assert.equal(restored.cardType,'all');assert.equal(restored.sort,'position');assert.equal(restored.commentsVisible,true);assert.equal(restored.drafts.get('draft'),'keep');
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
    const searchComponent={inputEl:input,onChange(callback){this.callback=callback;return this;}};
    const search=new SearchUIManager({},searchComponent,indicator,state);let calls=0;const gate=deferred();
    search.setCallbacks(async()=>{calls++;await gate.promise;},()=>[],()=>null);search.initialize();
    const old=state.beginRequest();input.value='query';searchComponent.callback();assert.equal(state.isCurrent(old),false);
    [...timers.values()][0]();timers.clear();assert.equal(calls,1);
    search.cancelScheduledSearch();gate.resolve();await Promise.resolve();assert.ok(indicator.classes.has('highlight-display-none'));
    input.value='new';searchComponent.callback();search.destroy();assert.equal(timers.size,0);
    searchComponent.callback();assert.equal(timers.size,0,'Native search callbacks become inert after disposal');
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
async function metadataRefresh() {
    let rows = [
        {...row('same'), filePath:'A.md', id:'scan-0', backgroundColor:'yellow'},
        {...row('same'), filePath:'A.md', id:'scan-10', position:10, backgroundColor:'yellow'}
    ];
    const env = harness(async()=>rows);
    await env.controller.refreshView();
    const references = env.state.highlights.slice();
    const clears = env.clears, selections = env.selectionsCleared;
    const surface = env.rendered;
    let batch = 3, reboundRows, reboundCurrent;
    env.scroll = {
        getCurrentBatch:()=>batch, reset:()=>{batch=0;}, setCurrentBatch:value=>{batch=value;},
        setupInfiniteScroll:(items,_render,current)=>{reboundRows=items;reboundCurrent=current;}
    };
    rows = rows.map((item,i)=>({...item, id:`new-${i}`,position:item.position+2,
        originalLength:12, backgroundColor:i?'blue':'yellow'}));
    await env.controller.refreshView(true,false,true);
    assert.equal(env.patches,1);
    assert.equal(batch,3,'Keep the loaded pagination batch');
    reboundRows.forEach((item,i)=>assert.equal(item,env.state.highlights[i]));
    assert.equal(reboundCurrent(),true,'Pagination must use the renewed request lifetime');
    env.scroll=null;
    assert.equal(env.clears,clears,'Color refresh must not empty the list or show a loading screen');
    assert.equal(env.selectionsCleared,selections,'Selection and input state must stay intact');
    assert.equal(env.rendered,surface,'The rendered rows must retain their identity');
    references.forEach((item,i)=>assert.equal(env.state.highlights[i],item));
    assert.equal(references[1].backgroundColor,'blue');
    assert.equal(references[1].position,12,'Other cards receive shifted source offsets too');
    rows = [rows[0], {...rows[1],text:'edited body'}];
    await env.controller.refreshView(true,false,true);
    assert.equal(env.patches,1,'Body changes must fall back to rendering');
    assert.equal(env.rendered[1].text,'edited body');
    env.input.value='edited';
    await env.controller.refreshView(true,false,true);
    assert.equal(env.patches,1,'A changed search must not retain the previous visible subset');
    assert.equal(env.rendered.length,1);
    rows=[];
    await env.controller.refreshView(true,false,true);
    assert.equal(env.rendered.length,0,'Removed highlights must disappear');
    const {refreshHighlightMetadata}=load('src/views/highlight/list/HighlightMetadataRefresh.ts');
    const old=[{...row('first'),backgroundColor:'yellow'},row('second')];
    assert.equal(refreshHighlightMetadata(old,[{...old[0],backgroundColor:'blue'},row('different')]),false);
    assert.equal(old[0].backgroundColor,'yellow','A mismatch must not partially mutate earlier cards');
    console.log('Metadata refresh: stable cards/selection, duplicate offsets, content/search/removal fallback passed.');
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
async function favoriteButtons() {
    class Component {
        constructor(){this.subscriptions=[];}
        register(fn){this.subscriptions.push(fn);}
        registerDomEvent(el,name,fn){el.addEventListener(name,fn);this.register(()=>el.removeEventListener(name,fn));}
        unload(){this.subscriptions.forEach(fn=>fn());this.subscriptions=[];}
    }
    const notices=[];
    class Notice {constructor(content){this.content=content;notices.push(this);} hide(){this.hidden=true;}}
    const dependencies={'obsidian':{Component,Notice,setIcon(){}},'../../../i18n':{t:s=>s},'../../i18n':{t:s=>s}};
    const {HighlightFavoriteController}=load('src/components/highlight/card/FavoriteController.ts',dependencies);
    const gate=deferred(); let calls=0; const highlight={text:'saved',id:'record',filePath:'A.md'};
    const plugin={addChild(c){return c;},removeChild(c){c.unload();},highlightManager:{async setFavorite(row,favorite,time=100){calls++;await gate.promise;row.favoritedAt=favorite?time:undefined;}}};
    const controller=new HighlightFavoriteController(plugin,()=>highlight,()=>{});
    const container=new Element();controller.bind(container);const button=container.children[0];
    assert.equal(button.attrs['aria-pressed'],'false');
    const first=controller.toggle();const duplicate=controller.toggle();
    assert.equal(calls,1,'Repeated clicks cannot enqueue duplicate pending writes');assert.equal(button.disabled,true);
    gate.resolve();await Promise.all([first,duplicate]);
    assert.equal(button.attrs['aria-pressed'],'true');assert.equal(button.attrs['aria-label'],'Remove from favorites');
    await controller.toggle();assert.equal(button.attrs['aria-pressed'],'false');
    assert.equal(highlight.favoritedAt,undefined);
    assert.equal(notices.length,0,'Successful favorite changes must stay silent');
    controller.unload();assert.equal(button.listeners.click,undefined);
    const {BatchFavoriteOperations}=load('src/views/selection/BatchFavoriteOperations.ts',dependencies);
    const rows=new Set([{id:'one',favoritedAt:100},{id:'two'}]);let cleared=0;
    const batch=new BatchFavoriteOperations(plugin,()=>rows,()=>cleared++);batch.onload();
    const toolbar=new Element();batch.addButton(toolbar);const add=toolbar.children[0];
    assert.equal(add.attrs['aria-label'],'Add to favorites');await batch.run(true,add);
    assert.ok([...rows].every(row=>row.favoritedAt));assert.equal(cleared,1);
    batch.addButton(toolbar);const remove=toolbar.children[1];
    assert.equal(remove.attrs['aria-label'],'Remove from favorites');await batch.run(false,remove);
    assert.ok([...rows].every(row=>!row.favoritedAt));batch.unload();assert.equal(remove.listeners.click,undefined);
    console.log('Favorite controls: accessible state, pending-click guard, silent removal, mixed batch actions and listener cleanup passed.');
}
async function toolbarFileComment() {
    class Component {
        register() {}
        registerDomEvent(element,name,handler) { element.addEventListener(name,handler); }
    }
    let lastMenu;
    class MenuItem {
        setTitle(title) { this.title=title;return this; }
        setIcon(icon) { this.icon=icon;return this; }
        setChecked(checked) { this.checked=checked;return this; }
        setDisabled(disabled) { this.disabled=disabled;return this; }
        onClick(click) { this.click=click;return this; }
    }
    class Menu {
        constructor() { this.items=[];lastMenu=this; }
        addItem(configure) { const item=new MenuItem();configure(item);this.items.push(item);return this; }
        addSeparator() { this.items.push({separator:true});return this; }
        showAtMouseEvent() {}
    }
    class ExtraButtonComponent {
        constructor(container) { this.extraSettingsEl=new Element();container.appendChild(this.extraSettingsEl); }
        setIcon(icon) { this.icon=icon;return this; }
        setTooltip(tooltip) { this.tooltip=tooltip;return this; }
        setDisabled(disabled) { this.disabled=disabled;return this; }
    }
    const {HighlightToolbar}=load('src/views/hinote/HighlightToolbar.ts',{
        obsidian:{Component,ExtraButtonComponent,Menu},'../../i18n':{t:value=>value}
    });
    let notifyToolbar;
    const state={page:{kind:'file'},placement:'sidebar',search:{term:''},cardType:'all',sort:'position',commentsVisible:true,
        subscribe(listener){notifyToolbar=listener;return ()=>{};},setCommentsVisible(){}};
    const toolbar=new Element(),toolbarTitle=new Element(),searchField=new Element(),searchInput=new Element(),actions=new Element(),highlights=new Element();
    searchField.addClass('highlight-display-none');
    let opened=0,refreshed=0,currentSelections=0,allSelections=0;
    new HighlightToolbar(new Component(),state,{toolbar,toolbarTitle,searchField,searchInput,actions},{
        onCurrentDocument:async()=>{currentSelections++;},onAllDocuments:async()=>{allSelections++;},onAddFileComment:()=>opened++,onViewOptionsChanged(){},onRefresh:async()=>{refreshed++;},onExport:async()=>{}
    });
    toolbarTitle.listeners.click({});
    assert.equal(refreshed,1,'The main-view HINOTE title remains a refresh action');
    actions.children[0].listeners.click({});
    assert.equal(searchField.classes.has('highlight-display-none'),false);
    assert.equal(actions.classes.has('highlight-display-none'),false,'Opening search keeps the toolbar row visible');
    assert.equal(searchInput.focused,true);
    actions.children[0].listeners.click({});
    assert.equal(searchField.classes.has('highlight-display-none'),true);
    assert.equal(actions.classes.has('highlight-display-none'),false);
    let prevented=false,stopped=false;
    actions.children[1].listeners.click({preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
    assert.equal(opened,1);assert.equal(prevented,true);assert.equal(stopped,true,
        'The toolbar click must not reach the newly installed outside-click handler');
    state.page={kind:'all'};notifyToolbar();
    assert.equal(actions.children[1].classes.has('highlight-display-none'),true,'All highlights hides document-note action');
    assert.equal(actions.children[3].classes.has('highlight-display-none'),true,'All highlights hides sorting');
    assert.equal(actions.children[4].classes.has('highlight-display-none'),true,'All highlights hides document export');
    assert.equal(actions.children[0].classes.has('highlight-display-none'),false,'All highlights keeps search visible');
    assert.equal(actions.children[2].classes.has('highlight-display-none'),false,'All highlights keeps filtering visible');
    state.page={kind:'favorites'};notifyToolbar();
    assert.equal(actions.children[1].classes.has('highlight-display-none'),true,'Favorites hides document-note action');
    assert.equal(actions.children[3].classes.has('highlight-display-none'),true,'Favorites hides sorting');
    assert.equal(actions.children[4].classes.has('highlight-display-none'),true,'Favorites hides document export');
    assert.equal(actions.children[0].classes.has('highlight-display-none'),false,'Favorites keeps search visible');
    assert.equal(actions.children[2].classes.has('highlight-display-none'),false,'Favorites keeps filtering visible');
    state.page={kind:'file'};notifyToolbar();
    assert.equal(actions.children[1].classes.has('highlight-display-none'),false,'Document view restores document-note action');
    assert.equal(actions.children[3].classes.has('highlight-display-none'),false,'Document view restores sorting');
    assert.equal(actions.children[4].classes.has('highlight-display-none'),false,'Document view restores export');
    actions.children[2].listeners.click({});
    assert.equal(lastMenu.items[1].disabled,false,'Sidebar document scope can switch to all documents');
    lastMenu.items[1].click();assert.equal(allSelections,1);
    state.page={kind:'all'};notifyToolbar();actions.children[2].listeners.click({});
    assert.equal(lastMenu.items[0].disabled,false,'Sidebar all-documents scope can return to the active document');
    lastMenu.items[0].click();assert.equal(currentSelections,1);
    state.placement='main';state.page={kind:'file'};notifyToolbar();actions.children[2].listeners.click({});
    assert.equal(lastMenu.items[1].disabled,true,'Main document scope stays locked to its file');
    assert.equal(actions.children[0].attrs['aria-label'],undefined,'Main-view text actions do not keep redundant hover tooltips');
    assert.ok(actions.children[0].children.some(child=>child.text==='Toolbar Search'),'Main-view actions expose their short text label');
    state.page={kind:'all'};notifyToolbar();actions.children[2].listeners.click({});
    assert.equal(lastMenu.items[0].disabled,true,'Main all-documents scope stays locked to the collection');
    console.log('Toolbar: document-note input and sidebar scope round-trip passed.');
}
async function paginationRerender() {
    const rows=[row('first'),row('second')];
    const env=harness(async()=>rows);
    let resets=0;
    env.scroll={
        batch:0,
        reset(){resets++;this.batch=0;},
        getCurrentBatch(){return this.batch;},
        setCurrentBatch(batch){this.batch=batch;},
        async loadMoreHighlights(all,render,append=false){await render(all.slice(0,20),append);this.batch++;},
        async loadUntilScrollable(){},
        setupInfiniteScroll(){}
    };
    await env.controller.refreshView();
    const initialResets=resets;
    await env.controller.renderWithCurrentSearch();
    assert.ok(resets>initialResets,'A local rerender resets the old infinite-scroll generation');
    assert.equal(env.rendered.map(item=>item.text).join(','),'first,second');
    console.log('Pagination rerender: old sentinels cannot append the first page twice.');
}
async function favoritesNavigation() {
    let reads = 0;
    const env = harness(async()=>[row('file')], async()=>[row('unfavorited')], async()=>{
        reads++; return [{...row('saved'), id:'saved', recordId:'saved', favoritedAt:100}, {...row('other'), id:'other', recordId:'other', favoritedAt:50}];
    });
    await env.files.getCallbacks().onFavoritesSelect();
    assert.equal(env.state.page.kind, 'favorites');
    assert.equal(env.state.currentFile, null);
    assert.equal(env.rendered.length, 2);
    env.input.value = 'saved';
    await env.controller.handleSearch('saved');
    assert.equal(env.vaultReads, 0, 'Searching stays within the selected favorites page');
    assert.equal(reads, 1, 'Typing in favorites reuses its loaded scope');
    assert.equal(env.rendered[0].text, 'saved');
    env.input.value = 'not found';
    await env.controller.handleSearch('not found','');
    assert.equal(env.container.children[0].text, 'No matching favorites.');
    env.input.value = '';
    await env.controller.handleSearch('', '');
    const restored = new ViewState(); restored.restore(env.state.snapshot());
    assert.equal(restored.page.kind, 'favorites');
    await env.files.navigate({kind:'all'});
    assert.equal(env.rendered[0].text, 'unfavorited');
    const gate = deferred();
    const racing = harness(async()=>[row('file')],async()=>[],()=>gate.promise);
    const pending = racing.files.navigate({kind:'favorites'}); await Promise.resolve();
    await racing.files.navigate(ViewState.filePage(B));
    gate.resolve([row('late favorite')]); await pending;
    assert.equal(racing.rendered[0].text, 'file');
    console.log('Favorites navigation: dedicated scope, filtered/empty states, session restore and late response isolation passed.');
}
(async()=>{await toolbarFileComment();await paginationRerender();await favoriteButtons();await favoritesNavigation();await races();await queries();await layoutAndLifetime();await debounceAndLicense();await commentSources();await drafts();await metadataRefresh();})().catch(error=>{console.error(error);process.exitCode=1;});
