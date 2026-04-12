/**
 * scanner.js - 扫描现有 skills 目录
 *
 * 在用户目录下递归搜索包含 SKILL.md 文件的目录，识别为 skill
 * 支持 ignore 目录、深度限制等
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { glob } from 'glob'
import { logger } from './logger.js'

/**
 * 默认搜索路径
 * @returns {string[]} 搜索路径列表
 */
export function getDefaultSearchPaths() {
  const home = os.homedir()
  const username = os.userInfo().username

  return [
    path.join(home, '.agents', 'skills'), // skills.sh 下载目录
    path.join(home, '.claude'),
    path.join(home, '.gemini'),
    path.join(home, '.codex'),
  ]
}

/**
 * 忽略的目录名（通用）
 */
const IGNORE_DIRS = [
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '__pycache__',
  '.cache',
  'cache',
]

/**
 * 忽略的路径模式（AI 应用自带的 skills，非用户下载）
 * 这些路径下的 skills 是 AI 应用内置的，不应被扫描
 */
const IGNORE_PATH_PATTERNS = [
  '/plugins/', // Claude 插件目录
  '/marketplaces/', // 插件市场
  '/external_plugins/', // 外部插件
  '/.claude-plugin/', // Claude 插件配置
  '/local-agent-mode-sessions/', // Claude 本地代理会话
  '/skills-plugin/', // 技能插件缓存
]

/**
 * 扫描选项
 * @typedef {Object} ScanOptions
 * @property {string[]} searchPaths - 搜索路径
 * @property {number} maxDepth - 最大深度
 * @property {string[]} ignoreDirs - 忽略的目录
 */

/**
 * 扫描 skills 目录
 * @param {ScanOptions} options - 扫描选项
 * @returns {Promise<Array<{ name: string, path: string, sourceApp: string }>>} 找到的 skills 列表
 */
export async function scanSkills(options = {}) {
  const {
    searchPaths = getDefaultSearchPaths(),
    maxDepth = 15,
    ignoreDirs = IGNORE_DIRS,
  } = options

  const skills = []
  const seenPaths = new Set()

  logger.info('扫描中...')
  logger.newline()

  for (const searchPath of searchPaths) {
    if (!fs.existsSync(searchPath)) {
      continue
    }

    try {
      // 使用 glob 查找 SKILL.md 文件
      const pattern = path.join(searchPath, '**/SKILL.md').replace(/\\/g, '/')
      const matches = await glob(pattern, {
        ignore: ignoreDirs.map((d) => `**/${d}/**`),
        maxDepth: maxDepth,
        absolute: true,
        nocase: true,
        windowsPathsNoEscape: true,
        follow: false,
      })

      for (const skillFile of matches) {
        const skillDir = path.dirname(skillFile)
        const normalizedPath = path.normalize(skillDir)

        // 去重
        if (seenPaths.has(normalizedPath)) {
          continue
        }

        // 过滤 AI 应用自带的 skills（非用户下载）
        if (isBuiltInSkill(skillDir)) {
          continue
        }

        seenPaths.add(normalizedPath)

        // 获取 skill 名称
        const skillName = path.basename(skillDir)

        // 推断来源应用
        const sourceApp = inferSourceApp(skillDir)

        skills.push({
          name: skillName,
          path: skillDir,
          sourceApp,
        })
      }
    } catch (error) {
      // 忽略权限错误等
      continue
    }
  }

  return skills
}

/**
 * 检查是否是 AI 应用自带的 skill（非用户下载）
 * @param {string} skillPath - skill 路径
 * @returns {boolean} 是否是内置 skill
 */
function isBuiltInSkill(skillPath) {
  const normalizedPath = skillPath.toLowerCase().replace(/\\/g, '/')

  return IGNORE_PATH_PATTERNS.some((pattern) =>
    normalizedPath.includes(pattern),
  )
}

/**
 * 推断 skill 来源应用
 * @param {string} skillPath - skill 路径
 * @returns {string} 来源应用名称
 */
function inferSourceApp(skillPath) {
  const normalizedPath = skillPath.toLowerCase().replace(/\\/g, '/')

  if (normalizedPath.includes('.claude')) return 'Claude'
  if (normalizedPath.includes('.gemini')) return 'Gemini CLI'
  if (normalizedPath.includes('.codex')) return 'Codex'
  if (normalizedPath.includes('roaming')) return 'AppData/Roaming'
  if (normalizedPath.includes('local')) return 'AppData/Local'
  if (normalizedPath.includes('desktop')) return 'Desktop'
  if (normalizedPath.includes('documents')) return 'Documents'
  if (normalizedPath.includes('downloads')) return 'Downloads'

  return '未知'
}

/**
 * 复制 skill 到目标目录
 * @param {string} skillPath - skill 源路径
 * @param {string} targetDir - 目标目录
 * @param {boolean} overwrite - 是否覆盖
 * @returns {{ success: boolean, message: string, skipped?: boolean }} 结果
 */
export function copySkill(skillPath, targetDir, overwrite = false) {
  const skillName = path.basename(skillPath)
  const destPath = path.join(targetDir, skillName)

  // 检查目标是否已存在
  if (fs.existsSync(destPath)) {
    if (!overwrite) {
      return {
        success: false,
        skipped: true,
        message: `已存在同名 skill: ${skillName}`,
      }
    }
    // 覆盖：先删除
    try {
      fs.rmSync(destPath, { recursive: true, force: true })
    } catch (error) {
      return {
        success: false,
        message: `删除现有目录失败: ${error.message}`,
      }
    }
  }

  // 复制目录
  try {
    fs.mkdirSync(targetDir, { recursive: true })
    copyDirRecursive(skillPath, destPath)
    return {
      success: true,
      message: `已复制: ${skillName}`,
    }
  } catch (error) {
    return {
      success: false,
      message: `复制失败: ${error.message}`,
    }
  }
}

/**
 * 递归复制目录
 * @param {string} src - 源目录
 * @param {string} dest - 目标目录
 */
function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true })

  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

/**
 * 统计 master 目录中的 skills 数量
 * @param {string} masterDir - master 目录路径
 * @returns {number} skills 数量
 */
export function countSkills(masterDir) {
  if (!fs.existsSync(masterDir)) {
    return 0
  }

  try {
    const entries = fs.readdirSync(masterDir, { withFileTypes: true })
    return entries.filter((entry) => {
      if (!entry.isDirectory()) return false
      const skillFile = path.join(masterDir, entry.name, 'SKILL.md')
      return fs.existsSync(skillFile)
    }).length
  } catch {
    return 0
  }
}

/**
 * 列出 master 目录中的 skills
 * @param {string} masterDir - master 目录路径
 * @returns {Array<{ name: string, path: string }>} skills 列表
 */
export function listSkills(masterDir) {
  if (!fs.existsSync(masterDir)) {
    return []
  }

  try {
    const entries = fs.readdirSync(masterDir, { withFileTypes: true })
    return entries
      .filter((entry) => {
        if (!entry.isDirectory()) return false
        const skillFile = path.join(masterDir, entry.name, 'SKILL.md')
        return fs.existsSync(skillFile)
      })
      .map((entry) => ({
        name: entry.name,
        path: path.join(masterDir, entry.name),
      }))
  } catch {
    return []
  }
}

export default {
  getDefaultSearchPaths,
  scanSkills,
  copySkill,
  countSkills,
  listSkills,
}
