# dsh-bsk-daemon

把本机 **bsk（BrowserSkill）浏览器扩展的守护进程**搬进 dsh 的「拓展」面板。

它只做两件事：

1. 宿主端提供 bsk 进程管理与三个 HTTP 路由
2. 浏览器端往 `dsh-extension` 的容器里注册一张卡片

这个包**不开面板、不占侧栏**。它的 UI 完全长在「拓展」里，和容器形成联动：卡片头显示状态胶囊，展开后是完整的控制面板。

## 卡片提供的能力

- **状态**：bsk.exe 是否安装、daemon 是否在跑（`127.0.0.1:52800`）、当前版本、有没有浏览器连上来
- **连接判断**：读 `~/.bsk/daemon.log.<日期>`，比较最后一次 `browser connected` 与 `browser disconnected` 的先后；日志里残留的旧「协议不兼容」告警只在最近一次连接之后才报
- **重启**：`daemon stop --quiet` → 等端口释放 → 清掉残留的 `daemon.json` / `daemon.lock` → `daemon start --foreground`（detached，`BSK_AUTO_START=0`）→ 等端口就绪，全过程带毫秒时间线
- **刷新**：手动拉一次状态

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/__dsh-ext/bsk/status` | 状态 JSON |
| GET | `/__dsh-ext/bsk/logs` | 今日 daemon 日志尾巴（32 KB） |
| POST | `/__dsh-ext/bsk/restart` | 重启，返回 `{ ok, ms, message, steps, status }` |

旧的 `/__dsh-start/ext/bsk/*` 也仍然可用（1.x 的路径，缓存里的旧前端还在调）。

这些路由挂在 dsh web 自己的 server 上，不走 `/api` 的 token 校验，所以自己挡一层：

- 带 `Origin` 且与 `Host` 不同源 → 403
- 写操作要求自定义头 `x-dsh-ext: bsk`（跨站 JS 想带自定义头必须过 CORS 预检，而这里不返回任何 CORS 头）

## 安装

先装容器，再装本包，最后重启 dsh web：

```bash
"C:/Program Files/nodejs/node.exe" "C:/Users/<你>/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js" \
  plugin --profile web add file:<这个目录的绝对路径>
```

装完侧栏「拓展」里会出现「浏览器技能（bsk）」卡片。

## 环境变量

| 变量 | 默认值 |
| --- | --- |
| `BSK_PATH` | `~/.local/bin/bsk.exe` |
| `BSK_HOME` | `~/.bsk` |

## 依赖

- 容器插件 `dsh-extension` >= 2.0.0（找不到 `extensionHub` 时本包只在控制台打一条 warn，不注册任何 UI）
- dsh `0.2.x`，Node.js >= 20

## License

MIT
