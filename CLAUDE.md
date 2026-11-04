# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 目的

このリポジトリは、Claude Code の mod / プラグイン(パネル、ステータスライン、スラッシュコマンド、フックなど、Claude 自身のインターフェースや挙動を変更するもの)を作成するためのものです。

## 作業ルール

- ユーザーとのやり取りは、作成を始める前も含めて常に日本語で行う。
- mod やそのフックモジュールを作成・デバッグするときは `plugin-authoring` スキルを使う。
- `main` ブランチは保護されていて、直接 push できない。ブランチを切り、`gh pr create` で PR を作成してマージする。承認者は `tomoyankun` だけである(`.github/CODEOWNERS`)。
- mod のバージョンを上げるときは、次の2つを同じ値にする。手順は「リリース手順」に従う。
  - `plugin.json` の `version`
  - Git タグ(`v<version>`。マージ後に打つ。リリースの記録)

## 構成

各 mod は `mods/<mod名>/` に置く。

- `.claude-plugin/plugin.json` — マニフェスト
- `hooks/hooks.json` — `{ "modules": ["./register.tsx"] }`
- `hooks/register.tsx` — フックモジュール(`export const register: Register`)
- `hooks/*.test.ts` — テスト

`.claude-plugin/types/` は mod の読み込み時にエンジンが生成する(自身の `.gitignore` で除外される)。編集しない。

plugin-authoring スキルは新しい mod を、このリポジトリの外の `~/.claude/dev-mods/<セッションID>/<mod名>/` に書き出す。残したいものは `mods/` にコピーする。

## コマンド

```bash
claude plugin validate mods/<mod名>   # マニフェストとフックの検証
claude plugin test mods/<mod名>       # *.test.ts の実行
claude --plugin-dir mods/<mod名>      # mod を読み込んだ状態でセッション開始
```

ホットリロード: `--plugin-dir` で起動したセッションは、各ターンの終わりに mod の編集を再読み込みする。`claude -p` のように確認を表示できない環境では使えない。その環境では、セッションを再起動して反映する。

## リリース手順

`.claude-plugin/marketplace.json` は、mod を相対パス(`./mods/<mod名>`)で登録している。利用者は、`plugin.json` の `version` が上がったときに更新を検知する。

1. ブランチを切る。`mods/<mod名>/.claude-plugin/plugin.json` の `version` を上げる。
2. PR を作成して、マージする。
3. マージ後の `main` のコミットに、`v<version>` のタグを打ち、push する。

   ```bash
   git switch main && git pull
   git tag -a v0.8.2 -m "usage-status 0.8.2"
   git push origin v0.8.2
   ```
4. 利用者に、README の「更新」の操作(3つの手順)を案内する。

## mod 一覧

- `usage-status` — 5時間・1週間の使用量制限とセッションのトークン使用量を、モード行(`PromptHint`)の下にゲージで常時表示する。50%以上は黄、80%以上は赤。デスクトップアプリではペイン(`/usage-status pane` / `pane off`)にも出す。`/usage-status` で表示をオン・オフする。`types/index.d.ts` に型契約がある。
