# 需求清单

## 已有模块

| 模块 | 文档 | 状态 |
| --- | --- | --- |
| SVN 集成 | [`src/cli/svnCli.ts`](../src/cli/svnCli.ts) | ✅ 完成 |
| Plastic SCM 集成 | [`src/cli/plasticCli.ts`](../src/cli/plasticCli.ts) | ✅ 完成 |

## 规划中

| 模块 | 详情文档 | 状态 | 优先级 |
| --- | --- | --- | --- |
| 记事本 | [server/note-api.md](server/note-api.md) | ⏳ 未开始 | P0 |
| Todo 列表 | [server/todo-api.md](server/todo-api.md) | ⏳ 未开始 | P0 |
| 配置页 | — | ⏳ 未开始 | P1 |
| 股票列表 | [server/remote-data-api.md](server/remote-data-api.md) | 📄 接口已定 | P1 |
| 服务器通讯 | 各模块文档中分别说明 | ⏳ 随模块推进 | P1 |

### 记事本

- VSCode Panel 形式，侧边栏或底部区域编辑
- 笔记列表 + 点击进入编辑区
- 本地存储，关闭 VSCode 不丢数据
- **服务端**：独立轻量服务，CLI + REST，本地 JSON 文件存储
- 详情见 [server/note-api.md](server/note-api.md)

### Todo 列表

- 添加 / 勾选完成 / 删除
- 支持分组（工作 / 个人 / 其他）
- 本地存储
- **服务端**：独立轻量服务，CLI + REST，本地 JSON 文件存储
- 详情见 [server/todo-api.md](server/todo-api.md)

### 配置页

- 服务器地址、认证信息
- 各模块独立配置入口
- 独立设置面板

### 股票列表

- 自选股票列表，展示当前价格、涨跌幅
- **外观低调**：不用红绿色块、K线图、跳动数字等看板风格
- 纯文本/表格风格，混在编辑器里不引人注目
- 数据通过 REST API 从 `daily_stock_analysis` 服务拉取

### 服务器通讯

- 记事本 / Todo / 股票各有独立后端服务，互不耦合
- VSCode 插件通过 REST API 读写数据
- openclaw 通过 CLI 管理服务端数据

---

## 候选需求（待挑选）

| 模块 | 说明 | 优先级 |
| --- | --- | --- |
| 项目仪表盘 | Git 分支、变更文件数、最近提交 | P2 |
| 工作计时统计 | 记录各项目编码时长，状态栏显示 | P2 |
| 状态栏信息聚合 | 服务器在线/离线、Todo 待办数、行情 | P2 |
| 右键菜单增强 | 复制相对路径、外部工具打开 | P3 |
| 终端命令收藏 | 保存常用命令，一键发送到终端 | P3 |
| 编辑器 TODO 高亮 | 高亮 TODO/FIXME 标记，侧边栏汇总 | P3 |
