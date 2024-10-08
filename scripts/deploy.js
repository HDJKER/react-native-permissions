// @ts-check
const { execSync } = require('child_process');
const fs = require('node:fs');
const readline = require('readline');

const RNOH_REPO_TOKEN = process.env.RNOH_REPO_TOKEN ?? '';

if (!RNOH_REPO_TOKEN) {
  console.log('RNOH_REPO_TOKEN not found');
  process.exit(1);
}

console.log(`RNOH_REPO_TOKEN is ${RNOH_REPO_TOKEN}`);

// 目前这段代码是npm发包和gitlab提交操作
// 需要进行修改，改为github提交操作 以及github发release操作？

// 文件夹名称
const EXPECTED_EXECUTION_DIRECTORY_NAME =
  'react-native-permissions';
// const GITLAB_URL = 'https://gl.swmansion.com';
// 远程仓库地址
const GITHUB_URL = 'https://github.com/HDJKER/react-native-permissions.git'
// const GITLAB_PROJECT_ID = 522;
const GITHUB_PROJECT_ID = 522;  // 内部统一ID标识?
// 库名
const MODULE_NAME = 'permissions';
// har包的导出地址
const HAR_FILE_OUTPUT_PATH = `tester/harmony/${MODULE_NAME}/build/default/outputs/default/${MODULE_NAME}.har`;
// 发npm的包名
const UNSCOPED_NPM_PACKAGE_NAME = '@react-native-oh-tpl/react-native-permissions';

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
  process.exit(1)
  // 手动输入新版本号?
  rl.question(
    `Current version: ${currentVersion}. Enter new version: `,
    (newVersion) => {
      version = newVersion;
      console.log(`new version:${version}`)
      // 执行脚本updata-version.js 版本号升级操作
      process.exit(1)
      execSync(`npm run update_version  -- --new-version ${version}`, {
        stdio: 'inherit',
      });

      rl.question(
        `Please generate ${HAR_FILE_OUTPUT_PATH} file. Open DevEco Studio, select any file in '${MODULE_NAME}' module, and run Build > Make Module '${MODULE_NAME}'.\nOnce you finish type 'done': `,
        (answer) => {
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

          // const changelogForCurrentVersion = execSync(
          //   `npm run -s gen:changelog`
          // ).toString();
          // updateChangelog(version, changelogForCurrentVersion);

          execSync(`npm publish --dry-run`, { stdio: 'inherit' });

          rl.question(
            'Are changes good to be published and pushed to the upstream? (yes/no): ',
            async (answer) => {
              if (answer.toLowerCase() === 'yes') {
                execSync(`npm publish`, { stdio: 'inherit' });
                console.log('NPM Package was published successfully.');
                execSync(
                  `git checkout -b release-${UNSCOPED_NPM_PACKAGE_NAME}-${version}`
                );
                execSync('git add -A');
                execSync(
                  `git commit -m "release: ${UNSCOPED_NPM_PACKAGE_NAME}@${version}"`,
                  {
                    stdio: 'inherit',
                  }
                );
                execSync(`git push -u origin HEAD --no-verify`, {
                  stdio: 'inherit',
                });

                execSync(`git tag v${version}`);
                execSync(`git push -u origin v${version} --no-verify`, {
                  stdio: 'inherit',
                });
                const mergeRequestId = await createMergeRequest(
                  `release-${UNSCOPED_NPM_PACKAGE_NAME}-${version}`,
                  `release: ${UNSCOPED_NPM_PACKAGE_NAME}@${version}`
                );
                console.log(`Please merge the following Merge Request:\n
                https://gl.swmansion.com/rnoh/${UNSCOPED_NPM_PACKAGE_NAME}/-/merge_requests/${mergeRequestId}`);
                rl.close();
              } else {
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
  return !status && branch === 'sig' && isUpdated;
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

/**
 * @param {string} sourceBranch
 * @param {string} title
 * @returns {Promise<number>}
 */
async function createMergeRequest(sourceBranch, title) {
  try {
    const response = await fetch(
      `${GITHUB_URL}/api/v4/projects/${GITHUB_PROJECT_ID}/merge_requests`,
      {
        method: 'POST',
        headers: {
          'PRIVATE-TOKEN': RNOH_REPO_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_branch: sourceBranch,
          target_branch: 'main',
          title: title,
          squash: false,
          remove_source_branch: true,
        }),
      }
    );
    if (!response.ok) {
      throw new Error(
        `Failed to create merge request: ${response.statusText} ${response.status}`
      );
    }
    const responseData = await response.json();
    return responseData.iid;
  } catch (error) {
    console.error('Error creating merge request:', error);
    throw error;
  }
}

runDeployment();
