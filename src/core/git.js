/**
 * git.js - Git 操作封装
 *
 * 封装 simple-git 库，提供初始化、提交、推送、回滚等操作
 * 所有操作在 git.enabled: false 时应跳过
 */

import fs from 'fs'
import path from 'path'
import simpleGit from 'simple-git'
import { logger } from './logger.js'

/**
 * 创建 simple-git 实例
 * @param {string} repoPath - 仓库路径
 * @returns {Object} simple-git 实例
 */
export function createGit(repoPath) {
  return simpleGit(repoPath)
}

/**
 * 检查目录是否是 Git 仓库
 * @param {string} repoPath - 仓库路径
 * @returns {Promise<boolean>} 是否是 Git 仓库
 */
export async function isGitRepo(repoPath) {
  try {
    const git = createGit(repoPath)
    await git.status()
    return true
  } catch {
    return false
  }
}

/**
 * 初始化 Git 仓库
 * @param {string} repoPath - 仓库路径
 * @returns {Promise<{ success: boolean, message: string }>} 结果
 */
export async function initGit(repoPath) {
  try {
    const git = createGit(repoPath)
    await git.init()
    return { success: true, message: 'Git 已初始化' }
  } catch (error) {
    return { success: false, message: `Git 初始化失败: ${error.message}` }
  }
}

/**
 * 添加 Git 远端
 * @param {string} repoPath - 仓库路径
 * @param {string} remoteUrl - 远端地址
 * @returns {Promise<{ success: boolean, message: string }>} 结果
 */
export async function addRemote(repoPath, remoteUrl) {
  try {
    const git = createGit(repoPath)
    // 检查是否已有 origin
    const remotes = await git.getRemotes()
    if (remotes.find((r) => r.name === 'origin')) {
      await git.removeRemote('origin')
    }
    await git.addRemote('origin', remoteUrl)
    return { success: true, message: '远端已添加' }
  } catch (error) {
    return { success: false, message: `添加远端失败: ${error.message}` }
  }
}

/**
 * 检查是否有未提交的变更
 * @param {string} repoPath - 仓库路径
 * @returns {Promise<{ hasChanges: boolean, files: string[] }>} 结果
 */
export async function hasChanges(repoPath) {
  try {
    const git = createGit(repoPath)
    const status = await git.status()
    return {
      hasChanges: !status.isClean(),
      files: [...status.staged, ...status.modified, ...status.not_added],
    }
  } catch (error) {
    return { hasChanges: false, files: [] }
  }
}

/**
 * 提交变更
 * @param {string} repoPath - 仓库路径
 * @param {string} message - 提交消息
 * @returns {Promise<{ success: boolean, message: string, hash?: string }>} 结果
 */
export async function commitChanges(repoPath, message) {
  try {
    const git = createGit(repoPath)

    // 检查是否有变更
    const result = await hasChanges(repoPath)
    if (!result.hasChanges) {
      return { success: true, message: '没有需要同步的内容', hash: null }
    }

    // 添加所有变更（包括删除的文件）
    await git.raw(['add', '-A'])

    // 提交
    const commitResult = await git.commit(message)
    const hash = commitResult.commit
      ? commitResult.commit.substring(0, 7)
      : null

    return { success: true, message: '提交成功', hash }
  } catch (error) {
    return { success: false, message: `提交失败: ${error.message}` }
  }
}

/**
 * 推送到远端
 * @param {string} repoPath - 仓库路径
 * @param {string} branch - 分支名，默认当前分支
 * @returns {Promise<{ success: boolean, message: string }>} 结果
 */
export async function pushToRemote(repoPath, branch = null) {
  try {
    const git = createGit(repoPath)

    // 获取当前分支
    const currentBranch = branch || (await git.branch()).current

    // 推送
    await git.push('origin', currentBranch, { '--set-upstream': null })

    return { success: true, message: '推送成功' }
  } catch (error) {
    // 判断错误类型
    const errorMsg = error.message.toLowerCase()

    if (
      errorMsg.includes('authentication') ||
      errorMsg.includes('credential')
    ) {
      return {
        success: false,
        message: 'Git 认证失败，请先配置 Git 凭据',
        isAuthError: true,
      }
    }

    if (
      errorMsg.includes('network') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('enotfound')
    ) {
      return {
        success: false,
        message: '推送失败，请检查网络或 Git 远端地址是否正确',
        isNetworkError: true,
      }
    }

    return { success: false, message: `推送失败: ${error.message}` }
  }
}

