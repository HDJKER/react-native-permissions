// @ts-check
const { execSync } = require('child_process');
const { METHODS } = require('http');
const fs = require('node:fs');
const readline = require('readline');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
// const GITHUB_TOKEN = ''

if (!GITHUB_TOKEN) {
  console.log('GITHUB_TOKEN not found');
  process.exit(1);
}

console.log(`GITHUB_TOKEN is ${GITHUB_TOKEN}`);

// 目前这段代码是npm发包和gitlab提交操作
// 需要进行修改,改为github提交操作 以及github发release操作？

// 文件夹名称
const EXPECTED_EXECUTION_DIRECTORY_NAME =
  'react-native-permissions';
// 远程仓库地址
const GITHUB_URL = 'https://github.com/HDJKER/react-native-permissions'
const GITHUB_PROJECT_ID = 522;  // 内部统一ID标识?
// 库名
const MODULE_NAME = 'permissions';
// har包的导出地址
const HAR_FILE_OUTPUT_PATH = `tester/harmony/${MODULE_NAME}/build/default/outputs/default/${MODULE_NAME}.har`;
// 发npm的包名
const UNSCOPED_NPM_PACKAGE_NAME = '@react-native-oh-tpl/react-native-permissions';

const GITHUB_REPOS = 'react-native-oh-library';
const GITHUB_OWNER = 'HDJKER';
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function runDeployment() {
    // 获取执行npm命令时所处文件路径 process.cwd()
    // 判断是否是为指定的 EXPECTED_EXECUTION_DIRECTORY_NAME 路径
  if (!process.cwd().endsWith(EXPECTED_EXECUTION_DIRECTORY_NAME)) {
    console.log(
      `This script should be executed from ${EXPECTED_EXECUTION_DIRECTORY_NAME} directory`
    );
    process.exit(1);
  }
  // 仓库是否干净——未提交的修改 是否处于main分支 分支是否同步 
  if (!isRepositoryClean()) {
    console.log(
      'Repository should be clean, on main branch and up to date with upstream.'
    );
    process.exit(1);
  }

  let version = '';
  // 从package.json文件中的version字段获取当前版本号
  const currentVersion = JSON.parse(
    fs.readFileSync('./package.json').toString()
  )['version'];

  console.log(`current version ${currentVersion}`)

  rl.question(
    `Current version: ${currentVersion}. Enter new version: `,  // 手动输入新版本号?
    (newVersion) => {
      version = newVersion;
      console.log(`new version:${version}`)
      // 执行脚本updata-version.js 版本号升级操作 -库package.json  tester/package.json tester/harmony/${MODULE_NAME}/package.json  
      execSync(`npm run update_version  -- --new-version ${version}`, {
        stdio: 'inherit',
      });

      rl.question(
        `Please generate ${HAR_FILE_OUTPUT_PATH} file. Open DevEco Studio, select any file in '${MODULE_NAME}' module, and run Build > Make Module '${MODULE_NAME}'.\nOnce you finish type 'done': `,
        (answer) => {
          harPackageMove(answer);

          // 正常合入pr操作
          rl.question(
            'Are changes good to be pushed to the upstream? (yes/no): ',
            (answer) => {
              if (answer.toLowerCase() !== 'yes') {
                // 没准备好push就直接退出
                console.log('Deployment aborted.');
                rl.close();
              }else{
                // add 存入缓存区
          // execSync(
          //   `git checkout -b ${GITHUB_OWNER}-${version}`
          // );
          execSync('git add -A');
          // 输入commit信息
            rl.question(
              `\nfeat:新功能\nfix:修复BUG\ndocs:文档变更\nstyle:代码格式(不涉及代码运行的变动)\nrefactor:重构、可读性优化(既不是新增功能,也不是修复bug的代码变动)\n
perf:优化相关,提升性能、体验\ntest:测试相关,如添加测试用例\nbuild:构建过程或辅助工具的变动\nchore:不涉及代码变动的杂项\nci:修改集成配置的文件或脚本\nrelease:版本发布\n输入此次commit的类型,及对应内容:\n`, 
            (typeCont) => {
                // 输入commit信息后进行提交并创建pr
                CreatePr(typeCont);
                })
              }
            }
          );
          
        }
      );
    }
  );
}

/**
 * 判断打包har是否完成
 * @param {string} answer 
 */
