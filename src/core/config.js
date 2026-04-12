/**
 * config.js - 读写 config.yaml
 *
 * 提供 config.yaml 的读取、写入、验证、默认配置生成等功能
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import yaml from 'js-yaml'
import { logger } from './logger.js'

// 配置文件名
const CONFIG_FILENAME = 'config.yaml'

/**
 * 获取默认配置
 * @returns {Object} 默认配置对象
 */
export function getDefaultConfig() {
  const username = os.userInfo().username
  return {
    masterDir: `C:/Users/${username}/AISkills`,
    git: {
      enabled: false,
      remote: '',
      autoPush: true,
    },
    watch: {
      enabled: false,
      debounceMs: 3000,
    },
    apps: [
      {
        name: 'Claude',
        skillsPath: `C:/Users/${username}/AppData/Roaming/Claude/skills`,
        enabled: true,
      },
      {
        name: 'Gemini CLI',
        skillsPath: `C:/Users/${username}/.gemini/skills`,
        enabled: true,
      },
      {
        name: 'Codex',
        skillsPath: `C:/Users/${username}/.codex/skills`,
        enabled: true,
      },
    ],
  }
}

/**
 * 获取配置文件路径
 * @param {string} cwd - 当前工作目录
 * @returns {string} 配置文件完整路径
 */
export function getConfigPath(cwd = process.cwd()) {
  return path.join(cwd, CONFIG_FILENAME)
}

/**
 * 检查配置文件是否存在
 * @param {string} cwd - 当前工作目录
 * @returns {boolean} 是否存在
 */
export function configExists(cwd = process.cwd()) {
  return fs.existsSync(getConfigPath(cwd))
}

/**
 * 读取配置文件
 * @param {string} cwd - 当前工作目录
 * @returns {Object|null} 配置对象，不存在则返回 null
 */
export function readConfig(cwd = process.cwd()) {
  const configPath = getConfigPath(cwd)

  if (!fs.existsSync(configPath)) {
    return null
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    return yaml.load(content)
  } catch (error) {
    logger.error(`读取配置文件失败: ${error.message}`)
    return null
  }
}

/**
 * 写入配置文件
 * @param {Object} config - 配置对象
 * @param {string} cwd - 当前工作目录
 * @returns {boolean} 是否成功
 */
export function writeConfig(config, cwd = process.cwd()) {
  const configPath = getConfigPath(cwd)

  try {
    const content = yaml.dump(config, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
    })
    fs.writeFileSync(configPath, content, 'utf-8')
    return true
  } catch (error) {
    logger.error(`写入配置文件失败: ${error.message}`)
    return false
  }
}

/**
 * 验证配置文件完整性
 * @param {Object} config - 配置对象
 * @returns {{ valid: boolean, errors: string[] }} 验证结果
 */
export function validateConfig(config) {
  const errors = []

  if (!config) {
    errors.push('配置为空')
    return { valid: false, errors }
  }

  if (!config.masterDir) {
    errors.push('缺少 masterDir 配置')
  }

  if (!config.git || typeof config.git.enabled !== 'boolean') {
    errors.push('缺少 git.enabled 配置')
  }

  if (!config.apps || !Array.isArray(config.apps)) {
    errors.push('缺少 apps 配置')
  } else {
    config.apps.forEach((app, index) => {
      if (!app.name) {
        errors.push(`apps[${index}] 缺少 name`)
      }
      if (!app.skillsPath) {
        errors.push(`apps[${index}] 缺少 skillsPath`)
      }
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 确保配置文件存在，不存在则提示错误
 * @param {string} cwd - 当前工作目录
 * @returns {{ exists: boolean, config: Object|null }} 结果
 */
export function ensureConfig(cwd = process.cwd()) {
  const config = readConfig(cwd)

  if (!config) {
    logger.error('请先运行 skills-sync setup 初始化配置')
    return { exists: false, config: null }
  }

  const { valid, errors } = validateConfig(config)

  if (!valid) {
    logger.error('配置文件格式有误:')
    errors.forEach((err) => logger.error(`  - ${err}`))
    return { exists: false, config: null }
  }

  return { exists: true, config }
}

/**
 * 获取启用状态的应用列表
 * @param {Object} config - 配置对象
 * @returns {Array} 启用的应用列表
 */
export function getEnabledApps(config) {
  if (!config || !config.apps) return []
  return config.apps.filter((app) => app.enabled !== false)
}

/**
 * 根据名称查找应用
 * @param {Object} config - 配置对象
 * @param {string} name - 应用名称
 * @returns {Object|null} 应用对象
 */
export function findAppByName(config, name) {
  if (!config || !config.apps) return null
  return config.apps.find(
    (app) => app.name.toLowerCase() === name.toLowerCase(),
  )
}

/**
 * 添加应用到配置
 * @param {Object} config - 配置对象
 * @param {Object} app - 应用对象 { name, skillsPath, enabled }
 * @returns {Object} 更新后的配置
 */
export function addApp(config, app) {
  const newConfig = { ...config }
  newConfig.apps = [...(newConfig.apps || []), app]
  return newConfig
}

/**
 * 更新配置中的应用
 * @param {Object} config - 配置对象
 * @param {string} name - 应用名称
 * @param {Object} updates - 更新内容
 * @returns {Object} 更新后的配置
 */
export function updateApp(config, name, updates) {
  const newConfig = { ...config }
  newConfig.apps = newConfig.apps.map((app) =>
    app.name.toLowerCase() === name.toLowerCase()
      ? { ...app, ...updates }
      : app,
  )
  return newConfig
}

export default {
  getDefaultConfig,
  getConfigPath,
  configExists,
  readConfig,
  writeConfig,
  validateConfig,
  ensureConfig,
  getEnabledApps,
  findAppByName,
  addApp,
  updateApp,
}
