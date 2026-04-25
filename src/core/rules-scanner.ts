/**
 * rules-scanner.ts - 扫描和管理各平台 rules 文件
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { glob } from 'glob'
import { logger } from './logger.js'
import { t } from './i18n.js'

/**
 * Rules 信息接口
 */
export interface RulesInfo {
  name: string  // 平台名称
  sourcePath: string  // 源路径（各平台的 rules 路径）
  files: string[]  // 找到的 rules 文件
}

/**
 * Rules 应用定义
 */
export interface RulesAppDef {
  name: string
  // 源路径模板，支持 ~
  sourcePath: string
  // 是否是目录
  isDirectory: boolean
}

/**
 * 支持的 rules 应用列表
 */
export const rulesAppRegistry: Record<string, RulesAppDef> = {
  claude: {
    name: 'Claude Code',
    sourcePath: '~/.claude/rules/',
    isDirectory: true,
  },
  codex: {
    name: 'Codex',
    sourcePath: '~/.codex/AGENTS.md',
    isDirectory: false,
  },
  'gemini-cli': {
    name: 'Gemini CLI',
    sourcePath: '~/.gemini/GEMINI.md',
    isDirectory: false,
  },
}

/**
 * 解析路径模板，支持 ~
 */
function resolvePath(template: string): string {
  if (template.startsWith('~')) {
    return path.join(os.homedir(), template.slice(1))
  }
  return template
}

/**
 * 检测 rules 应用是否存在
 */
export function detectRulesApp(appId: string): string | null {
  const def = rulesAppRegistry[appId]
  if (!def) return null

  const resolved = resolvePath(def.sourcePath)
  if (fs.existsSync(resolved)) {
    return resolved
  }
  return null
}

/**
 * 扫描所有支持的 rules 应用
 */
export async function scanAllRules(): Promise<RulesInfo[]> {
  const results: RulesInfo[] = []

  for (const [appId, def] of Object.entries(rulesAppRegistry)) {
    const sourcePath = resolvePath(def.sourcePath)

    if (!fs.existsSync(sourcePath)) {
      continue
    }

    const files = await scanRulesFiles(sourcePath, def.isDirectory)

    if (files.length > 0) {
      results.push({
        name: def.name,
        sourcePath,
        files,
      })
    }
  }

  return results
}

/**
 * 扫描 rules 文件
 */
async function scanRulesFiles(sourcePath: string, isDirectory: boolean): Promise<string[]> {
  try {
    if (isDirectory) {
      // 目录：递归查找所有 .md 文件
      const pattern = sourcePath.replace(/\\/g, '/') + '**/*.md'
      const matches = await glob(pattern, {
        absolute: true,
        nocase: true,
        windowsPathsNoEscape: true,
      })
      return matches
    } else {
      // 文件：直接返回
      if (fs.existsSync(sourcePath)) {
        return [sourcePath]
      }
      return []
    }
  } catch {
    return []
  }
}

/**
 * 收集 rules 到 masterDir
 * 返回收集的文件数量
 */
export async function collectRules(masterDir: string): Promise<number> {
  const rulesDir = path.join(masterDir, 'rules')
  const rules = await scanAllRules()

  if (rules.length === 0) {
    logger.info(t('rules.noRulesFound'))
    return 0
  }

  let count = 0

  for (const rule of rules) {
    const destDir = path.join(rulesDir, getAppDirName(rule.name))
    fs.mkdirSync(destDir, { recursive: true })

    // 获取源目录的父目录，用于保持目录结构
    const sourceParent = path.dirname(rule.sourcePath)

    for (const file of rule.files) {
      const relativePath = path.relative(sourceParent, file)
      const destPath = path.join(destDir, relativePath)
      const destFileDir = path.dirname(destPath)

      fs.mkdirSync(destFileDir, { recursive: true })

      try {
        fs.copyFileSync(file, destPath)
        count++
      } catch (error) {
        // 忽略复制失败
      }
    }
  }

  return count
}

