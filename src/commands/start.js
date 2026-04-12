/**
 * start.js - 自动引导命令
 *
 * 用户运行 skills-sync 无参数时自动执行
 * 根据当前环境自动判断并执行正确的流程
 */

import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import { logger } from '../core/logger.js'
import {
  getDefaultConfig,
  writeConfig,
  configExists,
  readConfig,
} from '../core/config.js'
import { cloneRepo, isGitRepo, initGit, addRemote } from '../core/git.js'
import {
  scanSkills,
  copySkill,
  getDefaultSearchPaths,
  countSkills,
} from '../core/scanner.js'
import { createJunction, checkAllLinks, LinkStatus } from '../core/symlink.js'

/**
 * 获取 skill 的修改时间
 */
function getSkillModTime(skillPath) {
  try {
    const skillFile = path.join(skillPath, 'SKILL.md')
    if (fs.existsSync(skillFile)) {
      const stats = fs.statSync(skillFile)
      return stats.mtime
    }
    const stats = fs.statSync(skillPath)
    return stats.mtime
  } catch {
    return new Date(0)
  }
}

/**
 * 运行自动引导
 */
export async function runStart() {
  logger.title('Skills-Sync')
  logger.newline()

  // 检查是否已设置
  if (configExists()) {
    const config = readConfig()

    // 检查配置是否有效
    if (!config || !config.masterDir) {
      logger.error('配置文件损坏，请检查 config.yaml 或重新运行 setup')
      return
    }

    // 检查 master 目录是否存在且有内容
    if (fs.existsSync(config.masterDir) && countSkills(config.masterDir) > 0) {
      // 已设置，显示状态
      await showStatus(config)
      return
    }
  }

  // 首次使用，开始引导
  await firstTimeSetup()
}

/**
 * 首次设置引导
 */
async function firstTimeSetup() {
  logger.log('欢迎使用 Skills-Sync！')
  logger.newline()

  // 询问 GitHub 仓库
  const { hasGithub } = await inquirer.prompt([
    {
      type: 'list',
      name: 'hasGithub',
      message: '是否已有 GitHub 仓库用于同步 skills？',
      choices: [
        { name: '有，输入仓库地址', value: 'yes' },
        { name: '没有，跳过 Git 同步', value: 'no' },
      ],
      default: 'no',
    },
  ])

  let githubUrl = null

  if (hasGithub === 'yes') {
    const { url } = await inquirer.prompt([
      {
        type: 'input',
        name: 'url',
        message: '请输入 GitHub 仓库地址:',
        validate: (input) => {
          if (!input) return '请输入仓库地址'
          if (!input.includes('github.com')) return '请输入有效的 GitHub 地址'
          return true
        },
      },
    ])
    githubUrl = url
  }

  // 创建默认配置
  const defaultConfig = getDefaultConfig()

  // 设置 Git 配置
  if (githubUrl) {
    defaultConfig.git = {
      enabled: true,
      remote: githubUrl,
      autoPush: true,
    }
  } else {
    defaultConfig.git = {
      enabled: false,
      remote: '',
      autoPush: false,
    }
  }

  // 写入配置
  writeConfig(defaultConfig)
  logger.success('配置已创建')
  logger.newline()

  const masterDir = defaultConfig.masterDir

  // 处理 GitHub 仓库
  if (githubUrl) {
    await setupWithGithub(masterDir, githubUrl, defaultConfig)
  } else {
    await setupWithoutGithub(masterDir, defaultConfig)
  }
}

/**
 * 使用 GitHub 设置
 */
async function setupWithGithub(masterDir, githubUrl, config) {
  // 检查 master 目录是否已存在
  if (fs.existsSync(masterDir)) {
    const entries = fs.readdirSync(masterDir)
    if (entries.length > 0) {
      logger.warn(`目录 ${masterDir} 已存在且不为空`)
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: '如何处理？',
          choices: [
            { name: '删除现有内容，重新克隆', value: 'delete' },
            { name: '保留现有内容，跳过克隆', value: 'keep' },
          ],
          default: 'keep',
        },
      ])

      if (action === 'delete') {
        fs.rmSync(masterDir, { recursive: true, force: true })
      } else {
        // 跳过克隆，直接创建链接
        await createLinks(config)
        showComplete(masterDir, true)
        return
      }
    }
  }

  // 克隆仓库
  logger.info('克隆仓库中...')
  const result = await cloneRepo(githubUrl, masterDir)

  if (!result.success) {
    logger.error(`克隆失败: ${result.message}`)
    logger.hint('请检查仓库地址是否正确，或手动克隆后运行 skills-sync link')
    return
  }

  logger.success('克隆完成！')
  const skillCount = countSkills(masterDir)
  logger.log(`找到 ${skillCount} 个 skills`)
  logger.newline()

  // 扫描本地 skills
  await scanAndMergeLocalSkills(masterDir, config)

  // 创建链接
  await createLinks(config)

  // 显示完成信息
  showComplete(masterDir, true)
}

