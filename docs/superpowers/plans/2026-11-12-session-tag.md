# session-tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/session-tag` で、現在のプロジェクトのセッションに内容タグ(自動)と完了タグ(手動)を付けて一覧表示する mod を作る。

**Architecture:** `mods/session-rm` と同じ構成にする。純粋関数(`hooks/tags.ts`)と、エンジンに触れる層(`hooks/register.tsx`)を分ける。タグは `$.store` に、セッション ID をキーとして保存する。内容タグは `$.model.complete` で 1 件ずつ生成する。

**Tech Stack:** Claude Code mod API(`claude-code`、`claude-code/testing`)、TypeScript、JSX。

**Spec:** `docs/superpowers/specs/2026-11-12-session-tag-design.md`

## Global Constraints

- mod 名とコマンド名は `session-tag`、`/session-tag`。バージョンは `0.1.0`。
- ライセンスは `MIT`。`plugin.json` に `"types": "./types/index.d.ts"` を書く。
- ペインの文言とコマンドの説明は英語にする。
- 対象は現在のプロジェクトのセッションだけ。
- セッションの `.jsonl` を変更しない。
- 1 回のペイン表示で呼ぶモデルは、最大 20 件。モデルは `haiku`。
- 内容タグは 20 文字以内。
- 保存形式は `$.store` のキー=セッション ID、値=`{ tag: string; done: boolean }`。
- 外部コマンドは `$.process.run`、現在のセッション ID は `$.session.id()` で得る。
- `typescript` をリポジトリに追加しない。
- 作業ブランチは `feat/session-tag`(`main` から切る)。

## Review Focus

- 先頭 64 KiB に有効なユーザープロンプトがない: 「(no prompt)」と表示する。モデルを呼ばない。再試行しない。
- `$.model.complete` が失敗または空を返す: タグなしで残す。次の表示で再試行する。他の件は続ける。
- 完了タグを付けたあとに内容タグを生成する: `done` を上書きしない。
- 20 件を超えるタグなしセッション: 新しい順に 20 件だけ処理する。
- `.jsonl` が消えたセッションのエントリ: 表示時に削除する。

## ファイル構成

- `mods/session-tag/.claude-plugin/plugin.json` — マニフェスト
- `mods/session-tag/hooks/hooks.json` — `{ "modules": ["./register.tsx"] }`
- `mods/session-tag/tsconfig.json` — `session-rm` と同じ
- `mods/session-tag/types/index.d.ts` — 型契約
- `mods/session-tag/hooks/tags.ts` — 純粋関数
- `mods/session-tag/hooks/tags.test.ts` — 純粋関数のテスト
- `mods/session-tag/hooks/register.tsx` — コマンド、保存、ペイン
- `mods/session-tag/hooks/register.test.tsx` — ペインのテスト
- `mods/session-tag/README.md`、`README.ja.md`
- 変更: `.claude-plugin/marketplace.json`、`CLAUDE.md`(mod 一覧)

### Task 1: 純粋関数

**Files:**
- Create: `mods/session-tag/.claude-plugin/plugin.json`、`hooks/hooks.json`、`tsconfig.json`、`types/index.d.ts`、`hooks/tags.ts`
- Test: `mods/session-tag/hooks/tags.test.ts`

**Interfaces:**
- Produces(`hooks/tags.ts`):
  - `type Entry = { tag: string; done: boolean }`
  - `type SessionFile = { id: string; mtimeMs: number }`
  - `firstPrompt(head: string): string | undefined` — `session-rm` の `firstPrompt` と同じ規則。切り取りは 200 字。取り出せなければ `undefined`。
  - `pickTargets(files: SessionFile[], entries: Map<string, Entry>, current: string, limit: number): string[]` — 新しい順で、タグのない ID を `limit` 件まで返す。現在のセッションは除く。
  - `cleanTag(text: string): string` — 空白を詰め、改行と引用符を除き、20 文字に切る。
  - `staleIds(keys: string[], existing: string[]): string[]` — 保存済みで `.jsonl` のない ID を返す。

- [ ] **Step 1: テストを書く。** `tags.test.ts` に、次の名前で書く。
  - `firstPrompt skips lines starting with < and returns the first typed prompt`
  - `firstPrompt returns undefined when no prompt exists`
  - `firstPrompt ignores a truncated last line`
  - `pickTargets returns the newest untagged ids up to the limit, excluding the current session`(25 件のうち 3 件がタグ済みのとき、20 件が新しい順に返ることを assert する)
  - `cleanTag cuts to 20 characters and removes newlines and quotes`
  - `staleIds returns stored ids without a file`
- [ ] **Step 2: 失敗を確認する。** Run: `claude plugin test mods/session-tag`。Expected: FAIL(`tags` が未定義)。
- [ ] **Step 3: 上記の署名で `tags.ts` を実装する。** マニフェスト、`hooks.json`、`tsconfig.json` は `session-rm` を複製する。`types/index.d.ts` は Task 3 で完成させるため、ここでは `declare module 'claude-code'` に `'session-tag'` の空の `PluginState` を宣言する。
- [ ] **Step 4: 成功を確認する。** Run: `claude plugin test mods/session-tag`。Expected: 6 件 PASS。
- [ ] **Step 5: コミットする。** `git add mods/session-tag && git commit -m "session-tag: タグ処理の純粋関数を追加"`

### Task 2: 保存とタグ生成

**Files:**
- Modify: `mods/session-tag/hooks/register.tsx`(新規作成)
- Test: `mods/session-tag/hooks/register.test.tsx`

