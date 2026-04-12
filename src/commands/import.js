/**
 * import.js - 扫描并导入现有 skills 命令
 *
 * 扫描电脑上已有的 skills，让用户选择要导入的 skills，复制到 master 目录
 * 同名 skill 自动选择最新版本
 * 支持 -y 参数跳过所有确认
 */

import fs from 'fs'
import path from 'path'
import inquirer from 'inquirer'
import { logger } from '../core/logger.js'
import { ensureConfig } from '../core/config.js'
import { scanSkills, copySkill } from '../core/scanner.js'

/**
 * 获取 skill 的修改时间
 * @param {string} skillPath - skill 路径
 * @returns {Date} 修改时间
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
 * 按名称分组 skills，同名时选择最新版本
 * @param {Array} skills - skills 列表
 * @returns {Object} 分组后的 skills { name: [skill1, skill2, ...] }
 */
function groupSkillsByName(skills) {
  const groups = {}
  for (const skill of skills) {
    if (!groups[skill.name]) {
      groups[skill.name] = []
    }
    groups[skill.name].push(skill)
  }
  return groups
}

/**
 * 从同名 skills 中选择最新版本
 * @param {Array} skills - 同名的 skills 列表
 * @returns {Object} 最新的 skill
 */
function selectLatestSkill(skills) {
  return skills.reduce((latest, current) => {
    const latestTime = getSkillModTime(latest.path)
    const currentTime = getSkillModTime(current.path)
    return currentTime > latestTime ? current : latest
  })
}

/**
 * 格式化时间显示
 * @param {Date} date - 日期
 * @returns {string} 格式化后的时间
 */
