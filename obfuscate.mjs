import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 检查是否已安装 javascript-obfuscator
try {
    await import('javascript-obfuscator');
} catch (e) {
    console.error('请先安装 javascript-obfuscator: npm install --save-dev javascript-obfuscator');
    process.exit(1);
}

// 动态导入 javascript-obfuscator
const JavaScriptObfuscator = (await import('javascript-obfuscator')).default;

// 读取构建后的 main.js 文件
const mainJsPath = path.join(__dirname, 'main.js');
let code = fs.readFileSync(mainJsPath, 'utf8');

// 混淆配置
const obfuscationResult = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.7,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: true,
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
});

// 保存混淆后的代码
fs.writeFileSync(mainJsPath, obfuscationResult.getObfuscatedCode());
console.log('代码混淆完成！');
