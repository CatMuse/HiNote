const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const now = 1800000000000;
const day = 86400000;
class Clock extends Date { static now() { return now; } }
let network;
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/LicenseManager.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText, {
    exports: exportsObject, Date: Clock,
    require: () => ({ Platform: {}, requestUrl: options => {
        assert.equal(options.throw, false, 'Read business rejection bodies instead of throwing on HTTP status');
        return network(options);
    } })
});
function fixture(age = 8 * day) {
    let data = { 'vault-id': 'vault', 'flashcard-license': {
        key: 'synthetic', token: 'synthetic-token', features: ['flashcard'], vaultId: 'vault', lastVerified: now - age
    } };
    const plugin = { loadData: async () => structuredClone(data), saveData: async value => { data = structuredClone(value); } };
    return { manager: () => new exportsObject.LicenseManager(plugin), data: () => data };
}
(async () => {
    for (const [status, error] of [[404, 'License not found'], [403, 'License expired'], [403, 'Maximum devices reached']]) {
        const f = fixture();
        network = async () => ({ status, json: { error } });
        assert.equal(await f.manager().isActivated(), false);
        assert.equal(f.data()['flashcard-license'].revoked, true);
        network = async () => { throw Error('offline'); };
        assert.equal(await f.manager().isActivated(), false, 'A confirmed rejection survives restart and outage');
    }
    for (const code of ['LICENSE_NOT_FOUND', 'LICENSE_EXPIRED', 'DEVICE_LIMIT_REACHED']) {
        const f = fixture();
        network = async () => ({ status: 200, json: { valid: false, code } });
        assert.equal(await f.manager().isActivated(), false);
        assert.equal(f.data()['flashcard-license'].revoked, true);
    }
    for (const response of [{ status: 503, json: { error: 'Unavailable' } }, { status: 429, json: {} }, { status: 502, json: { valid: false } }]) {
        network = async () => response;
        const f = fixture();
        assert.equal(await f.manager().isActivated(), true);
        assert.equal(f.data()['flashcard-license'].revoked, undefined);
        assert.equal(f.data()['flashcard-license'].lastVerified, now - 8 * day, 'Outage cannot extend grace');
        assert.equal(await fixture(31 * day).manager().isActivated(), false);
    }
    network = async () => { throw Error('network unavailable'); };
    assert.equal(await fixture(30 * day).manager().isActivated(), true);
    assert.equal(await fixture(30 * day + 1).manager().isActivated(), false);
    network = async () => ({ status: 200, json: { valid: true, token: 'renewed', features: ['flashcard'] } });
    const renewed = fixture();
    assert.equal(await renewed.manager().isActivated(), true);
    assert.equal(renewed.data()['flashcard-license'].lastVerified, now);
    assert.equal(renewed.data()['flashcard-license'].token, 'renewed');
    const fresh = fixture();
    assert.equal(await fresh.manager().activateLicense('synthetic'), true);
    assert.equal(fresh.data()['flashcard-license'].token, 'renewed');
    network = async () => ({ status: 403, json: { valid: false } });
    assert.equal(await fixture().manager().activateLicense('synthetic'), false);
    console.log('License tests passed: old/new server rejections, restart persistence, renewal, activation, outages, rate limiting and 30-day grace boundaries.');
})().catch(error => { console.error(error); process.exitCode = 1; });