/**
 * 同步流程：提交 + 推送
 * @param {string} repoPath - 仓库路径
 * @param {string} customMessage - 自定义提交消息
 * @returns {Promise<{ success: boolean, message: string, hash?: string }>} 结果
 */
export async function sync(repoPath, customMessage = null) {
  // 检查是否有变更
  const { hasChanges } = await hasChanges(repoPath)
  if (!hasChanges) {
    return { success: true, message: '没有需要同步的内容' }
  }

  // 生成提交消息
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const message = customMessage || `sync: ${timestamp}`

  // 提交
  const commitResult = await commitChanges(repoPath, message)
  if (!commitResult.success) {
    return commitResult
  }

  return {
    success: true,
    message: '同步成功',
    hash: commitResult.hash,
  }
}

/**
 * 获取提交历史
 * @param {string} repoPath - 仓库路径
 * @param {number} count - 获取数量，默认 10
 * @returns {Promise<Array>} 提交列表
 */
export async function getCommitHistory(repoPath, count = 10) {
  try {
    const git = createGit(repoPath)
    const log = await git.log(['--max-count', count.toString()])

    return log.all.map((commit) => ({
      hash: commit.hash.substring(0, 7),
      fullHash: commit.hash,
      message: commit.message,
      date: new Date(commit.date),
      relativeDate: getRelativeDate(new Date(commit.date)),
    }))
  } catch (error) {
    return []
  }
}

/**
 * 计算相对时间
 * @param {Date} date - 日期
 * @returns {string} 相对时间字符串
 */
function getRelativeDate(date) {
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  return date.toLocaleDateString('zh-CN')
}

/**
 * 回滚到指定提交
 * @param {string} repoPath - 仓库路径
 * @param {string} hash - 提交哈希
 * @returns {Promise<{ success: boolean, message: string }>} 结果
 */
export async function rollbackToCommit(repoPath, hash) {
  try {
    const git = createGit(repoPath)

    // 检出指定提交的文件
    await git.checkout([hash, '--', '.'])

    // 创建新提交
    await git.add('.')
    await git.commit(`rollback to ${hash}`)

    return { success: true, message: '回滚成功' }
  } catch (error) {
    return { success: false, message: `回滚失败: ${error.message}` }
  }
}

/**
 * 获取最后同步时间
 * @param {string} repoPath - 仓库路径
 * @returns {Promise<{ date: Date|null, relative: string }>} 结果
 */
export async function getLastSyncTime(repoPath) {
  try {
    const git = createGit(repoPath)
    const log = await git.log(['--max-count', '1'])

    if (log.latest) {
      const date = new Date(log.latest.date)
      return {
        date,
        relative: getRelativeDate(date),
      }
    }

    return { date: null, relative: '从未' }
  } catch {
    return { date: null, relative: '从未' }
  }
}

/**
 * 检查远端是否配置
 * @param {string} repoPath - 仓库路径
 * @returns {Promise<boolean>} 是否配置远端
 */
export async function hasRemote(repoPath) {
  try {
    const git = createGit(repoPath)
    const remotes = await git.getRemotes()
    return remotes.some((r) => r.name === 'origin')
  } catch {
    return false
  }
}

/**
 * 克隆远程仓库
 * @param {string} remoteUrl - 远程仓库 URL
 * @param {string} targetPath - 目标路径
 * @returns {Promise<{ success: boolean, message: string }>} 结果
 */
export async function cloneRepo(remoteUrl, targetPath) {
  try {
    // 确保父目录存在
    const parentDir = path.dirname(targetPath)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }

    // 使用 simple-git 克隆
    await simpleGit().clone(remoteUrl, targetPath)

    return { success: true, message: '克隆成功' }
  } catch (error) {
    const errorMsg = error.message.toLowerCase()

    if (
      errorMsg.includes('authentication') ||
      errorMsg.includes('credential')
    ) {
      return {
        success: false,
        message: 'Git 认证失败，请先配置 Git 凭据',
      }
    }

    if (
      errorMsg.includes('network') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('enotfound')
    ) {
      return {
        success: false,
        message: '克隆失败，请检查网络或仓库地址是否正确',
      }
    }

    return { success: false, message: `克隆失败: ${error.message}` }
  }
}

export default {
  createGit,
  isGitRepo,
  initGit,
  addRemote,
  hasChanges,
  commitChanges,
  pushToRemote,
  sync,
  getCommitHistory,
  rollbackToCommit,
  getLastSyncTime,
  hasRemote,
  cloneRepo,
}
