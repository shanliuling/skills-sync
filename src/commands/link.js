/**
 * link.js - 创建 symlink 命令
 *
 * 为 config 中所有 enabled 的应用创建 Junction symlink
 * 支持 --app 参数指定单个应用，--dry-run 预览操作
 */

import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import { logger } from '../core/logger.js'
import { ensureConfig, getEnabledApps, findAppByName } from '../core/config.js'
import { createJunction, pathExists } from '../core/symlink.js'

/**
 * 运行 link 命令
 * @param {Object} options - 命令选项
 * @param {string} options.app - 指定应用名称
 * @param {boolean} options.dryRun - 是否只预览
 */
export async function runLink(options = {}) {
  const { app: appName, dryRun = false } = options

  // 检查配置
  const { exists, config } = ensureConfig()
  if (!exists) return

  // 检查 master 目录
  if (!fs.existsSync(config.masterDir)) {
    logger.error('Master 目录不存在，请检查 config.yaml 中的 masterDir 路径')
    return
  }

  // 获取要处理的应用列表
  let apps = getEnabledApps(config)

  if (appName) {
    // 指定应用
    const app = findAppByName(config, appName)
    if (!app) {
      logger.error(`未找到应用: ${appName}`)
      logger.hint('运行 skills-sync app list 查看所有应用')
      return
    }
    apps = [app]
  }

  if (apps.length === 0) {
    logger.warn('没有启用的应用')
    return
  }

  logger.title('创建符号链接')
  logger.newline()

  if (dryRun) {
    logger.info('[DRY-RUN 模式] 仅显示将执行的操作，不实际执行')
    logger.newline()
  }

  let successCount = 0
  let failCount = 0

  for (const app of apps) {
    const { name, skillsPath } = app

    // dry-run 模式
    if (dryRun) {
      const result = createJunction(config.masterDir, skillsPath, true)
      logger.log(`  ${logger.dim('○')} ${name.padEnd(12)} → ${skillsPath}`)
      continue
    }

    // 检查父目录是否存在
    const parentDir = path.dirname(skillsPath)
    if (!fs.existsSync(parentDir)) {
      logger.error(`${name.padEnd(12)} 父目录不存在: ${parentDir}`)
      logger.hint(`该 AI 应用可能未安装或路径有误`)
      failCount++
      continue
    }

    // 创建 Junction
    const result = createJunction(config.masterDir, skillsPath, false)

    if (result.success) {
      logger.success(`${name.padEnd(12)} → ${skillsPath}`)
      if (result.backup) {
        logger.log(`    ${logger.dim('已备份原目录: ' + result.backup)}`)
      }
      successCount++
    } else {
      logger.error(`${name.padEnd(12)} ${result.message}`)
      failCount++
    }
  }

  // 输出结果
  logger.newline()
  if (dryRun) {
    logger.hint('去掉 --dry-run 参数以实际执行')
  } else {
    if (successCount > 0) {
      logger.success(`已为 ${successCount} 个应用创建符号链接`)
    }
    if (failCount > 0) {
      logger.warn(`${failCount} 个应用创建失败`)
    }
  }
}

export default { runLink }
