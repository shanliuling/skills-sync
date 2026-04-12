/**
 * symlink.js - Windows Junction 创建/验证
 *
 * 通过 PowerShell 创建 Windows Junction（目录级 symlink，无需管理员权限）
 * 提供 Junction 的创建、验证、检查等功能
 */

import { execSync, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { logger } from './logger.js'

/**
 * 链接状态枚举
 */
export const LinkStatus = {
  OK: 'ok',
  WRONG_TARGET: 'wrong-target',
  NOT_LINKED: 'not-linked',
  NOT_INSTALLED: 'not-installed',
  MISSING: 'missing',
}

/**
 * 检查路径是否存在
 * @param {string} targetPath - 目标路径
 * @returns {boolean} 是否存在
 */
export function pathExists(targetPath) {
  return fs.existsSync(targetPath)
}

/**
 * 检查路径是否是 Junction
 * @param {string} targetPath - 目标路径
 * @returns {boolean} 是否是 Junction
 */
export function isJunction(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return false
  }

  try {
    const stats = fs.lstatSync(targetPath)
    return stats.isSymbolicLink()
  } catch {
    return false
  }
}

/**
 * 获取 Junction 的目标路径
 * @param {string} junctionPath - Junction 路径
 * @returns {string|null} 目标路径，不是 Junction 则返回 null
 */
export function getJunctionTarget(junctionPath) {
  if (!fs.existsSync(junctionPath)) {
    return null
  }

  try {
    // 使用参数化执行 PowerShell 获取 Junction 目标
    const script = `(Get-Item ${escapePowerShellString(junctionPath)}).Target`
    const result = runPowerShell(script)
    return result.stdout || null
  } catch {
    return null
  }
}

/**
 * 检查应用链接状态
 * @param {Object} app - 应用配置对象
 * @param {string} masterDir - Master 目录路径
 * @returns {{ status: string, message: string }} 状态结果
 */
export function checkLinkStatus(app, masterDir) {
  const { skillsPath, name } = app
  const parentDir = path.dirname(skillsPath)

  // 检查父目录是否存在（判断应用是否安装）
  if (!fs.existsSync(parentDir)) {
    return {
      status: LinkStatus.NOT_INSTALLED,
      message: '应用未安装',
    }
  }

  // skills 路径不存在（应用已安装，但 skills 目录不存在，可以创建）
  if (!fs.existsSync(skillsPath)) {
    return {
      status: LinkStatus.NOT_LINKED,
      message: '未创建链接，可运行 link 命令创建',
    }
  }

  // 检查是否是 Junction
  if (!isJunction(skillsPath)) {
    return {
      status: LinkStatus.NOT_LINKED,
      message: '路径存在但不是 Junction',
    }
  }

  // 检查 Junction 目标是否正确
  const target = getJunctionTarget(skillsPath)
  const normalizedTarget = target ? path.normalize(target) : null
  const normalizedMaster = path.normalize(masterDir)

  if (normalizedTarget !== normalizedMaster) {
    return {
      status: LinkStatus.WRONG_TARGET,
      message: `是 Junction 但指向错误目录: ${target}`,
    }
  }

  return {
    status: LinkStatus.OK,
    message: '正常',
  }
}

/**
 * 安全执行 PowerShell 命令（参数化）
 * @param {string} script - PowerShell 脚本
 * @returns {{ success: boolean, stdout: string, stderr: string }} 结果
 */
function runPowerShell(script) {
  try {
    const result = spawnSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      {
        encoding: 'utf-8',
        shell: false,
      },
    )

    return {
      success: result.status === 0,
      stdout: result.stdout?.trim() || '',
      stderr: result.stderr?.trim() || '',
    }
  } catch (error) {
    return {
      success: false,
      stdout: '',
      stderr: error.message,
    }
  }
}

/**
 * 创建 Junction 链接
 * @param {string} target - 目标目录（masterDir）
 * @param {string} linkPath - 链接路径
 * @param {boolean} dryRun - 是否只打印不执行
 * @returns {{ success: boolean, message: string, backup?: string }} 结果
 */
export function createJunction(target, linkPath, dryRun = false) {
  if (dryRun) {
    return {
      success: true,
      message: `[DRY-RUN] 将创建 Junction: ${linkPath} → ${target}`,
    }
  }

  // 确保目标目录存在
  if (!fs.existsSync(target)) {
    return {
      success: false,
      message: `目标目录不存在: ${target}`,
    }
  }

  try {
    // 先检查链接路径是否存在
    let backupPath = null
    if (fs.existsSync(linkPath)) {
      const stats = fs.lstatSync(linkPath)
      if (stats.isSymbolicLink()) {
        // 已是符号链接，删除
        fs.rmSync(linkPath, { recursive: true, force: true })
      } else {
        // 普通目录，备份
        backupPath = `${linkPath}.backup`
        let counter = 1
        while (fs.existsSync(backupPath)) {
          backupPath = `${linkPath}.backup${counter}`
          counter++
        }
        fs.renameSync(linkPath, backupPath)
      }
    }

    // 使用参数化执行 PowerShell 创建 Junction
    const script = `New-Item -ItemType Junction -Path ${escapePowerShellString(linkPath)} -Target ${escapePowerShellString(target)}`
    const result = runPowerShell(script)

    if (!result.success) {
      return {
        success: false,
        message: `创建符号链接失败: ${result.stderr || '未知错误'}`,
      }
    }

    return {
      success: true,
      message: 'Junction 创建成功',
      backup: backupPath,
    }
  } catch (error) {
    return {
      success: false,
      message: `创建符号链接失败: ${error.message}`,
    }
  }
}

/**
 * 转义 PowerShell 字符串
 * @param {string} str - 原始字符串
 * @returns {string} 转义后的字符串
 */
function escapePowerShellString(str) {
  // 使用单引号包裹，内部单引号转义为两个单引号
  return "'" + str.replace(/'/g, "''") + "'"
}

/**
 * 删除 Junction 链接
 * @param {string} linkPath - 链接路径
 * @param {boolean} dryRun - 是否只打印不执行
 * @returns {{ success: boolean, message: string }} 结果
 */
export function removeJunction(linkPath, dryRun = false) {
  if (dryRun) {
    return {
      success: true,
      message: `[DRY-RUN] 将删除 Junction: ${linkPath}`,
    }
  }

  if (!fs.existsSync(linkPath)) {
    return {
      success: false,
      message: '路径不存在',
    }
  }

  if (!isJunction(linkPath)) {
    return {
      success: false,
      message: '路径不是 Junction，无法删除',
    }
  }

  try {
    // 使用参数化执行 PowerShell 删除 Junction
    const script = `Remove-Item ${escapePowerShellString(linkPath)} -Force`
    const result = runPowerShell(script)

    if (!result.success) {
      return {
        success: false,
        message: `删除失败: ${result.stderr || '未知错误'}`,
      }
    }

    return {
      success: true,
      message: 'Junction 已删除',
    }
  } catch (error) {
    return {
      success: false,
      message: `删除失败: ${error.message}`,
    }
  }
}

/**
 * 批量检查所有应用的链接状态
 * @param {Object} config - 配置对象
 * @returns {Array} 各应用状态列表
 */
export function checkAllLinks(config) {
  const { masterDir, apps } = config
  return apps.map((app) => ({
    app,
    ...checkLinkStatus(app, masterDir),
  }))
}

export default {
  LinkStatus,
  pathExists,
  isJunction,
  getJunctionTarget,
  checkLinkStatus,
  createJunction,
  removeJunction,
  checkAllLinks,
}