/**
 * 恢复 rules 到原路径
 * 返回恢复的文件数量
 */
export async function restoreRules(masterDir: string): Promise<number> {
  const rulesDir = path.join(masterDir, 'rules')

  if (!fs.existsSync(rulesDir)) {
    logger.info(t('rules.noMasterRules'))
    return 0
  }

  let count = 0

  // 遍历 masterDir/rules 下的每个平台
  const entries = fs.readdirSync(rulesDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const sourceDir = path.join(rulesDir, entry.name)
    const appPath = findAppSourcePath(entry.name)

    if (!appPath) continue

    // 确定目标目录
    const destParent = path.dirname(appPath)

    // 遍历源目录下的所有文件
    const files = getAllFiles(sourceDir)
    for (const file of files) {
      // 计算相对于 sourceDir 的路径
      const relativePath = path.relative(sourceDir, file)
      const destPath = path.join(destParent, relativePath)
      const destFileDir = path.dirname(destPath)

      fs.mkdirSync(destFileDir, { recursive: true })

      try {
        fs.copyFileSync(file, destPath)
        count++
      } catch (error) {
        // 忽略复制失败
      }
    }
  }

  return count
}

/**
 * 获取目录下所有文件
 */
function getAllFiles(dir: string): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath))
    } else {
      results.push(fullPath)
    }
  }

  return results
}

/**
 * 根据平台名获取目录名
 */
function getAppDirName(appName: string): string {
  const map: Record<string, string> = {
    'Claude Code': 'claude',
    'Cursor': 'cursor',
    'Cline': 'cline',
    'Codex': 'codex',
    'Gemini CLI': 'gemini',
    'Antigravity': 'antigravity',
  }
  return map[appName] || appName.toLowerCase().replace(/\s+/g, '-')
}

/**
 * 根据目录名找到原路径
 */
function findAppSourcePath(dirName: string): string | null {
  for (const def of Object.values(rulesAppRegistry)) {
    const sourcePath = resolvePath(def.sourcePath)
    const expectedDir = getAppDirName(def.name)
    if (expectedDir === dirName) {
      return sourcePath
    }
  }
  return null
}

/**
 * 检查 rules 是否有变更
 */
export async function checkRulesChanges(masterDir: string): Promise<{
  hasChanges: boolean
  localOnly: string[]
  remoteOnly: string[]
  modified: string[]
}> {
  const rulesDir = path.join(masterDir, 'rules')

  if (!fs.existsSync(rulesDir)) {
    return { hasChanges: false, localOnly: [], remoteOnly: [], modified: [] }
  }

  // 获取 masterDir/rules 下所有文件
  const masterFiles = getAllFiles(rulesDir).map((f) =>
    path.relative(masterDir, f).replace(/\\/g, '/')
  )

  // 获取本地各平台 rules 文件
  const localRules = await scanAllRules()
  const localFiles: string[] = []

  for (const rule of localRules) {
    for (const file of rule.files) {
      const dirName = getAppDirName(rule.name)
      const parentDir = path.dirname(rule.sourcePath)
      const relativePath = path.relative(parentDir, file).replace(/\\/g, '/')
      localFiles.push(`${dirName}/${relativePath}`)
    }
  }

  const masterFileSet = new Set(masterFiles.map(f => f.replace(/^rules\//, '')))
  const localFileSet = new Set(localFiles)

  const localOnly = localFiles.filter(f => !masterFileSet.has(f))
  const remoteOnly = masterFiles.map(f => f.replace(/^rules\//, '')).filter(f => !localFileSet.has(f))
  const modified: string[] = [] // 简化：暂不检测修改

  return {
    hasChanges: localOnly.length > 0 || remoteOnly.length > 0,
    localOnly,
    remoteOnly,
    modified,
  }
}

export default {
  rulesAppRegistry,
  detectRulesApp,
  scanAllRules,
  collectRules,
  restoreRules,
  checkRulesChanges,
}
