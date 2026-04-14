# Hermes HUD-UI Settings 改造计划

## 现状分析

### 当前读写能力

| 数据源 | 读 | 写 | 备注 |
|--------|:--:|:--:|------|
| `~/.hermes/config.yaml` | config.py | **无** | 16个配置段，100+ key |
| `~/.hermes/state.db` | sessions/projects/costs | projects CRUD | 其他表只读 |
| `~/.hermes/memories/` | memory.py | POST/PUT/DELETE | 已有完整写入 |
| `~/.hermes/memories/USER.md` | memory.py | POST/PUT/DELETE | 已有完整写入 |
| hermes CLI | — | cron 暂停/恢复/运行/删除 | 子进程调用 |
| Gateway | chat 读 | chat 发送/取消 | HTTP proxy |

### 当前 12 个面板交互现状

| 面板 | 现有交互 | 纯只读展示 |
|------|---------|:----------:|
| Dashboard | 无 | ✓ |
| Memory | 增/删/改 ✓ | |
| Skills | 分类筛选 | ✓（无安装/卸载） |
| Cron | 暂停/恢复/运行/删除 | ✓（无创建） |
| Projects | 增/删/改 + 关联会话 ✓ | |
| Health | 无 | ✓ |
| Agents | 无 | ✓ |
| Chat | 完整聊天 ✓ | |
| Profiles | 无 | ✓ |
| Costs | 无 | ✓ |
| Corrections | 无 | ✓ |
| Patterns | 无 | ✓ |

---

## 配置写入方式

**直接写 config.yaml**，不走 gateway 或 CLI。

原因：
1. `hermes_cli.config.save_config()` 已有原子写入（tempfile + os.replace + flock）
2. `set_config_value(key, value)` 支持嵌套 key、自动类型推断、API key 自动分流到 .env
3. agent 每次需要配置时 `load_config()` 重新读取，**改了立即生效**
4. 已有 watchfiles + WebSocket 机制，config 变更后前端自动刷新

---

## 改造方案：两大部分

### 一、现有面板增强（从只读到可交互）

#### 1. DashboardPanel → 可操作概览

**现在**：纯数据展示（session 统计、token 用量、最近活动）

**增加**：
- 快捷操作卡片：重启 gateway、清缓存（已有 POST /api/cache/clear）
- 一键切换模型（dropdown，直接写 config.yaml model 字段）
- 一键切换 personality（直接写 display.personality）
- 系统状态操作：清空旧 sessions、重置 DB

#### 2. SessionsPanel → 会话管理

**现在**：搜索 + 查看消息列表

**增加**：
- 删除会话（DELETE /api/sessions/{id}，需要新建）
- 批量删除旧会话（按时间/数量）
- 重命名会话标题（PATCH /api/sessions/{id} title）
- 关联/取消关联项目（已有 POST /api/projects/set-session）
- 导出会话为 JSON/Markdown

#### 3. SkillsPanel → 技能管理

**现在**：分类浏览 + 搜索

**增加**：
- 安装技能：调用 `hermes plugins install <repo>`（子进程）
- 卸载技能：调用 `hermes plugins remove <name>`（子进程）
- 技能启用/禁用：toggle toolsets 配置项
- 查看技能详情（展开 SKILL.md 全文）

#### 4. CronPanel → 完整 Cron 管理

**现在**：暂停/恢复/运行/删除

**增加**：
- **创建任务**：schedule + prompt + model + skills，调用 `hermes cron add`（子进程）
- 编辑任务：调用 `hermes cron edit`（子进程）

#### 5. MemoryPanel → 增强

**现在**：增/删/改记忆条目

**增加**：
- Partition 视图切换（memory / user profile / 自定义 partition）
- 记忆分区大小指示（当前 chars / limit）
- 手动触发 flush：调用 `hermes` CLI flush 命令

#### 6. HealthPanel → 带操作

**现在**：纯状态展示

**增加**：
- 一键检查更新（调用 `hermes update --check`）
- 查看最近错误日志（读 ~/.hermes/logs/）
- API 连通性测试（ping 各 provider endpoint）

#### 7. AgentsPanel → 进程管理

**现在**：展示运行中的 agent 进程

**增加**：
- 终止进程（kill PID，需确认弹窗）
- 启动/重启 gateway（调用 hermes-all 脚本或直接启动）
- 查看进程日志（实时 tail）

#### 8. ProfilesPanel → 配置 Profile 管理

**现在**：只读展示 provider profile 信息

**增加**：
- 切换活跃 profile（如果支持多 profile）
- 编辑 API key（写入 .env，通过 `save_env_value`）
- 测试 API key 有效性（发一个简单请求验证）

#### 9. TokenCostsPanel → 成本管理

**现在**：token 用量 + 费用估算展示

**增加**：
- 设置预算上限告警（写入 state.db 新表或 config.yaml）
- 按时间范围筛选（今天/本周/本月）
- 导出费用报告 CSV

#### 10. CorrectionsPanel → 纠正记录管理

**现在**：只读展示纠正历史

**增加**：
- 删除纠正记录
- 查看纠正前后 diff

#### 11. PatternsPanel → 提示模式管理

**现在**：只读展示

**增加**：
- 编辑 pattern 内容
- 创建自定义 pattern
- 删除 pattern

---

### 二、新增 Settings 面板

**全局配置管理**，从 12 个 tab 扩展到 13 个。

#### 后端：`api/settings.py`

```
GET  /api/settings              — 完整 config.yaml
GET  /api/settings/{section}    — 单个配置段
PATCH /api/settings             — 更新配置（body: {key, value}）
POST /api/settings/reload       — 强制刷新缓存
GET  /api/settings/schema       — 返回配置项 schema（类型、范围、枚举值、描述）
```

