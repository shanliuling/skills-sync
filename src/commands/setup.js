/**
 * setup.js - 初始化配置命令
 *
 * 引导用户完成初始化：创建 master 目录、生成 config.yaml、初始化 Git（可选）
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import inquirer from 'inquirer'
import { logger } from '../core/logger.js'
import { getDefaultConfig, writeConfig, configExists } from '../core/config.js'
import { initGit, addRemote } from '../core/git.js'

/**
 * 运行 setup 命令
 */
export async function runSetup() {
  logger.title('Skills-Sync 初始化配置')
  logger.newline()

  // 检查是否已存在配置
  if (configExists()) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'config.yaml 已存在，是否覆盖？',
        default: false,
      },
    ])

    if (!overwrite) {
      logger.info('已取消')
      return
    }
  }

  // 获取默认配置
  const defaultConfig = getDefaultConfig()
  const username = os.userInfo().username

  // 询问配置
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'masterDir',
      message: 'Master 目录路径（存放所有 skills）',
      default: defaultConfig.masterDir,
      validate: (input) => {
        if (!input.trim()) return '请输入路径'
        return true
      },
    },
    {
      type: 'confirm',
      name: 'enableGit',
      message: '是否启用 Git 同步（可选）',
      default: false,
    },
    {
      type: 'input',
      name: 'gitRemote',
      message: 'Git 远端地址（可选，留空跳过）',
      when: (ans) => ans.enableGit,
      default: '',
    },
    {
      type: 'confirm',
      name: 'enableWatch',
      message: '是否启用文件监听自动同步',
      default: false,
    },
    {
      type: 'number',
      name: 'debounceMs',
      message: '监听防抖时间（毫秒）',
      default: 3000,
      when: (ans) => ans.enableWatch,
    },
  ])

  // 构建配置对象
  const config = {
    masterDir: answers.masterDir,
    git: {
      enabled: answers.enableGit,
      remote: answers.gitRemote || '',
      autoPush: true,
    },
    watch: {
      enabled: answers.enableWatch,
      debounceMs: answers.debounceMs || 3000,
    },
    apps: defaultConfig.apps,
  }

  // 创建 master 目录
  if (!fs.existsSync(config.masterDir)) {
    try {
      fs.mkdirSync(config.masterDir, { recursive: true })
      logger.success(`Master 目录已创建: ${config.masterDir}`)
    } catch (error) {
      logger.error(`创建目录失败: ${error.message}`)
      return
    }
  } else {
    logger.success(`Master 目录已存在: ${config.masterDir}`)
  }

  // 写入配置文件
  if (writeConfig(config)) {
    logger.success('config.yaml 已生成')
  } else {
    logger.error('写入配置文件失败')
    return
  }

  // 初始化 Git
  if (config.git.enabled) {
    const result = await initGit(config.masterDir)
    if (result.success) {
      logger.success(result.message)

      // 添加远端
      if (config.git.remote) {
        const remoteResult = await addRemote(
          config.masterDir,
          config.git.remote,
        )
        if (remoteResult.success) {
          logger.success(remoteResult.message)
        } else {
          logger.error(remoteResult.message)
        }
      }
    } else {
      logger.error(result.message)
    }
  }

  logger.newline()
  logger.hint('下一步：运行 skills-sync import 导入现有 skills')
}

export default { runSetup }
