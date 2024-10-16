/**
 * 此脚本为用于发布release时进行的pr创建、tag创建等操作的半自动化脚本
 * 执行此脚本前需要进行的额外工作
 * 1、在系统环境变量中创建
 *    a.GITHUB_TOKEN: (在github个人账户中创建，具体步骤可自行查找'github token如何创建', 需要勾选的权限-repo, admin:repo_hook, gist)
 *    b.GITHUB_OWNER: (github用户名)
 * 2、须手动在三方库同级目录下创建tester工程，并将所在三方库拷贝到tester/harmony工程下，并完成相关配制
 */

// @ts-check
const { execSync } = require('child_process');
const { METHODS } = require('http');
const fs = require('node:fs');
const readline = require('readline');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? '';
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? '';

if (!GITHUB_TOKEN) {
  console.log('GITHUB_TOKEN not found');
  process.exit(1);
}

if(!GITHUB_OWNER){
  console.log('GITHUB_OWNER not found');
  process.exit(1);
}

console.log(`GITHUB_TOKEN is ${GITHUB_TOKEN}`);

// 文件夹名称
const EXPECTED_EXECUTION_DIRECTORY_NAME = 'react-native-permissions';
// 三方库名称
const REPO_NAME = 'react-native-permissions';
// 远程仓库地址
const GITHUB_URL = 'https://github.com/HDJKER/react-native-permissions'
// const GITHUB_PROJECT_ID = 522;  // 内部统一ID标识?
// 模块名
const MODULE_NAME = 'permissions';
// har包的导出地址
const HAR_FILE_OUTPUT_PATH = `tester/harmony/${MODULE_NAME}/build/default/outputs/default/${MODULE_NAME}.har`;
// 发npm的组织名-包名
const UNSCOPED_NPM_PACKAGE_NAME = '@react-native-oh-tpl/react-native-permissions';

const GITHUB_REPOS = 'react-native-oh-library';
const TARGET_BRANCH = 'sig';
// pr描述信息
const RELEASE_BODY = ''; // release的pr可以不绑定信息，目前暂时留白
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
            'Are changes good to be release? (yes/no): ',
            (answer) => {
              if (answer.toLowerCase() === 'yes') {
                CommitAndPush(version);
              } else {
                // 没准备好push就直接退出
                console.log('Deployment aborted.');
                rl.close();
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
function harPackageMove(answer) {
  if (answer !== 'done') {
    console.log('Deployment aborted');
    process.exit(1);
  }
  console.log(
    `Copying ${`../${HAR_FILE_OUTPUT_PATH}`} to ./harmony dir`
  );
  if (!fs.existsSync(`../${HAR_FILE_OUTPUT_PATH}`)) {
    console.log(`Couldn't find ${HAR_FILE_OUTPUT_PATH}.`);
    process.exit(1);
  }
}

/**
 * 创建pr请求
 * @param   {string}  version  
 */
async function CommitAndPush(version) {
  // 根据新版本号新建分支
  execSync(
    `git checkout -b release-${REPO_NAME}-${version}`
  );
  execSync('git add -A');

  // commit提交
  execSync(
    `git commit -m "release: ${REPO_NAME}@${version}"`,
    {
      stdio: 'inherit',
    }
  );

  // -u 设置上游分支 / origin HEAD 远程仓库的当前最新分支 / --no-verify强制跳过脚本执行
  execSync(`git push -u origin HEAD --no-verify`, {
    stdio: 'inherit',
  });
  // 创建新tag 用于标记release
  execSync(`git tag v${version}`);
  // 将新创建的tag推送至远程仓库
  execSync(`git push -u origin v${version} --no-verify`, {
    stdio: 'inherit',
  });
  // 创建pr请求
  const mergeRequestId = await createMergeRequest(
    `release-${REPO_NAME}-${version}`,
    `release: ${REPO_NAME}@${version}`
  );
  console.log(`Please merge the following Merge Request:\n
https://github.com/HDJKER/${REPO_NAME}/pull/${mergeRequestId}`);
  rl.close();
}

/**
 * @returns {boolean}
 */
// 用于判断仓库是否处于 干净 的状态
function isRepositoryClean() {
  // 查看仓库是否存在未提交的修改
  const status = execSync('git status --porcelain', { encoding: 'utf-8' });
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
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${REPO_NAME}/pulls`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title,
          head: `${GITHUB_OWNER}:${sourceBranch}`, // 确保这里的 GITHUB_OWNER 是实际的用户名
          base: `${TARGET_BRANCH}`,
          body: `${RELEASE_BODY}`,
          delete_branch_on_merge: true, // 合并后删除源分支
        }),
      }
    );
    if (!response.ok) {
      const errorMessage = await response.text();
      throw new Error(`Failed to create pull request: ${response.statusText} - ${response.status} - ${errorMessage}`);
    }
    const responseData = await response.json();
    return responseData.number; // 获取pr对应id号
  } catch (error) {
    console.error('Error happens when create pull request:', error);
    throw error;
  }
}

runDeployment();