function formatTime(date) {
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 运行 import 命令
 * @param {Object} options - 命令选项
 * @param {boolean} options.yes - 跳过所有确认
 */
export async function runImport(options = {}) {
  const { yes = false } = options

  // 检查配置
  const { exists, config } = ensureConfig()
  if (!exists) return

  // 自动创建 master 目录（如果不存在）
  if (!fs.existsSync(config.masterDir)) {
    if (yes) {
      fs.mkdirSync(config.masterDir, { recursive: true })
      logger.success(`已创建 Master 目录: ${config.masterDir}`)
    } else {
      const { create } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'create',
          message: `Master 目录不存在，是否创建？`,
          default: true,
        },
      ])
      if (create) {
        fs.mkdirSync(config.masterDir, { recursive: true })
        logger.success(`已创建 Master 目录: ${config.masterDir}`)
      } else {
        return
      }
    }
  }

  logger.title('扫描现有 Skills')
  logger.newline()

  // 扫描 skills
  const skills = await scanSkills()

  if (skills.length === 0) {
    logger.warn('未找到任何 skills')
    logger.hint('Skills 是包含 SKILL.md 文件的目录')
    return
  }

  // 按名称分组
  const groups = groupSkillsByName(skills)
  const duplicateNames = Object.keys(groups).filter(
    (name) => groups[name].length > 1,
  )

  // 自动选择最新版本
  let finalSkills = []

  if (duplicateNames.length > 0 && !yes) {
    // 交互模式：让用户选择
    logger.warn(
      `发现 ${duplicateNames.length} 个同名 skills，请选择要保留的版本：`,
    )
    logger.newline()

    for (const name of duplicateNames) {
      const duplicates = groups[name]
      // 按时间排序（最新的在前）
      duplicates.sort((a, b) => {
        const timeA = getSkillModTime(a.path)
        const timeB = getSkillModTime(b.path)
        return timeB - timeA
      })

      // 显示各版本信息
      logger.log(`  ${logger.bold(name)}:`)
      duplicates.forEach((skill, index) => {
        const time = getSkillModTime(skill.path)
        const timeStr = formatTime(time)
        const latest = index === 0 ? logger.successText('(最新)') : ''
        logger.log(
          `    ${index + 1}. ${logger.dim(skill.sourceApp)} - ${timeStr} ${latest}`,
        )
      })

      // 让用户选择
      const { choice } = await inquirer.prompt([
        {
          type: 'list',
          name: 'choice',
          message: `选择要导入的 ${name} 版本`,
          choices: duplicates.map((skill, index) => ({
            name: `${skill.sourceApp} - ${formatTime(getSkillModTime(skill.path))}${index === 0 ? ' (最新)' : ''}`,
            value: skill,
          })),
          default: 0,
        },
      ])

      finalSkills.push(choice)
      logger.newline()
    }
  } else {
    // 自动模式：选择最新版本
    for (const name of Object.keys(groups)) {
      const duplicates = groups[name]
      duplicates.sort(
        (a, b) => getSkillModTime(b.path) - getSkillModTime(a.path),
      )
      finalSkills.push(duplicates[0])
    }
  }

  // 添加非重复的 skills（如果还没有添加）
  const uniqueNames = Object.keys(groups).filter(
    (name) => groups[name].length === 1,
  )
  for (const name of uniqueNames) {
    if (!finalSkills.find((s) => s.name === name)) {
      finalSkills.push(groups[name][0])
    }
  }

  // 显示所有将要导入的 skills
  if (!yes) {
    logger.log('将要导入的 skills：')
    logger.newline()

    finalSkills.forEach((skill) => {
      const padEnd = 15
      const name =
        skill.name.length > padEnd - 1
          ? skill.name.substring(0, padEnd - 2) + '..'
          : skill.name
      logger.log(
        `  ${logger.dim('✔')} ${name.padEnd(padEnd)} 来自 ${skill.sourceApp}`,
      )
    })
    logger.newline()

    // 确认导入
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `确认导入 ${finalSkills.length} 个 skills？`,
        default: true,
      },
    ])

    if (!confirm) {
      logger.info('已取消')
      return
    }
  }

  // 检查 master 中已存在的同名 skills
  const existingSkills = []
  const newSkills = []

  for (const skill of finalSkills) {
    const destPath = path.join(config.masterDir, skill.name)
    if (fs.existsSync(destPath)) {
      existingSkills.push(skill)
    } else {
      newSkills.push(skill)
    }
  }

  // 处理已存在的 skills
  let overwrite = false
  if (existingSkills.length > 0) {
    if (!yes) {
      logger.newline()
      logger.warn(`发现 ${existingSkills.length} 个与 master 中同名的 skills:`)
      existingSkills.forEach((s) => {
        const masterSkill = path.join(config.masterDir, s.name)
        const masterTime = getSkillModTime(masterSkill)
        const importTime = getSkillModTime(s.path)
        const isNewer = importTime > masterTime
        logger.log(
          `  - ${s.name} ${isNewer ? logger.successText('(导入版本更新)') : logger.dim('(master 版本更新)')}`,
        )
      })

      const { overwriteChoice } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwriteChoice',
          message: '是否覆盖这些同名 skills？',
          default: true,
        },
      ])

      overwrite = overwriteChoice
    } else {
      // 自动模式：只覆盖更新的版本
      overwrite = true
      // 过滤掉旧版本
      finalSkills = finalSkills.filter((s) => {
        const destPath = path.join(config.masterDir, s.name)
        if (fs.existsSync(destPath)) {
          const destTime = getSkillModTime(destPath)
          const srcTime = getSkillModTime(s.path)
          return srcTime > destTime
        }
        return true
      })
    }

    if (!overwrite && !yes) {
      // 从导入列表中移除已存在的
      finalSkills = finalSkills.filter((s) => !existingSkills.includes(s))

      if (finalSkills.length === 0) {
        logger.info('没有需要导入的新 skills')
        return
      }
    }
  }

  // 导入 skills
  logger.newline()
  logger.info('开始导入...')

  let successCount = 0
  let failCount = 0

  for (const skill of finalSkills) {
    const isExisting = existingSkills.some((s) => s.name === skill.name)
    const result = copySkill(
      skill.path,
      config.masterDir,
      isExisting && overwrite,
    )

    if (result.success) {
      logger.success(`${skill.name} 已导入`)
      successCount++
    } else if (result.skipped) {
      logger.warn(result.message)
    } else {
      logger.error(`${skill.name}: ${result.message}`)
      failCount++
    }
  }

  // 输出结果
  logger.newline()
  if (successCount > 0) {
    logger.success(`已导入 ${successCount} 个 skills 到 ${config.masterDir}`)
  }
  if (failCount > 0) {
    logger.error(`${failCount} 个 skills 导入失败`)
  }

  logger.newline()
  logger.hint('下一步：运行 skills-sync link 创建符号链接')
}

export default { runImport }
