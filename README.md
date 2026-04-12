# Skills-Sync

在多个 AI 应用之间同步本地 skills 文件夹的 CLI 工具。

## 安装

```bash
npm i -g skills-sync
```

## 快速开始

只需一个命令：

```bash
skills-sync
```

系统会自动检测您的环境并引导完成设置！

---

### 首次使用

运行 `skills-sync` 后会询问：

```
是否已有 GitHub 仓库用于同步 skills？

1. 有，输入仓库地址 → 克隆 → 完成
2. 没有，跳过 Git 同步 → 扫描本地 skills → 完成
```

### 后续使用

```bash
skills-sync
```

显示当前状态：

```
Skills-Sync 状态

Master 目录: C:/Users/xxx/AISkills（5 个 skills）
Git 仓库: https://github.com/xxx/my-skills

链接状态:
✔ Claude Code  已链接
✔ Gemini CLI   已链接

✔ 所有状态正常
```

---

## 命令列表

| 命令                      | 说明                      |
| ------------------------- | ------------------------- |
| `skills-sync`             | 自动引导（推荐）          |
| `skills-sync init`        | 一键初始化（本地 skills） |
| `skills-sync clone [url]` | 从 GitHub 克隆            |
| `skills-sync health`      | 检查状态                  |
| `skills-sync sync`        | 同步到 GitHub             |
| `skills-sync link`        | 创建/修复链接             |
| `skills-sync import`      | 导入本地 skills           |
| `skills-sync watch`       | 监听变化自动同步          |
| `skills-sync rollback`    | 回滚版本                  |
| `skills-sync app`         | 管理应用列表              |

---

## 使用场景

### 场景 1：新用户，有本地 skills

```bash
skills-sync
# 选择 "没有，跳过 Git 同步"
# 自动扫描并导入本地 skills
```

### 场景 2：新电脑，已有 GitHub 仓库

```bash
skills-sync
# 选择 "有，输入仓库地址"
# 输入 GitHub 地址
# 自动克隆并创建链接
```

### 场景 3：多电脑同步

**电脑 A**（首次）：

```bash
skills-sync
# 设置 GitHub 仓库
skills-sync sync  # 推送到 GitHub
```

**电脑 B**（首次）：

```bash
skills-sync
# 输入相同的 GitHub 地址
# 自动克隆并合并本地 skills
skills-sync sync  # 同步回 GitHub
```

现在两台电脑都有相同的 skills 了！

---

## config.yaml 配置

配置文件位于项目根目录，首次运行自动生成。

```yaml
masterDir: 'C:/Users/USERNAME/AISkills'

git:
  enabled: true
  remote: 'https://github.com/xxx/my-skills.git'
  autoPush: true

apps:
  - name: 'Claude Code'
    skillsPath: 'C:/Users/USERNAME/.claude/skills'
    enabled: true
  - name: 'Gemini CLI'
    skillsPath: 'C:/Users/USERNAME/.gemini/skills'
    enabled: true
```

---

## 常见问题

### Git 认证失败

```bash
# 配置 Git 凭据
git config --global credential.helper manager
```

### 链接异常

```bash
skills-sync link  # 修复链接
```

### 添加新 AI 应用

```bash
skills-sync app add
```

---

## 技术说明

- **Junction Symlink**：Windows 目录级符号链接，无需管理员权限
- **ESM 模块**：需要 Node.js 18+
- **文件识别**：通过 `SKILL.md` 文件识别 skill 目录

## License

MIT
