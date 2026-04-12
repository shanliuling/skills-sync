/**
 * sync.js - 手动 Git 同步命令
 *
 * 手动触发 Git 同步：git add . → git commit → git push
 * 若 git.enabled: false 则提示未启用并退出
 */

import fs from 'fs'
import { logger } from '../core/logger.js'
import { ensureConfig } from '../core/config.js'
import { sync, pushToRemote, hasRemote } from '../core/git.js'

/**
 * 运行 sync 命令
 * @param {Object} options - 命令选项
 * @param {string} options.message - 自定义 commit message
 */
export async function runSync(options = {}) {
  const { message } = options

  // 检查配置
  const { exists, config } = ensureConfig()
  if (!exists) return

  // 检查 Git 是否启用
  if (!config.git || !config.git.enabled) {
    logger.warn('Git 同步未启用')
    logger.hint('在 config.yaml 中设置 git.enabled: true 以启用 Git 同步')
    return
  }

  // 检查 master 目录
  if (!fs.existsSync(config.masterDir)) {
    logger.error('Master 目录不存在，请检查 config.yaml 中的 masterDir 路径')
    return
  }

  logger.title('Git 同步')

  // 执行同步（提交）
  const result = await sync(config.masterDir, message)

  if (!result.success) {
    logger.error(result.message)
    return
  }

  // 没有变更
  if (!result.hash) {
    logger.info(result.message)
    return
  }

  logger.success(`已提交 (commit: ${result.hash})`)

  // 检查是否需要推送
  if (!config.git.autoPush) {
    logger.hint('自动推送未启用，手动运行 git push 推送到远端')
    return
  }

  // 检查是否配置了远端
  const hasRemoteConfig = await hasRemote(config.masterDir)
  if (!hasRemoteConfig) {
    logger.warn('未配置 Git 远端，跳过推送')
    logger.hint('在 config.yaml 中设置 git.remote 以启用推送')
    return
  }

  // 推送
  logger.info('正在推送到远端...')
  const pushResult = await pushToRemote(config.masterDir)

  if (pushResult.success) {
    logger.success(pushResult.message)
  } else {
    logger.error(pushResult.message)
  }
}

export default { runSync }
