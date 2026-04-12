#!/usr/bin/env node

/**
 * skills-sync.js - CLI 入口
 *
 */

import { program } from 'commander'
import { runSetup } from '../src/commands/setup.js'
import { runImport } from '../src/commands/import.js'
import { runLink } from '../src/commands/link.js'
import { runSync } from '../src/commands/sync.js'
import { runWatch } from '../src/commands/watch.js'
import { runHealth } from '../src/commands/health.js'
import { runRollback } from '../src/commands/rollback.js'
import { runApp } from '../src/commands/app.js'
import { runList } from '../src/commands/list.js'
import { runInit } from '../src/commands/init.js'
import { runClone } from '../src/commands/clone.js'
import { runStart } from '../src/commands/start.js'

// 读取版本号
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkg = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8'),
)

// 配置 CLI
program
  .name('skills-sync')
  .description('在多个 AI 应用之间同步本地 skills 文件夹')
  .version(pkg.version)

// setup 命令
program
  .command('setup')
  .description('初始化配置，创建 master 目录和 config.yaml')
  .action(runSetup)

// import 命令
program
  .command('import')
  .description('扫描电脑上已有的 skills，导入到 master 目录')
  .option('-y, --yes', '跳过所有确认，自动选择最新版本')
  .action((options) => runImport(options))

// link 命令
program
  .command('link')
  .description('为启用的应用创建 Junction symlink')
  .option('-a, --app <name>', '只为指定应用创建链接')
  .option('-d, --dry-run', '预览操作，不实际执行')
  .action((options) => runLink(options))

// sync 命令
program
  .command('sync')
  .description('手动触发 Git 同步')
  .option('-m, --message <message>', '自定义 commit message')
  .action((options) => runSync(options))

// watch 命令
program
  .command('watch')
  .description('启动文件监听，自动同步变更')
  .action(runWatch)

// health 命令
program
  .command('health')
  .description('检查所有 symlink 状态，输出健康报告')
  .action(runHealth)

// rollback 命令
program
  .command('rollback')
  .description('回滚到历史版本（需要启用 Git）')
  .action(runRollback)

// list 命令
program
  .command('list')
  .description('列出电脑上用户自行下载的 skills')
  .action(runList)

// init 命令
program
  .command('init')
  .description('一键初始化：setup + import + link')
  .action(runInit)

// clone 命令
program
  .command('clone [repo]')
  .description('从 GitHub 克隆 skills 仓库并创建链接')
  .action((repo) => runClone({ repo }))

// app 命令
program
  .command('app [subcommand]')
  .description('应用管理 (add / list)')
  .action((subcommand) => runApp(subcommand || 'list'))

// 默认命令：无参数时运行自动引导
if (process.argv.length === 2) {
  runStart()
} else {
  // 解析参数
  program.parse()
}
