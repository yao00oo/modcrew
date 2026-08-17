# MCP 設計原則 · 上游源索引

> 這是 `mcp-design-principles.md` 巡檢的**作業清單**:巡檢腳本只掃這裡登記的源,不登記就掃不到。
> 檢測腳本在本機 `~/Project/mcp-doctrine/check_updates.sh`,每週一自動跑(launchd `com.yaoyao.mcp-patrol`)。
> 源變了 → 按「對應原則」列複核那幾條,修訂以 PR 形式提出,main 分支巡檢禁改。

SPEC_VERSION: 2026-07-28
<!-- 巡檢腳本讀上面這行決定拉哪個版本的 spec 頁面;新版本發布後隨過審 PR 更新 -->

## 源清單

| # | 源 | 檢測方式(key) | 對應原則 | 上次核驗 |
|---|---|---|---|---|
| 1 | [spec GitHub releases](https://github.com/modelcontextprotocol/modelcontextprotocol/releases) | release tag 比對(`spec-release`) | 全部 | 2026-08-17 |
| 2 | [spec changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)(隨 #1 出新版才讀) | 不獨立檢測,#1 報警後人讀 | P2 P3 P5 | 2026-08-17 |
| 3 | [spec 已廢棄特性註冊表](https://modelcontextprotocol.io/specification/2026-07-28/deprecated) | `.md` 純文本 hash(`spec-deprecated`) | 「已廢棄」區 · P8 | 2026-08-17 |
| 4 | [MCP 官方博客](https://blog.modelcontextprotocol.io/) | RSS 文章列表比對(`mcp-blog`) | 全部 | 2026-08-17 |
| 5 | [Anthropic engineering](https://www.anthropic.com/engineering) | 文章 slug 集合比對(`anthropic-eng`) | P1 P4 P6 | 2026-08-17 |
| 6 | [Cloudflare blog · MCP tag](https://blog.cloudflare.com/tag/mcp/) | RSS 文章列表比對(`cf-mcp`) | P1 | 2026-08-17 |

## 原則 ↔ 證據源映射(源報警時複核哪幾條)

| 原則 | 上游依賴 | 說明 |
|---|---|---|
| P1 Code Mode | Cloudflare blog、Anthropic engineering(code-execution / advanced-tool-use) | 一線工程實踐驅動 |
| P2 Credential ownership | spec authorization 章節 | auth 機制隨 spec 演進(DCR → Client ID Metadata Documents) |
| P3 tools/list 穩定性 | spec 核心協議(caching / subscriptions / discover)+ Claude Code 客戶端行為 | 前提一半在 spec、一半在客戶端實現,兩頭都要盯 |
| P4 description 寫給 LLM | Anthropic engineering(tool-use 指南類) | |
| P5 中央化部署 | spec 核心協議(stateless 化) | |
| P6 少而靈活 | Anthropic engineering | |
| P7 客戶端側內容分發 | **無上游** | 自家 botook-heartbeat 實戰產物,由自家實戰驅動更新 |

## 維護規則

- 新增值得盯的源(新的一線工程博客、spec 拆出新倉庫等)→ 開 PR 登記進上表,同時給 `check_updates.sh` 加對應檢測段
- 源死了(404 / 遷移)→ 巡檢會報 FETCH-FAIL,修 URL 走 PR
- 「上次核驗」列由每輪巡檢更新
