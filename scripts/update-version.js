//@ts-check
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('node:child_process');
const JSON5 = require('json5');

// 更新版本号
// module name and some other settings 
// 所在文件夹名称
const PACKAGE_DIR_NAME = 'react-native-permissions';

const MODULE_NAME = 'permissions';

// tgz打包名称(不带version)
// react-native-oh-tpl-react-native-permissions-4.1.2-0.1.4 -> react-native-oh-tpl-react-native-permissions
const PACKAGE_TGZ_STEM_NAME_WITHOUT_VERSION =
  'react-native-oh-tpl-react-native-permissions';

(async function main() {
  const newVersionIndex = process.argv.findIndex(
    (arg) => arg === '--new-version'
  );
  let version;

  if (newVersionIndex !== -1 && process.argv[newVersionIndex + 1]) {
    version = process.argv[newVersionIndex + 1];
  } else {
    // 如果没有接受到正确的版本号则会再次请求输入
    const currentVersion = readPackage('.').version;
    version = await askUserForVersion(currentVersion);
  }

  console.log(`updata_version version:${version}`)
  updatePackageVersion('.', version);
  console.log(`Updated ${PACKAGE_DIR_NAME}/package.json`);
  updatePackageScript('../tester', version);
  console.log('Updated tester/package.json');
  updateOHPackageVersion(
    `../tester/harmony/${MODULE_NAME}/oh-package.json5`,
    version
  );
  console.log(`Updated ${MODULE_NAME}/oh-package.json5`);
  execSync('npm i && cd ../tester', { stdio: 'inherit' });
})();

/**
 * @param {string} currentVersion
 * @returns {Promise<string>}
 */
function askUserForVersion(currentVersion) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `Current version: ${currentVersion}. Enter new version: `,
      (userInput) => {
        rl.close();
        resolve(userInput);
      }
    );
  });
}

/**
 * 读取指定路径下的package文件操作方式
 * @param {string} packageDir
 * @returns {{version: string, scripts?: Record<string, string>}} - parsed content of package.json
 */
function readPackage(packageDir) {
  const packageJsonPath = path.join(packageDir, 'package.json');  // 组合路径，得到指向 packageDir/package.json 文件的路径名称
  const packageContent = fs.readFileSync(packageJsonPath, 'utf-8'); // 异步读取package.json文件内容
  return JSON.parse(packageContent);  // 将读取的String转化为object
}

/**
 * 修改package文件中的version字段
 * @param {string} packageDir
 * @param {string} version
 */
function updatePackageVersion(packageDir, version) {
  const packageData = readPackage(packageDir);
  packageData.version = version;  // 版本号更新

  const packageJsonPath = path.join(packageDir, 'package.json');
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(packageData, null, 2),
    'utf-8'
  );
}

/**
 * 更新tester中的install:pkg 内容 用于自动安装指定库
 * @param {string} packageDir
 * @param {string} version
 */
function updatePackageScript(packageDir, version) {
  const packageData = readPackage(packageDir);
  
  for (let script in packageData.scripts) {
    const regex = new RegExp(
      // 正则匹配 有些库是没有加上原库基线版本的如reanimated 和 gesture 
      // `${PACKAGE_TGZ_STEM_NAME_WITHOUT_VERSION}-\\d*\\.\\d*\\.\\d*`,
      `${PACKAGE_TGZ_STEM_NAME_WITHOUT_VERSION}-\\d*\\.\\d*\\.\\d*-\\d*\\.\\d*\\.\\d*`,
      'g'
    );
    packageData.scripts[script] = packageData.scripts[script].replace(
      regex,
      `${PACKAGE_TGZ_STEM_NAME_WITHOUT_VERSION}-${version}`
    );
  }
  // 覆写package.json5文件
  const packageJsonPath = path.join(packageDir, 'package.json');
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify(packageData, null, 2),
    'utf-8'
  );
}
/**
 * 更新tester/harmony工程中的package.json文件
 * @param {string} ohPackagePath
 * @param {string} version
 */
function updateOHPackageVersion(ohPackagePath, version) {
  const ohPackageContent = JSON5.parse(
    fs.readFileSync(ohPackagePath).toString()
  );
  ohPackageContent.version = version;
  fs.writeFileSync(ohPackagePath, JSON5.stringify(ohPackageContent, null, 2));
}