function harPackageMove(answer){
  if (answer !== 'done') {
    console.log('Deployment aborted');
    process.exit(1);
  }
  console.log(
    `Copying ${`../${HAR_FILE_OUTPUT_PATH}`} to ./harmony dir`
  );
  // if (!fs.existsSync(`../${HAR_FILE_OUTPUT_PATH}`)) {
  //   console.log(`Couldn't find ${HAR_FILE_OUTPUT_PATH}.`);
  //   process.exit(1);
  // }
  // fs.rmSync('./harmony', { recursive: true, force: true });
  // fs.mkdirSync('./harmony');
  // fs.renameSync(
  //   `../${HAR_FILE_OUTPUT_PATH}`,
  //   `./harmony/${MODULE_NAME}.har`
  // );
}

/**
 * 创建pr请求
 * @param   {string}  typeCont  
 */
function CreatePr(typeCont){
  const reg = /feat:|fix:|docs:|style:|refactor:|perf:|test:|build:|chore:|ci:|release:/;
  if(!reg.test(typeCont)){
    console.log('请按照提示头进行commit提交')
  }
  
  console.log(`your input:${typeCont}`)
  execSync(
    `git commit -m "${typeCont}"`,
    {
      stdio: 'inherit',
    }
  );
  
  // 推送至个人仓库
  // -u 设置上游分支 / origin HEAD 远程仓库的当前最新分支 / --no-verify强制跳过脚本执行

  // execSync(`git push -u origin HEAD --no-verify`, {
  //   stdio: 'inherit',
  // });
  // // 创建新tag 用于标记release
  // // execSync(`git tag v${version}`);
  // // 将新创建的tag推送至远程仓库
  // // execSync(`git push -u origin v${version} --no-verify`, {
  // //   stdio: 'inherit',
  // // });
  // // 创建pr请求
  // const mergeRequestId = await createMergeRequest(
  //   `${GITHUB_OWNER}-${version}`,
  //   `docs: a auto pr script test`
  //   // `release: ${UNSCOPED_NPM_PACKAGE_NAME}@${version}`
  // );
  console.log(`Please merge the following Merge Request:\n
  https://github.com/HDJKER/${UNSCOPED_NPM_PACKAGE_NAME}/pull/`);
  rl.close();
}

/**
 * @returns {boolean}
 */
// 用于判断仓库是否处于 干净 的状态
function isRepositoryClean() {
  // 查看仓库是否存在未提交的修改
  const status = false;  // TODO 临时作用
  // const status = execSync('git status --porcelain', { encoding: 'utf-8' });
  // 查看当前所处于的分支名称 ".trim()"是用于去除首尾中可能出现的空白字符
  const branch = execSync('git branch --show-current', {
    encoding: 'utf-8',
  }).trim();
  // 判断是否于远程分支main同步 如果不同步则会列出两个提交点之间的所有提交
  const isUpdated =
    execSync('git rev-list HEAD...origin/sig --count', {
      encoding: 'utf-8',
    }).trim() === '0';
    console.log(`${status} ${branch} ${isUpdated}`)
  return !status && branch === 'sig' && isUpdated;
}



/**
 * 创建pr请求
 * @param {string} sourceBranch
 * @param {string} title
 * @returns {Promise<number>}
 */
async function createMergeRequest(sourceBranch, title) {
  try{
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPOS}/pulls`,
      {
        method:'POST',
        headers:{
          'Authorization':GITHUB_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title,
          source_branch: sourceBranch,
          target_branch: 'sig',
          squash:true,
          remove_source_branch:false,
        }),
      }
    )
    if (!response.ok){
      throw new Error(`Failed to create pull request: ${response.statusText} ${response.status}`);
    }
    const responseData = await response.json();
    return responseData.number; // 获取pr对应id号
  }catch (error){
    console.error('Error happens when create pull request:',error);
    throw error;
  }
}

// /**
//  * @param {string} version
//  *  @param {string} changelogForCurrentVersion
//  */
// function updateChangelog(version, changelogForCurrentVersion) {
//   let data = fs.readFileSync('../CHANGELOG.md').toString();
//   data = data.replace(
//     '# Changelog',
//     `# Changelog\n\n## v${version}\n ${changelogForCurrentVersion}`
//   );
//   fs.writeFileSync('../CHANGELOG.md', data);
// }

runDeployment();