/**
 * 不使用 GitHub 设置
 */
async function setupWithoutGithub(masterDir, config) {
  // 创建 master 目录
  if (!fs.existsSync(masterDir)) {
    fs.mkdirSync(masterDir, { recursive: true })
  }

  // 扫描本地 skills
  logger.info('扫描本地 skills...')
  const skills = await scanSkills({ searchPaths: getDefaultSearchPaths() })

  if (skills.length === 0) {
    logger.warn('未找到任何 skills')
    logger.hint('请先下载 skills，推荐使用 skills.sh')
    logger.hint('下载后运行 skills-sync import 导入')

    // 仍然创建链接
    await createLinks(config)
    return
  }

  // 按名称分组，选择最新版本
  const groups = {}
  for (const skill of skills) {
    if (!groups[skill.name]) {
      groups[skill.name] = []
    }
    groups[skill.name].push(skill)
  }

  const finalSkills = []
  for (const name of Object.keys(groups)) {
    const duplicates = groups[name]
    duplicates.sort((a, b) => getSkillModTime(b.path) - getSkillModTime(a.path))
    finalSkills.push(duplicates[0])
  }

  logger.log(
    `找到 ${skills.length} 个 skills（去重后 ${finalSkills.length} 个）`,
  )

  // 导入
  logger.newline()
  logger.info('导入中...')

  let importCount = 0
  for (const skill of finalSkills) {
    const result = copySkill(skill.path, masterDir, false)
    if (result.success) {
      logger.success(`${skill.name} 已导入`)
      importCount++
    }
  }

  logger.success(`已导入 ${importCount} 个 skills`)
  logger.newline()

  // 创建链接
  await createLinks(config)

  // 显示完成信息
  showComplete(masterDir, false)
}

/**
 * 扫描并合并本地 skills
 */
async function scanAndMergeLocalSkills(masterDir, config) {
  logger.info('扫描本地 skills...')
  const skills = await scanSkills({ searchPaths: getDefaultSearchPaths() })

  if (skills.length === 0) {
    return
  }

  // 过滤掉已在 master 中的
  const existingNames = new Set(
    fs
      .readdirSync(masterDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  )

  const newSkills = skills.filter((s) => !existingNames.has(s.name))

  if (newSkills.length === 0) {
    return
  }

  // 按名称分组
  const groups = {}
  for (const skill of newSkills) {
    if (!groups[skill.name]) {
      groups[skill.name] = []
    }
    groups[skill.name].push(skill)
  }

  const finalSkills = []
  for (const name of Object.keys(groups)) {
    const duplicates = groups[name]
    duplicates.sort((a, b) => getSkillModTime(b.path) - getSkillModTime(a.path))
    finalSkills.push(duplicates[0])
  }

  logger.log(`发现 ${finalSkills.length} 个本地 skills 不在仓库中`)

  const { shouldMerge } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'shouldMerge',
      message: '是否合并到 master 目录？',
      default: true,
    },
  ])

  if (!shouldMerge) {
    return
  }

  // 导入
  let importCount = 0
  for (const skill of finalSkills) {
    const result = copySkill(skill.path, masterDir, false)
    if (result.success) {
      importCount++
    }
  }

  if (importCount > 0) {
    logger.success(`已合并 ${importCount} 个 skills`)
  }
}

/**
 * 创建符号链接
 */
async function createLinks(config) {
  logger.info('创建符号链接...')

  const enabledApps = config.apps?.filter((app) => app.enabled !== false) || []
  let linkCount = 0

  for (const app of enabledApps) {
    const parentDir = path.dirname(app.skillsPath)
    if (!fs.existsSync(parentDir)) {
      logger.log(`  ${logger.dim('○')} ${app.name} 未安装，跳过`)
      continue
    }

    const result = createJunction(config.masterDir, app.skillsPath, false)
    if (result.success) {
      logger.success(`${app.name} 已链接`)
      linkCount++
    } else {
      logger.error(`${app.name} 链接失败`)
    }
  }

  if (linkCount > 0) {
    logger.success(`已为 ${linkCount} 个应用创建链接`)
  }

  logger.newline()
}

/**
 * 显示状态（已设置用户）- 全自动模式
 */
