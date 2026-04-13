/**
 * path-detect.js - 路径智能探测模块
 *
 * 自动探测 AI 应用的 skills 路径，支持非 C 盘和自定义安装目录
 */

import fs from 'fs'
import path from 'path'
import os from 'os'

const APP_DEFINITIONS = [
  {
    name: 'Claude',
    candidates: [
      () => path.join(os.homedir(), 'AppData/Roaming/Claude/skills'),
      () => path.join(process.env.APPDATA || '', 'Claude/skills'),
      () => path.join(process.env.LOCALAPPDATA || '', 'Claude/skills'),
      () => `C:/Users/${os.userInfo().username}/AppData/Roaming/Claude/skills`,
    ],
  },
  {
    name: 'Gemini CLI',
    candidates: [
      () => path.join(os.homedir(), '.gemini/skills'),
      () =>
        process.env.USERPROFILE
          ? path.join(process.env.USERPROFILE, '.gemini/skills')
          : null,
      () => `C:/Users/${os.userInfo().username}/.gemini/skills`,
    ],
  },
  {
    name: 'Codex',
    candidates: [
      () => path.join(os.homedir(), '.codex/skills'),
      () => process.env.USERPROFILE ? path.join(process.env.USERPROFILE, '.codex/skills') : null,
      () => `C:/Users/${os.userInfo().username}/.codex/skills`,
    ],
  },
]

export function detectAppPath(appName) {
  const appDef = APP_DEFINITIONS.find(
    (a) => a.name.toLowerCase() === appName.toLowerCase()
  )
  
  if (!appDef) return null

  for (const getCandidate of appDef.candidates) {
    try {
      const candidatePath = getCandidate()
      if (candidatePath && fs.existsSync(candidatePath)) {
        return candidatePath
      }
    } catch {
      // ignore
    }
  }

  // 回退到第一个候选路径（即使不存在）
  const fallback = appDef.candidates[0]()
  return fallback || null
}

export function detectAllAppPaths() {
  const results = []
  
  for (const appDef of APP_DEFINITIONS) {
    const detectedPath = detectAppPath(appDef.name)
    const exists = detectedPath ? fs.existsSync(detectedPath) : false
    
    results.push({
      name: appDef.name,
      skillsPath: detectedPath,
      exists,
    })
  }
  
  return results
}

export function detectMasterDir() {
  const homeDir = os.homedir()
  const candidates = [
    path.join(homeDir, 'AISkills'),
    path.join(homeDir, 'Documents/AISkills'),
    `C:/Users/${os.userInfo().username}/AISkills`,
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[0]
}

export function mergeWithExistingConfig(detectedApps, existingConfig) {
  if (!existingConfig || !existingConfig.apps) {
    return detectedApps
  }

  return detectedApps.map((detected) => {
    const existing = existingConfig.apps.find(
      (a) => a.name.toLowerCase() === detected.name.toLowerCase()
    )
    
    if (existing && existing.skillsPath) {
      return {
        ...detected,
        skillsPath: existing.skillsPath,
        exists: fs.existsSync(existing.skillsPath),
        enabled: existing.enabled !== false,
      }
    }
    
    return detected
  })
}

export default {
  detectAppPath,
  detectAllAppPaths,
  detectMasterDir,
  mergeWithExistingConfig,
}
