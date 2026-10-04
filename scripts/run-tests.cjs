const { spawnSync } = require('node:child_process');

const tasks = [
    'test:architecture',
    'test:rendering',
    'test:events',
    'test:i18n',
    'test:review',
    'test:flashcards',
    'test:storage',
    'test:colors',
    'test:matching',
    'test:navigation',
    'test:favorites',
    'test:models',
    'test:views',
    'test:hicard-view',
    'test:exclusions',
    'test:secrets',
    'test:ai'
];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
for (const task of tasks) {
    const result = spawnSync(npm, ['run', task], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
}
