const assert = require('node:assert/strict');
const fs = require('node:fs');

function validateReleaseMetadata(tag, manifest, versions, pkg, lock) {
    assert.match(tag || '', /^\d+\.\d+\.\d+$/, 'Release tag must be a plain semantic version');
    assert.equal(manifest.version, tag, 'Release tag must match manifest.version');
    assert.equal(pkg.version, tag, 'Package version must match release tag');
    assert.equal(lock.version, tag, 'Lockfile version must match release tag');
    assert.equal(lock.packages[''].version, tag, 'Root package version must match release tag');
    assert.equal(versions[tag], manifest.minAppVersion, 'Release compatibility mapping must match manifest');
}

if (require.main === module) {
    const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
    validateReleaseMetadata(process.argv[2], read('manifest.json'), read('versions.json'),
        read('package.json'), read('package-lock.json'));
    console.log('Release metadata passed.');
}

module.exports = { validateReleaseMetadata };
