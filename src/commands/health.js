/**
 * health.js - 健康检查命令
 *
 * 检查所有 symlink 状态，输出报告
 * 包括应用状态、master 目录信息、Git 状态
 */

import fs from 'fs'
import { logger } from '../core/logger.js'
import { ensureConfig } from '../core/config.js'
import { checkAllLinks, LinkStatus } from '../core/symlink.js'
import { isGitRepo, getLastSyncTime } from '../core/git.js'
import { countSkills } from '../core/scanner.js'

/**
 * 运行 health 命令
 */
export async function runHealth() {
  // 检查配置
  const { exists, config } = ensureConfig()
  if (!exists) return

  logger.title('应用状态检查')
  logger.newline()

  // 检查 master 目录
  if (!fs.existsSync(config.masterDir)) {
    logger.error('Master 目录不存在，请检查 config.yaml 中的 masterDir 路径')
    return
  }

  // 检查所有应用链接状态
  const linkStatuses = checkAllLinks(config)

  let okCount = 0
  let notLinkedCount = 0
  let notInstalledCount = 0
  let problemCount = 0

  for (const { app, status, message } of linkStatuses) {
    const name = app.name.padEnd(12)

    switch (status) {
      case LinkStatus.OK:
        logger.success(`${name} ok`)
        okCount++
        break

      case LinkStatus.NOT_INSTALLED:
        logger.log(`${logger.dim('○')} ${name} ${logger.dim('未安装')}`)
        notInstalledCount++
        break

      case LinkStatus.NOT_LINKED:
        logger.warn(
          `${name} 未链接  →  运行 skills-sync link --app ${app.name} 创建`,
        )
        notLinkedCount++
        break

      case LinkStatus.WRONG_TARGET:
        logger.warn(
          `${name} 指向错误  →  运行 skills-sync link --app ${app.name} 修复`,
        )
        problemCount++
        break

      default:
        logger.error(`${name} ${message}`)
        problemCount++
    }
  }

  logger.newline()

  // Master 目录信息
  const skillCount = countSkills(config.masterDir)
  logger.log(`Master 目录: ${config.masterDir}（${skillCount} 个 skills）`)

  // Git 状态
  if (config.git?.enabled) {
    const isRepo = await isGitRepo(config.masterDir)
    if (isRepo) {
      const { relative } = await getLastSyncTime(config.masterDir)
      logger.log(`Git 状态: 已启用，最后同步 ${relative}`)
    } else {
      logger.warn('Git 状态: 已启用但未初始化仓库')
    }
  } else {
    logger.log('Git 状态: 未启用')
  }

  logger.newline()

  // 总结
  if (problemCount === 0 && notLinkedCount === 0) {
    logger.success('所有已安装应用状态正常')
    if (notInstalledCount > 0) {
      logger.log(`${logger.dim(`${notInstalledCount} 个应用未安装（已忽略）`)}`)
    }
  } else {
    if (notLinkedCount > 0) {
      logger.warn(`${notLinkedCount} 个应用需要创建链接`)
    }
    if (problemCount > 0) {
      logger.warn(`${problemCount} 个应用需要修复`)
    }
  }
}

export default { runHealth }
