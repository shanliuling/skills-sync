# SkillsSync CLI — 实施提示词

> 直接复制以下内容给任意 AI 实施。

---

## 提示词正文

请帮我构建一个名为 **skills-sync** 的 Node.js CLI 工具，用于在多个 AI 应用之间同步本地 skills 文件夹。

---

### 背景

我在 Windows 上使用多个 AI 应用（Claude、Gemini CLI、Codex 等），每个应用都有自己读取 skills 的目录。我希望维护一个 master skills 文件夹，通过 Junction symlink 自动同步到所有 AI 应用目录，并可选备份到 Git 远端。

我目前已有通过 `skill.sh` 下载的 skills，分散在电脑某些目录里，需要工具帮我扫描并导入。

---

### 技术栈

- **运行环境**：Node.js 18+，ESM 模块（`"type": "module"`）
- **依赖库**：
  - `commander` — 命令解析
  - `chokidar` — 文件监听
  - `simple-git` — Git 操作
  - `js-yaml` — 读写 YAML 配置
  - `inquirer` — 交互式终端提示
  - `chalk` — 终端颜色输出
  - `glob` — 文件扫描
- **Symlink**：通过 PowerShell 创建 Windows Junction（不需要管理员权限）
- **发布**：发布到 npm，支持 `npm i -g skills-sync` 全局安装

---

### 项目结构

```
skills-sync/
├── package.json
├── bin/
│   └── skills-sync.js        # CLI 入口，#!/usr/bin/env node
├── src/
│   ├── commands/
│   │   ├── setup.js          # 初始化配置
│   │   ├── import.js         # 扫描并导入现有 skills
│   │   ├── link.js           # 创建 symlink
│   │   ├── sync.js           # 手动 Git 同步
│   │   ├── watch.js          # 文件监听
│   │   ├── health.js         # 健康检查
│   │   ├── rollback.js       # Git 回滚
│   │   └── app.js            # app add / app list
│   └── core/
│       ├── config.js         # 读写 config.yaml
│       ├── symlink.js        # Junction 创建/验证
│       ├── git.js            # Git 操作封装
│       ├── scanner.js        # 扫描现有 skills 目录
│       └── logger.js         # chalk 日志封装
├── config.yaml               # 用户配置（自动生成，不进 Git）
└── README.md
```

---

### config.yaml 格式

```yaml
masterDir: "C:/Users/USERNAME/AISkills"
git:
  enabled: false              # Git 为可选项，false 时所有 git 命令跳过
  remote: ""
  autoPush: true
watch:
  enabled: false
  debounceMs: 3000
apps:
  - name: "Claude"
    skillsPath: "C:/Users/USERNAME/AppData/Roaming/Claude/skills"
    enabled: true
  - name: "Gemini CLI"
    skillsPath: "C:/Users/USERNAME/.gemini/skills"
    enabled: true
  - name: "Codex"
    skillsPath: "C:/Users/USERNAME/.codex/skills"
    enabled: true
```

---

### 命令详细说明

#### `skills-sync setup`

引导用户完成初始化：

1. 询问 master 目录路径（默认 `C:/Users/USERNAME/AISkills`）
2. 询问是否启用 Git（可选），若是则询问远端地址
3. 询问是否启用 watch 自动同步
4. 生成 `config.yaml`
5. 若 master 目录不存在则创建
6. 若启用 Git，自动执行 `git init`，若有远端则 `git remote add origin`

输出示例：
```
✔ Master 目录已创建：C:/Users/user/AISkills
✔ config.yaml 已生成
✔ Git 已初始化
→ 下一步：运行 skills-sync import 导入现有 skills
```

---

#### `skills-sync import`

扫描电脑上已有的 skills，导入到 master 目录。

**扫描逻辑：**

在以下路径递归搜索，找到包含 `SKILL.md` 文件的目录，视为一个 skill：

```
C:/Users/USERNAME/
├── .claude/
├── .gemini/
├── .codex/
├── AppData/Roaming/
├── AppData/Local/
├── Desktop/
├── Documents/
└── Downloads/
```

扫描时忽略 `node_modules`、`.git` 目录，递归深度不超过 6 层。

**交互流程：**

1. 显示所有找到的 skill 列表，带路径和来源应用
2. 用 `inquirer` checkbox 让用户勾选要导入哪些
3. 确认后复制到 `masterDir/`，保留 skill 目录名
4. 若 master 目录已有同名 skill，询问是否覆盖

输出示例：
```
扫描中...

找到以下 skills：
  ✔ docx          来自 C:/Users/user/.claude/skills/docx
  ✔ pdf           来自 C:/Users/user/.gemini/skills/pdf
  ✔ pptx          来自 C:/Users/user/Documents/skills/pptx

? 选择要导入的 skills（空格勾选）
❯ ◉ docx
  ◉ pdf
  ◉ pptx

✔ 已导入 3 个 skills 到 C:/Users/user/AISkills
→ 下一步：运行 skills-sync link 创建符号链接
```

---

#### `skills-sync link`

为 config 中所有 `enabled: true` 的应用创建 Junction symlink。

**实现细节：**

使用 PowerShell 创建 Junction（目录级 symlink，Windows 上无需管理员权限）：

