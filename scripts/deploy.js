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

// 目前这段代码是npm发包和gitlab提交操作
// 需要进行修改,改为github提交操作 以及github发release操作？

// 文件夹名称
const EXPECTED_EXECUTION_DIRECTORY_NAME =
  'react-native-permissions';
// 远程仓库地址
const REPO_NAME = 'react-native-permissions';
const GITHUB_URL = 'https://github.com/HDJKER/react-native-permissions'
// const GITHUB_PROJECT_ID = 522;  // 内部统一ID标识?
// 库名
const MODULE_NAME = 'permissions';
// har包的导出地址
const HAR_FILE_OUTPUT_PATH = `tester/harmony/${MODULE_NAME}/build/default/outputs/default/${MODULE_NAME}.har`;
// 发npm的包名
const UNSCOPED_NPM_PACKAGE_NAME = '@react-native-oh-tpl/react-native-permissions';

const GITHUB_REPOS = 'react-native-oh-library';
const TARGET_BRANCH = 'sig'
const RELEASE_BODY = `
<!-- 感谢您提交PR！请按照模板填写，以便审阅者可以轻松理解和评估代码变更的影响。 -->

# Summary

<!-- 请解释此次更改的 **动机**，以下是一些帮助您的要点： -->

- 这个 PR 解决了哪些 issues？请标记这些 issues，以便合并 PR 后这些 issues 将会被自动关闭。
- 这个功能是什么？（如果适用）
- 您是如何实现解决方案的？
- 这个更改影响了库的哪些部分？

## Test Plan

<!-- 展示代码的稳定性。例如：用来复现场景的命令输入和结果输出、测试用例的路径地址，或者附上截图和视频。 -->

## Checklist

<!-- 检查项, 请自行排查并打钩, 通过: [X] -->

- [ ] 已经在真机设备或模拟器上测试通过
- [ ] 已经与 Android 或 iOS 平台做过效果/功能对比
- [ ] 已经添加了对应 API 的测试用例（如需要）
- [ ] 已经更新了文档（如需要）
- [ ] 更新了 JS/TS 代码 (如有)

`
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
  fs.rmSync('./harmony', { recursive: true, force: true });
  fs.mkdirSync('./harmony');
  fs.renameSync(
    `../${HAR_FILE_OUTPUT_PATH}`,
    `./harmony/${MODULE_NAME}.har`
  );
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