**Interfaces:**
- Consumes: Task 1 の全関数と型。
- Produces(`register.tsx`、エクスポートしない内部関数でよい):
  - `loadFiles($): Promise<SessionFile[]>` — `session-rm` の `paths` と `load` と同じ規則で `.jsonl` を列挙する。
  - `readEntries($): Promise<Map<string, Entry>>` — `$.store.keys()` と `get` で読む。
  - `generateTag($, prompt: string): Promise<string | undefined>` — `$.model.complete({ model: 'haiku', prompt })`。`isAnswered` が偽、または `cleanTag` の結果が空なら `undefined`。
  - `tagMissing($, onProgress: (done: number, total: number) => void): Promise<void>` — `pickTargets` で選び、1 件ずつ処理する。プロンプトが取れない件は何もしない。1 件の失敗は、他の件を止めない。保存時に既存の `done` を保つ。

- [ ] **Step 1: テストを書く。** `mock` で `$.model.complete`、`$.store`、`$.process.run` を差し替える。名前:
  - `tagMissing stores a cleaned tag for each untagged session`
  - `tagMissing keeps going when one model call fails`(失敗した件にエントリが作られず、他の件に作られることを assert する)
  - `tagMissing does not call the model for a session without a prompt`
  - `tagMissing keeps an existing done flag`
  - `tagMissing processes at most 20 sessions`
- [ ] **Step 2: 失敗を確認する。** Run: `claude plugin test mods/session-tag`。Expected: FAIL。
- [ ] **Step 3: 上記の署名で実装する。** モデルへのプロンプトは英語で、「Reply with a tag of at most 20 characters that names this task. Reply with the tag only.」と最初のプロンプトを渡す。
- [ ] **Step 4: 成功を確認する。** Run: `claude plugin test mods/session-tag`。Expected: PASS。
- [ ] **Step 5: コミットする。** `git commit -m "session-tag: 内容タグの生成と保存を追加"`

### Task 3: コマンドとペイン

**Files:**
- Modify: `mods/session-tag/hooks/register.tsx`、`types/index.d.ts`
- Test: `mods/session-tag/hooks/register.test.tsx`

**Interfaces:**
- Consumes: Task 2 の `loadFiles`、`readEntries`、`tagMissing`。
- Produces:
  - `export const register: Register`
  - `types/index.d.ts`: `export type Row = { id: string; date: string; tag: string; done: boolean; current: boolean; label: string }`。`PluginState['session-tag']` に `rows: Shaped<Row[]>`、`progress: Shaped<string>`、`message: Shaped<string>` を宣言する。

- [ ] **Step 1: テストを書く。** 名前:
  - `the command opens the pane and lists sessions at once`
  - `the pane shows Tagging n/m while tags are generated`
  - `selecting a session toggles its done flag`
  - `selecting the current session changes nothing`
  - `opening the pane removes entries whose file is gone`
- [ ] **Step 2: 失敗を確認する。** Run: `claude plugin test mods/session-tag`。Expected: FAIL。
- [ ] **Step 3: 実装する。**
  - `session.start` で `$.command.register({ name: 'session-tag', description: 'List the sessions of this project with tags. Mark a session done.' })`。
  - `command.run` は、`staleIds` で削除し、一覧を作って `$.ui.open({ id: 'session-tag', title: 'Session tags', focus: true })` を呼び、`{ text: 'Session tag list opened.' }` を返す。`tagMissing` は `await` せずに起動する。進捗のたびに一覧を作り直す。
  - 一覧の 1 行は `<日付>  [done] <内容タグ>  <先頭プロンプト 40 字>`。タグなしは `(untagged)`。現在のセッションは `(current)`。
  - `ui.render` は `Select` で一覧を出す。`onSelect` で `done` を反転して保存し、一覧を更新する。
- [ ] **Step 4: 成功を確認する。** Run: `claude plugin test mods/session-tag`。Expected: PASS。
- [ ] **Step 5: コミットする。** `git commit -m "session-tag: /session-tag とペインを追加"`

### Task 4: 文書、検証、レビュー、PR

**Files:**
- Create: `mods/session-tag/README.md`、`README.ja.md`
- Modify: `.claude-plugin/marketplace.json`(`session-rm` の次に追加)、`CLAUDE.md`(mod 一覧に追加)

- [ ] **Step 1: README を書く。** `mods/session-rm/README.md` と `README.ja.md` の構成に合わせる。「更新」の 3 手順を含める。
- [ ] **Step 2: marketplace と CLAUDE.md を更新する。**
- [ ] **Step 3: 検証する。** Run: `claude plugin validate mods/session-tag`。Expected: エラーなし。Run: `npx -y -p typescript tsc -p mods/session-tag`(事前に `claude --plugin-dir mods/session-tag` を対話で起動して `/exit` する)。Expected: エラーなし。
- [ ] **Step 4: 実機で確認する。** `claude --plugin-dir mods/session-tag` で `/session-tag` を実行する。確認すること: 一覧がすぐ表示される、「Tagging n/m」が進む、完了タグが切り替わる。`$.model.complete` の 20 件の所要時間を記録する。
- [ ] **Step 5: `code-review` スキルで差分をレビューし、指摘を直す。** 最大 3 回繰り返す。指摘がなくなれば、その時点で終了する。
- [ ] **Step 6: PR を作る。** `gh pr create`。3 回後に残った指摘は、説明に書く。マージ後に `session-tag-v0.1.0` のタグを打つ(CLAUDE.md の「リリース手順」)。