async function showStatus(config) {
  let hasChanges = false

  // 1. 检测新的本地 skills
  logger.info('检测新 skills...')
  const newSkillsCount = await autoImportNewSkills(config)
  if (newSkillsCount > 0) {
    hasChanges = true
  }

  // 2. 如果有变更且有 GitHub，自动同步
  if (hasChanges && config.git?.enabled && config.git?.remote) {
    logger.newline()
    logger.info('同步到 GitHub...')
    await autoSync(config)
  }

  // 3. 显示最终状态
  logger.newline()
  logger.log('━━━━━━━━━━━━━━━━━━━━━━━━')
  logger.log('Skills-Sync 状态')
  logger.log('━━━━━━━━━━━━━━━━━━━━━━━━')

  const skillCount = countSkills(config.masterDir)
  logger.log(`Master 目录: ${config.masterDir}（${skillCount} 个 skills）`)

  if (config.git?.enabled) {
    logger.log(`Git 同步: ${config.git.remote || '已启用'}`)
  } else {
    logger.log('Git 同步: 未启用')
  }

  logger.newline()

  // 链接状态
  logger.log('链接状态:')
  const linkStatuses = checkAllLinks(config)

  let problemCount = 0

  for (const { app, status } of linkStatuses) {
    if (status === LinkStatus.OK) {
      logger.success(`${app.name} 已链接`)
    } else if (status === LinkStatus.NOT_INSTALLED) {
      logger.log(`  ${logger.dim('○')} ${app.name} 未安装`)
    } else {
      logger.warn(`${app.name} 需要修复`)
      problemCount++
    }
  }

  logger.newline()

  if (problemCount > 0) {
    logger.warn(`${problemCount} 个应用需要修复`)
    logger.hint('运行 skills-sync link 修复链接')
  }
}

/**
 * 自动导入新 skills
 */
async function autoImportNewSkills(config) {
  const masterDir = config.masterDir

  // 扫描本地 skills
  const skills = await scanSkills({ searchPaths: getDefaultSearchPaths() })

  if (skills.length === 0) {
    return 0
  }

  // 获取 master 中已有的 skills
  const existingNames = new Set(
    fs
      .readdirSync(masterDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name),
  )

  // 过滤出新 skills
  const newSkills = skills.filter((s) => !existingNames.has(s.name))

  if (newSkills.length === 0) {
    return 0
  }

  // 按名称分组，选择最新版本
  const groups = {}
  for (const skill of newSkills) {
    if (!groups[skill.name]) {
      groups[skill.name] = []
    }
    groups[skill.name].push(skill)
  }

  const finalSkills = []
  for (const name of Object.keys(groups)) {
    const duplicates = groups[name]
    duplicates.sort((a, b) => getSkillModTime(b.path) - getSkillModTime(a.path))
    finalSkills.push(duplicates[0])
  }

  // 自动导入
  let importCount = 0
  for (const skill of finalSkills) {
    const result = copySkill(skill.path, masterDir, false)
    if (result.success) {
      logger.success(`已导入 ${skill.name}`)
      importCount++
    }
  }

  if (importCount > 0) {
    logger.success(`检测到 ${importCount} 个新 skills，已自动导入`)
  }

  return importCount
}

/**
 * 自动同步到 GitHub
 */
async function autoSync(config) {
  try {
    const { commitChanges, pushToRemote } = await import('../core/git.js')

    const masterDir = config.masterDir

    // 提交
    const timestamp = new Date()
      .toISOString()
      .replace('T', ' ')
      .substring(0, 19)
    const commitResult = await commitChanges(masterDir, `sync: ${timestamp}`)

    if (!commitResult.success) {
      if (commitResult.message.includes('没有需要同步')) {
        return
      }
      logger.error(`提交失败: ${commitResult.message}`)
      return
    }

    // 推送
    const pushResult = await pushToRemote(masterDir)

    if (pushResult.success) {
      logger.success('已同步到 GitHub')
    } else {
      logger.error(`推送失败: ${pushResult.message}`)
    }
  } catch (error) {
    logger.error(`同步失败: ${error.message}`)
  }
}

/**
 * 显示完成信息
 */
function showComplete(masterDir, hasGit) {
  logger.log('━━━━━━━━━━━━━━━━━━━━━━━━')
  logger.success('设置完成！')
  logger.log('━━━━━━━━━━━━━━━━━━━━━━━━')

  const skillCount = countSkills(masterDir)
  logger.log(`Master 目录: ${masterDir}（${skillCount} 个 skills）`)
  logger.log(`Git 同步: ${hasGit ? '已启用' : '未启用'}`)

  logger.newline()

  if (hasGit) {
    logger.hint('运行 skills-sync sync 同步到 GitHub')
  } else {
    logger.hint('可在 config.yaml 中配置 Git 同步')
  }
}

export default { runStart }