```js
import { execSync } from 'child_process'

export function createJunction(target, linkPath) {
  // 若 linkPath 是普通目录（非 junction），先备份
  const ps = `
    if (Test-Path "${linkPath}") {
      $item = Get-Item "${linkPath}"
      if ($item.Attributes -notmatch 'ReparsePoint') {
        Rename-Item "${linkPath}" "${linkPath}.backup"
        Write-Host "已备份原目录为 ${linkPath}.backup"
      } else {
        Remove-Item "${linkPath}" -Force
      }
    }
    New-Item -ItemType Junction -Path "${linkPath}" -Target "${target}" | Out-Null
    Write-Host "OK"
  `
  execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'pipe' })
}
```

**支持参数：**
- `--app <name>` — 只为指定应用创建链接，例如 `skills-sync link --app Codex`
- `--dry-run` — 打印将要执行的操作，不真正执行

输出示例：
```
✔ Claude       → C:/Users/user/AppData/Roaming/Claude/skills
✔ Gemini CLI   → C:/Users/user/.gemini/skills
✗ Codex        路径不存在，已跳过：C:/Users/user/.codex
```

---

#### `skills-sync sync`

手动触发 Git 同步。若 `git.enabled: false` 则提示未启用并退出。

```
skills-sync sync
skills-sync sync -m "add docx skill"   # 自定义 commit message
```

流程：`git add .` → `git commit -m "sync: {timestamp}"` → `git push`

若无新变更则提示"没有需要同步的内容"，不创建空 commit。

---

#### `skills-sync watch`

启动文件监听，master 目录有变更时自动触发 sync。

- 用 `chokidar` 监听 masterDir
- debounce 默认 3000ms（可在 config 配置）
- 忽略 `.git` 目录
- Ctrl+C 退出时打印"已停止监听"
- 若 `git.enabled: false`，watch 仍然运行但跳过 push，只打印变更日志

```
skills-sync watch

● 监听中：C:/Users/user/AISkills
  变更：docx/SKILL.md
  ✔ 已同步到 Git（commit: a3f2c1）
```

---

#### `skills-sync health`

检查所有 symlink 状态，输出报告。

每个应用检查：
1. 目标路径是否存在
2. 是否是 Junction
3. Junction 是否指向正确的 masterDir

状态分四种：
- `ok` — 正常
- `wrong-target` — 是 Junction 但指向错误目录
- `not-linked` — 路径存在但不是 Junction
- `missing` — 路径不存在

```
skills-sync health

应用状态检查：
✔ Claude        ok
✔ Gemini CLI    ok
✗ Codex         missing  →  运行 skills-sync link --app Codex 修复
⚠ OpenClaw      wrong-target  →  运行 skills-sync link --app OpenClaw 修复

Master 目录：C:/Users/user/AISkills（12 个 skills）
Git 状态：已启用，最后同步 2 分钟前
```

---

#### `skills-sync app add`

交互式添加新 AI 应用到 config：

```
? 应用名称：Antigravity
? Skills 路径：C:/Users/user/.antigravity/skills
? 立即创建 symlink？Yes

✔ 已添加 Antigravity 到 config.yaml
✔ Symlink 已创建
```

#### `skills-sync app list`

列出所有已配置应用，等同于 `health` 的应用部分。

---

#### `skills-sync rollback`

仅在 `git.enabled: true` 时可用。

1. 列出最近 10 条 commit（hash 前 7 位 + message + 时间）
2. 用 `inquirer` 让用户选择
3. 执行 `git checkout <hash> -- .` 还原文件
4. 自动创建一条新 commit `rollback to <hash>`

```
? 选择要回滚的版本：
❯ a3f2c1  sync: 2024-01-15T10:30:00  (2 小时前)
  b7e4d2  add pptx skill             (昨天)
  c9f1a3  sync: 2024-01-14T08:00:00  (昨天)

✔ 已回滚到 a3f2c1
✔ 新 commit 已创建
```

---

### 错误处理要求

所有命令都要处理以下错误情况，给出中文提示和解决建议：

| 错误场景 | 提示内容 |
|---------|---------|
| config.yaml 不存在 | "请先运行 skills-sync setup 初始化配置" |
| masterDir 不存在 | "Master 目录不存在，请检查 config.yaml 中的 masterDir 路径" |
| PowerShell 调用失败 | "创建符号链接失败，请确认 PowerShell 可用。错误：{原始错误}" |
| Git push 失败（网络） | "推送失败，请检查网络或 Git 远端地址是否正确" |
| Git push 失败（未登录） | "Git 认证失败，请先配置 Git 凭据" |
| 应用路径不存在 | "路径不存在，已跳过。该 AI 应用可能未安装或路径有误" |

---

### package.json 关键字段

```json
{
  "name": "skills-sync",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "skills-sync": "./bin/skills-sync.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": ["skills", "ai", "sync", "claude", "gemini", "cli"],
  "scripts": {
    "start": "node bin/skills-sync.js",
    "dev": "node --watch bin/skills-sync.js"
  }
}
```

---

### README.md 要包含

1. 一句话介绍
2. 安装：`npm i -g skills-sync`
3. 快速开始（3 步：setup → import → link）
4. 完整命令列表和参数说明
5. config.yaml 字段说明
6. 常见问题（PowerShell 报错、Git 认证等）
7. 如何添加新 AI 应用

---

### 交付要求

1. 所有文件完整可运行，不留 TODO 占位
2. 文件逐个输出，不要一次全部输出
3. 先输出 `package.json` 和 `src/core/` 核心模块，再输出各命令
4. 每个文件开头注释说明该文件的职责
5. 支持 Windows 11 / Windows 10

---

*此提示词由 Claude 生成，适用于 Claude / Gemini / Copilot / GPT-4 等 AI 实施。*
