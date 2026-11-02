# MCP 設計原則 · 巡檢日誌

**用途:**每輪巡檢的執行記錄(倒序):哪個上游源變了、原則文檔跟著開了什麼 PR、複核抓到什麼。**「無變更」輪也必須記**——沒記錄分不清「沒變」和「沒跑」。原則本身的修訂歷史看 git log 與 PR;這裡只記巡檢過程。

---

- 2026-11-02 巡檢:**1 CHANGED / 1 FETCH-FAIL，原則正文無需修訂；文章檢測連續兩輪失敗，未通知成功，下輪補發**。5 源均已嘗試；執行前工作區乾淨，`git checkout main && git pull --ff-only` 成功；`bash ~/Project/mcp-doctrine/check_updates.sh` exit 0，但輸出含 FETCH-FAIL，未誤記為全數成功。歷史 backlog 無遺留。
  - 各源結果：spec-releases 無變化(最新 tag `2026-07-28`)；spec-deprecated-registry(2026-07-28) 無變化(hash `add54d8fcf0479d9`)；MCP 官方博客 **CHANGED**；Anthropic engineering **FETCH-FAIL**；Cloudflare MCP tag 無變化。四個成功源的基線本輪刷新；Anthropic 基線仍保留 10-19 版本，未手動替換。
  - CHANGED 逐條結論：[The Official Ruby SDK for MCP Reaches Tier 1](https://blog.modelcontextprotocol.io/posts/ruby-sdk-tier-1/)(原文日期 2026-09-29，本輪 RSS 列表首次檢出，不能當作今日發布)已完整閱讀。這是 SDK 分級、相容性與維護承諾公告；其中重述既有無狀態生命週期、MRTR、快取提示及廢棄特性，與 P2/P3/P5/P8 現有 2026-07-28 補記相容，沒有新的規範變更，也沒有證明 Claude Code 已實作新快取／訂閱語義。依映射複核後，**已閱，無需修訂**；不憑 SDK 支援情況推翻 P3，不重複起草 PR。SPEC_VERSION 維持 `2026-07-28`；原則文檔與 upstream-sources.md 均未改。
  - FETCH-FAIL：與 10-26 同源連續第 2 輪失敗，已達通知門檻。人工 `curl -fLsS` 補抓 [Anthropic engineering](https://www.anthropic.com/engineering)成功(325227 bytes)；舊正則 `href="/engineering/[a-z0-9-]+"` 匹配 0 條，文章連結現為 `/research/<slug>`。人工按 slug 比對：舊基線 25 項、本頁小寫文章 23 項，新增可見的 [Confidential Inference via Trusted Virtual Machines](https://www.anthropic.com/research/confidential-inference-trusted-vms)其實是 2025-06-18 舊文，已完整補讀，內容談推理資料加密、可信虛擬機與硬體驗證，與本源所映射 P1/P4/P6 無關；另外 3 個舊 slug 不再列於本頁，不能據此推斷原文被刪。頁面另有大小寫 slug `AI-resistant-technical-evaluations`，不應沿用僅小寫匹配。最新文章仍為 10-13 的 source control 篇，未發現更新的工程文章。人工補查不沖銷自動檢測失敗統計。
  - 工具修正提請(未動手)：延續 10-26，文章檢測需兼容 `/engineering/` 與 `/research/`、以 slug 識別、保留大小寫、排除 `/research/team/` 分類連結，並驗收真新增／舊文重新列出／文章移出列表／抓取失敗的區別；另延續 10-05 的廢棄頁格式歸一化提請。`check_updates.sh` 未改，SHA-256 仍為 `9e4eb87ba3de5759395742d81b68f4532107762b872ca16b36a463ebb735015b`。不把這些未批准提請當作已完成修正。
  - 歷史 [PR #2](https://github.com/yao00oo/modcrew/pull/2) 經 `gh pr list --repo yao00oo/modcrew --state open`、`gh pr view 2` 核實仍 OPEN，0 評論／0 review，最後更新 2026-08-24。無新增內容，不重複起草或重複通知；本輪沒有新 PR，不合併任何 PR。
  - 通知：因連續兩輪 FETCH-FAIL，已用 Bash、正文 stdin、不加 `--at`，按指定入口嘗試發送「文章鏈接換了路徑，巡檢仍查舊路徑，建議兼容新舊地址」。**未通知成功**：`notify-feishu.sh` exit 1，原文「未登记发送类别或日报任务，拒发；开发验收留在当前会话，飞书链路测试用 TEST=1」。只讀檢查發現公共入口 10-22 已改為分類路由，無類別拒發，現有設定無本任務至「Ai小组」的指定路由；沒有擅加類別、改去向、回退舊 webhook 或修改通知工具。**下輪先核對／補發本條通知**；需批准補齊指定群的合法路由後才可確認送達，不能把舊 PR 的既有通知當成本次送達。通知修復提請只記台帳。
  - 結案與驗證：本輪 CHANGED 已處理，backlog 對應條目清除；僅巡檢台帳提交 main，原則正文、源索引及工具不變。`git diff --check` 與提交檔案白名單檢查後提交，推送結果另以遠端 main 核實。本輪抓取正文、輸出、通知失敗原文及基線快照留於 `/private/tmp/mcp-patrol-2026-11-02/`。

- 2026-10-26 巡檢:**1 CHANGED / 1 FETCH-FAIL，原則正文無需修訂，檢測工具缺陷留待批准**(5 源均已嘗試檢測；`bash ~/Project/mcp-doctrine/check_updates.sh` exit 0，故不能僅憑退出碼認定全數成功)。執行前 `git checkout main && git pull --ff-only` 成功、工作區乾淨；backlog 無歷史遺留。
  - 各源結果：spec-releases 無變化(最新 tag 仍 `2026-07-28`)；spec-deprecated-registry(2026-07-28) **CHANGED**；MCP 官方博客無變化；Anthropic engineering **FETCH-FAIL**；Cloudflare MCP tag 無變化。三個無變化源的本輪基線與執行前快照逐位元比對相同；四個成功源基線本輪已刷新，Anthropic 舊基線保留。
  - CHANGED 結論：已閱，**導出格式變動，非原則變更**。廢棄登記頁 hash `ae898cdfe5b5a226` → `add54d8fcf0479d9`；[本輪純文字頁](https://modelcontextprotocol.io/specification/2026-07-28/deprecated.md)的站內連結帶 `.md`。逐項核對 6 條 Deprecated 與空的 Removed 區，內容及替代方案均與 P2/P8 相容。[上游原始檔](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/deprecated.mdx)最後提交仍為 [2026-07-28 / 0cb6c6a3](https://github.com/modelcontextprotocol/modelcontextprotocol/commit/0cb6c6a31768cbb16129b35e6b569a31fecfe1b6)。Python 去掉 frontmatter／導覽前綴、統一站內連結 `.md`、表格分隔與空白及 Markdown 強調符號後，實抓正文與原始檔比較結果 `CANONICAL_CONTENT_EQUAL True`。處理結案，清除此輪 backlog 條目。
  - FETCH-FAIL 根因：人工重抓 [Anthropic engineering](https://www.anthropic.com/engineering)得 HTTP 200、392612 bytes；HTML 文章連結已由 `/engineering/<slug>` 換為 `/research/<slug>`，而 `check_updates.sh` 第 4 段只匹配舊路徑，結果為空。頁面最新文章仍為 2026-10-13 的 [Redesigning source control at Anthropic](https://www.anthropic.com/research/redesigning-source-control)，已於上輪閱讀判定無關；本輪人工補查未發現更新文章。**保留原始 FETCH-FAIL 統計**，這是本源首次連續失敗(上輪 0 FETCH-FAIL)，下輪若仍失敗即達通知門檻。
  - 工具修正提請(本輪未改工具、未替換基線)：① 文章偵測應同時解析 `/engineering/` 與 `/research/`，以文章 slug 作穩定識別、排除 `/research/team/` 分類連結，避免改路徑後整批假新增；驗收至少覆蓋舊／新路徑、大小寫 slug 與分類排除。② 延續 10-05 提請，廢棄登記頁應使用正文語義歸一化或追蹤原始檔，避免導覽、表格和 `.md` 連結格式觸發假變更；驗收同時要求格式變動不報警、真實廢棄條目／遷移方案變動仍報警。以上待主人批准後另起修正，禁止本輪擅改。
  - 歷史修訂 [PR #2](https://github.com/yao00oo/modcrew/pull/2) 經 `gh pr list --repo yao00oo/modcrew --state open` 及 `gh pr view 2` 核實仍 OPEN、0 評論／0 review、最後更新 2026-08-24，無新內容，不重複起草或通知。本輪無新 PR；`mcp-design-principles.md`、`upstream-sources.md`、SPEC_VERSION 均不改。
  - 通知：未發(無新 PR，FETCH-FAIL 未連續兩輪；舊 PR 已通知且無新增內容)。本輪僅提交巡檢台帳至 main，不合併任何 PR。核驗快照及抓取回應留於本機 `/tmp/mcp-patrol-2026-10-26/`；偵測腳本 SHA-256 保持 `9e4eb87ba3de5759395742d81b68f4532107762b872ca16b36a463ebb735015b`。

- 2026-10-19 巡檢:**1 CHANGED / 0 FETCH-FAIL,已閱後判定與 P1/P4/P6 無關,原則文檔不動**(5 源全檢;spec 最新 tag 仍為 2026-07-28;spec-deprecated(2026-07-28)hash 仍為 `ae898c…`;MCP 官方博客、Cloudflare MCP tag 無變化)。
  - `anthropic-engineering` 新增 [Redesigning source control at Anthropic](https://www.anthropic.com/engineering/redesigning-source-control)(2026-10-13 發布,10-15 更新)。原文講 Anthropic 為高併發 agent / CI 工作負載重做集中式源碼管理 Scion,重點是在線客戶端、client-server asymmetry、稀疏工作副本、server-side source control API 與水平擴展;未涉及 MCP 工具入口/Code Mode(P1)、tool description(P4)或工具粒度與 agent 意圖(P6),不構成原則正文修訂證據。→ 已閱,無關。
  - backlog 本輪條目已清。[PR #2](https://github.com/yao00oo/modcrew/pull/2) 經 `gh pr view` 核實仍 OPEN 待審(0 評論、0 review),無新內容不重複起草或通知。
  - 通知:未發(無新 PR、無連續兩輪 FETCH-FAIL)。

- 2026-10-12 巡檢:無變更(5 源全檢,0 CHANGED / 0 FETCH-FAIL;基線 09:17 全數刷新核實非靜默失敗,spec 最新 tag 仍為 2026-07-28,spec-deprecated(2026-07-28)hash `ae898c…` 與上輪一致,mcp-blog 最新仍為 08-22 roadmap 篇,anthropic-eng / cf-mcp 無變化)。backlog 無遺留。上輪 [PR #2](https://github.com/yao00oo/modcrew/pull/2) 經 `gh pr list` 核實仍 OPEN 待審(已開 7 週,0 評論),無新內容不重複通知。通知:未發(無新 PR、無 FETCH-FAIL)。上輪對 `check_updates.sh` 表格歸一化的提請仍未處理,待主人批示。

- 2026-10-05 巡檢:**1 CHANGED / 0 FETCH-FAIL,判定誤報,原則文檔不動**(5 源全檢,基線 09:17 全數刷新核實非靜默失敗;spec 最新 tag 仍為 2026-07-28,mcp-blog 最新仍為 08-22 roadmap 篇,anthropic-eng / cf-mcp 無變化)。
  - `spec-deprecated-registry(2026-07-28)` hash `06548b…` → `ae898c…`。逐行比對後**正文零變更**,只是頁面 .md 導出的表格格式變了(分隔行 `| ---- |` 變 `| - |`、列內填充空格去掉),歸一化後內容完全相同。證據:① 上游源文件 [docs/specification/2026-07-28/deprecated.mdx](https://github.com/modelcontextprotocol/modelcontextprotocol/commits/main/docs/specification/2026-07-28/deprecated.mdx) 最後一次提交仍是 2026-07-28(`0cb6c6a3`);② [Wayback 2026-09-10 快照](http://web.archive.org/web/20260910002159/https://modelcontextprotocol.io/specification/2026-07-28/deprecated.md)按腳本同一算法復算 hash = 舊基線 `06548b…`,與今日實抓 diff 僅表格格式行。6 條已廢棄特性(Roots / Sampling / Logging / Dynamic Client Registration / `includeContext` / HTTP+SSE)與 P8 表、P2 DCR 段一致,Removed 區仍為空,無需修訂。
  - backlog 本輪條目已清。上輪 [PR #2](https://github.com/yao00oo/modcrew/pull/2) 經 `gh pr view` 核實仍 OPEN(已開 6 週,0 評論),無新內容不重複通知。通知:未發(無新 PR、無 FETCH-FAIL)。
  - 提請(未動手,鐵律①):`check_updates.sh` 第 2 段 hash 前應把表格分隔行的連續 `-` 歸一(如 `re.sub(r'-{2,}','-',t)`)並去掉 `|` 兩側填充空格,否則渲染器改格式就誤報;同類風險在 Mintlify 加的「Documentation Index」前導塊(建議從首個 `# ` 標題起算 hash)。
  - 旁證(非登記源,不算核驗):上游 repo 09-14→09-28 的 docs 提交全為社區 / 工作組 / 連結修復類(Skills Over MCP WG、Infrastructure WG charter、SEP 頁 redirect),未觸及 spec 正文。

- 2026-09-28 巡檢:無變更(5 源全檢,0 CHANGED / 0 FETCH-FAIL;基線 09:17 全數刷新核實非靜默失敗,spec 最新 tag 仍為 2026-07-28,spec-deprecated(2026-07-28)hash 未變,mcp-blog 最新仍為 08-22 roadmap 篇)。本輪實際覆蓋 09-14 → 09-28 兩週窗口(見下條)。backlog 無遺留。上輪 [PR #2](https://github.com/yao00oo/modcrew/pull/2) 經 `gh pr list` 核實仍 OPEN 待審(已開 5 週),無新內容不重複通知。

- 2026-09-21 巡檢:**未執行**(補記)。機器 09:17 在合蓋休眠,09:27 醒來後 launchd 補跑,但 fable / opus / sonnet 三檔在啟動階段全部報「OAuth session expired and could not be refreshed」(登入態過期,非額度),11:09 整鏈 status=1 結束,`check_updates.sh` 未跑、基線未刷新、台帳未記。證據:`~/Project/_scheduled/logs/mcp-patrol-2026-09-21.log`。09-14 輪也曾遇同類 401(token revoked)但重試後成功。提請(未動手):run-claude-job.sh 把鑑權失敗當「撞上限」逐檔降級再等,三檔白等 1 小時 42 分;鑑權類錯誤應直接短路並走 job-alert 紅卡,屬運行器層問題,不在本 repo。

- 2026-09-14 巡檢:無變更(5 源全檢,0 CHANGED / 0 FETCH-FAIL;基線 11:55 全數刷新核實非靜默失敗,spec 最新 tag 仍為 2026-07-28,mcp-blog 最新仍為 08-22 roadmap 篇)。backlog 無遺留。上輪 [PR #2](https://github.com/yao00oo/modcrew/pull/2) 經 `gh pr list` 核實仍 OPEN 待審(已開 3 週),無新內容不重複通知。

- 2026-09-07 巡檢:無變更(5 源全檢,0 CHANGED / 0 FETCH-FAIL;基線 09:17 全數刷新核實非靜默失敗,mcp-blog 最新仍為 08-22 roadmap 篇)。backlog 無遺留。上輪 [PR #2](https://github.com/yao00oo/modcrew/pull/2) 經 `gh pr list` 核實仍 OPEN 待審,無新內容不重複通知。

- 2026-08-31 巡檢:無變更(5 源全檢,0 CHANGED / 0 FETCH-FAIL;基線 09:17 全數刷新核實非靜默失敗)。backlog 無遺留。上輪 [PR #2](https://github.com/yao00oo/modcrew/pull/2) 仍 OPEN 待審,無新內容不重複通知。

- 2026-08-24 首個定時輪(launchd 09:17):5 源全檢,**1 CHANGED / 0 FETCH-FAIL**。spec-releases、spec-deprecated(2026-07-28)、anthropic-engineering、cloudflare-mcp-tag 無變化;`mcp-official-blog` 新增 2 篇:
  - [The New MCP Roadmap](https://blog.modelcontextprotocol.io/posts/mcp-roadmap/)(08-22,Lead Maintainers)→ 觸及 P1/P2/P3/P8。roadmap [正式頁](https://modelcontextprotocol.io/development/roadmap)自述非承諾,故原則正文只記原話+鏈接並標「方向非規範」,推論進開放問題。「Looking back」段逐條印證 08-17 補記(SEP-2575/2567/2549/2663/2322、CIMD、生命週期政策)均準確,無需回改。→ [PR #2](https://github.com/yao00oo/modcrew/pull/2) 待審(P1 官方問題背書小節、P2/P3/P8 各補上游動向、開放問題 +4、引用源 +2、upstream-sources 上次核驗 #1/#3/#4/#5/#6 → 08-24,#2 未讀保持,SPEC_VERSION 不變)
  - [Ruby SDK 1.0](https://blog.modelcontextprotocol.io/posts/ruby-sdk-1-0/)(07-27)→ 已閱,無關(SDK 發布公告)
  - 通知:已發「Ai小組」群(notify-feishu exit 0)。backlog 本輪條目已清。
  - 提請(未動手):`check_updates.sh` 追加 backlog 時不清「(当前无遗留)」佔位行,cosmetic;roadmap 頁暫不加為第 7 源(歷次 roadmap 更新均伴博客文章,RSS 已覆蓋)。

- 2026-08-17 首單過審(人工批准,交互會話):[PR #1](https://github.com/yao00oo/modcrew/pull/1) **已合併**——spec 2026-07-28 對齊:頭部「上游基準」行、P2/P3/P5 補記、新增 P8(spec 生命週期)、開放問題輪轉、引用源補 6 條。主人審後整單批准(含 P8)。backlog 種子條目已清,零遺留。

- 2026-08-17 機制搭建(交互會話,非定時輪):5 源基線首建,0 CHANGED / 0 FETCH-FAIL(首輪建基線本身不構成檢測,但當日已人工核驗全部上游現狀,基線即核驗態,無 SEO D-2 式過渡期缺口)。變更檢測鏈路已用篡改基線法端到端驗證(報警 → diff → 落 backlog → 基線自愈)。人工發現的存量落差(spec 2026-07-28 正式版 vs 文檔 07-20 態)已入 backlog 作種子任務,修訂 PR 同日起草。launchd `com.yaoyao.mcp-patrol` 每週一 09:17,首個定時輪 2026-08-24。