写入机制：复用 `hermes_cli.config.save_config()` + `set_config_value()`

#### 前端：`SettingsPanel.tsx`

左侧分组导航 + 右侧表单，按配置段分组：

**★★★ 高优先级**（用户最常改的）：
- **Model**：default model, provider, base_url, smart_model_routing
- **Display**：personality（15种预览）, streaming, compact, API server 端口

**★★ 中优先级**：
- **Agent**：max_turns, reasoning_effort, verbose, tool_use_enforcement
- **Memory**：enabled, char_limit, nudge_interval, flush_min_turns
- **Compression**：enabled, threshold, target_ratio, summary_model
- **Terminal**：backend, timeout, persistent_shell, container 配置
- **TTS/STT**：provider, voice, model
- **Toolsets**：checkbox 多选

**★ 低优先级**：
- **Privacy/Security**：redact_pii, redact_secrets, tirith
- **Browser**：timeout, record_sessions
- **Checkpoints**：enabled, max_snapshots
- **Logging**：level, max_size, backups
- **Auxiliary**：8 个辅助模块配置

**工具功能**：
- 导出 config.yaml（下载）
- 导入 config.yaml（上传替换）
- 重置为默认值
- 配置变更 diff 预览（保存前展示改了什么）
- 标注哪些需要重启 agent 生效

---

## 需要新建的后端 API

| API | 方法 | 对应面板 | 说明 |
|-----|------|---------|------|
| `/api/settings` | GET/PATCH | Settings | config.yaml 读写 |
| `/api/settings/schema` | GET | Settings | 配置项元数据 |
| `/api/sessions/{id}` | DELETE/PATCH | Sessions | 删除/重命名会话 |
| `/api/sessions/cleanup` | POST | Sessions | 批量清理旧会话 |
| `/api/sessions/{id}/export` | GET | Sessions | 导出会话 |
| `/api/skills/install` | POST | Skills | 安装技能 |
| `/api/skills/{name}` | DELETE | Skills | 卸载技能 |
| `/api/skills/{name}/detail` | GET | Skills | 技能详情 |
| `/api/cron` | POST | Cron | 创建 cron 任务 |
| `/api/cron/{id}` | PATCH | Cron | 编辑 cron 任务 |
| `/api/agents/{pid}/kill` | POST | Agents | 终止进程 |
| `/api/agents/restart-gateway` | POST | Agents | 重启 gateway |
| `/api/health/check-update` | POST | Health | 检查更新 |
| `/api/health/test-connection` | POST | Health | 测试 API 连通 |
| `/api/profiles/{name}/key` | PUT | Profiles | 更新 API key |
| `/api/profiles/{name}/test` | POST | Profiles | 测试 key |
| `/api/costs/export` | GET | Costs | 导出费用报告 |
| `/api/corrections/{id}` | DELETE | Corrections | 删除纠正 |
| `/api/patterns` | POST/PUT/DELETE | Patterns | CRUD pattern |

---

## 实施步骤（按优先级）

### Phase 1 — 框架 + 最高价值增强
1. 新建 `api/settings.py`（config.yaml 读写 + schema）
2. 新建 `SettingsPanel.tsx`（Model + Display 两组）
3. 注册到 App.tsx（第 13 个 tab）
4. SessionsPanel 增加删除/重命名（DB 操作，最简单）

### Phase 2 — 现有面板增强
5. CronPanel 增加创建任务
6. SkillsPanel 增加安装/卸载（子进程调用）
7. AgentsPanel 增加进程管理
8. DashboardPanel 增加快捷操作

### Phase 3 — Settings 完整表单
9. 补全 Settings 剩余配置段（Agent/Memory/Compression/Terminal/TTS/Toolsets）
10. Import/Export + 重置

### Phase 4 — 锦上添花
11. ProfilesPanel 编辑 API key
12. HealthPanel 操作增强
13. TokenCostsPanel 导出 + 预算
14. Corrections/Patterns 管理

---

## 文件变更清单

| 文件 | 操作 | Phase |
|------|:----:|:-----:|
| `backend/api/settings.py` | 新建 | 1 |
| `backend/collectors/config.py` | 扩展 | 1 |
| `backend/main.py` | 修改 | 1 |
| `frontend/src/components/SettingsPanel.tsx` | 新建 | 1 |
| `frontend/src/App.tsx` | 修改 | 1 |
| `frontend/src/components/SessionsPanel.tsx` | 修改 | 1 |
| `backend/api/sessions.py` | 修改 | 1 |
| `frontend/src/components/CronPanel.tsx` | 修改 | 2 |
| `backend/api/cron.py` | 修改 | 2 |
| `frontend/src/components/SkillsPanel.tsx` | 修改 | 2 |
| `backend/api/skills.py` | 修改 | 2 |
| `frontend/src/components/AgentsPanel.tsx` | 修改 | 2 |
| `backend/api/agents.py` | 修改 | 2 |
| `frontend/src/components/DashboardPanel.tsx` | 修改 | 2 |
| `frontend/src/components/ProfilesPanel.tsx` | 修改 | 4 |
| `frontend/src/components/HealthPanel.tsx` | 修改 | 4 |
| `frontend/src/components/TokenCostsPanel.tsx` | 修改 | 4 |
| `frontend/src/components/TopBar.tsx` | 修改 | 1 |
| `frontend/src/components/CommandPalette.tsx` | 修改 | 1 |

---

## 预估工作量

| Phase | 内容 | 预估 |
|-------|------|:----:|
| 1 | Settings 框架 + Session 管理 | 6h |
| 2 | 现有面板增强 | 6h |
| 3 | Settings 完整表单 | 4h |
| 4 | 锦上添花 | 4h |
| **合计** | | **20h** |

建议先做 Phase 1，立即可用的 Settings + Session 管理。
