# Changelog

## 2.7.0 — 2026-08-13

### Planning Center

- 新增独立资源规划中心、30/60/90 天产能预测和团队产能热力图。
- 新增 Resource Gantt / Project Gantt。
- 新增工作日历、公司休息日与特殊补班日，并让日历真实参与预测、推荐和排期。
- 新增解释型人员推荐与多策略排期优化。

### 自动排期

- 新增 Dependency Gate：前置条件未满足的项目不会提前占用人员。
- 新增关键路径优先队列：综合关键路径、DDL 延误、P0-P3、浮动时间和人员缺口分配稀缺产能。
- 优先分支持展开查看每项加减分。
- 快速单方案与多方案优化统一按关键路径顺序逐需求预留模拟产能。
- 修复候选搜索可能在项目 DDL 之后返回“最早可用日期”的边界问题；项目结束日后的空闲不再生成真实 proposal。

### 项目网络

- 新增 FS / SS / FF / SF 项目依赖及工作日 Lag / Lead。
- 新增自定义里程碑、CPM 关键路径、最早/最晚日期、总浮动时间和 DDL 风险。
- 新增循环依赖校验与项目 readiness / blockers。

### What-if 与操作安全

- 新增 Baseline vs Scenario 情景沙盘，可模拟补人、转移分工、人员状态/产能变化和项目日期变化。
- 新增事务级 Undo / Redo。
- 新增持久 Command Audit Trail。
- 自动排期、优化方案和情景应用均使用原子批量提交。

### 数据与桌面端

- 数据库 schema 升级到 V7 Planning Settings。
- 新增数据库诊断、SHA-256 与滚动恢复点。
- 保留离线账号权限、Excel/CSV 导入、JSON 备份恢复和 Windows 本地存储。

### 构建

- Windows 安装版：`项目人员调度台-Setup-2.7.0-x64.exe`
- Windows 便携版：`项目人员调度台-Portable-2.7.0-x64.exe`
- GitHub Actions 官方 action 升级到 v7，应用测试/构建 Node 版本保持 22。
