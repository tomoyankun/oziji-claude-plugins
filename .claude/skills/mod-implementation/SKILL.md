---
name: mod-implementation
description: Use when implementing, changing, fixing, or releasing a mod in this repository (mods/<mod名>), for example adding a mod, fixing a pane, focus, or hook problem, changing a README, bumping a version, or making a PR and tag. Covers the flow from requirements to PR, tag, and branch cleanup, and known pitfalls of the mod API.
---

# mod 実装フロー

このリポジトリの mod を実装するときの手順と、過去のセッションで判明した落とし穴をまとめる。
mod の API の書き方は `plugin-authoring` スキルに従う。
このスキルは、その前後の進め方を定める。

## 手順

1. 要件を固める。
   - 新しい mod や新しい機能のときは、先に `superpowers:brainstorming` を使う。
   - 質問は、ユーザーの判断が必要な点だけにする。案は2〜3個に絞り、推奨を1つ示す。
   - ユーザーが「その案で」「推奨どおりで」と答えたら、案を再提示せずに実装する。
2. 作業ブランチを切る。`main` に直接コミットしない。
3. 実装する。
   - 新しい mod は、CLAUDE.md の「構成」に従い、dev-mods に書く。手順4と手順5は、dev-mods の mod に対して行う。実機で確認してから、`mods/<mod名>/` にコピーする。コピー後に、手順4をもう一度行う。
   - 既存の mod の修正は、`mods/<mod名>/` を直接編集する。
4. 静的に検証する。新しい mod では、`mods/<mod名>` を dev-mods のパスに読み替える。
   - `claude plugin validate mods/<mod名>`
   - `claude plugin test mods/<mod名>`(`*.test.ts` がある mod だけ)
   - 型検査(次節)
5. 実機で確認する。
   - ホットリロードが効く環境では、ターンの終了を待ってから確認を依頼する。効かない環境では、`/reload-plugins`(ルートの README の「更新」の手順3にあるコマンド)かセッションの再起動を依頼する。条件は、CLAUDE.md の「コマンド」に従う。
   - 確認の観点を、番号を付けて渡す。例: 「1. 鳴ったか 2. 何回鳴ったか」
   - ユーザーの返答は、観点ごとに「できた」「できない」で受け取る。
   - 実機で確認していないことは、「未確認」と書く。原因は、確認するまで「推測」と書く。
6. 問題が残るときは、`superpowers:systematic-debugging` を使う。修正は1回に1件だけにする。コードを直したら、手順4をもう一度行う。
7. `plugin.json` の `version` を上げる。手順2のブランチに入れる。別の PR は作らない(CLAUDE.md の「リリース手順」の1と2)。
8. `code-review` スキルでレビューする。回数と終了条件は、CLAUDE.md の「作業ルール」に従う。
9. `gh pr create` で PR を作る。ユーザーがマージする。
10. ユーザーが「マージした」と伝えたら、`git switch main && git pull` で `main` を更新して、タグを打つ。CLAUDE.md の「リリース手順」に従う。
11. 利用者への更新案内が必要なら、README の「更新」の3つの手順を示す。

## 型検査

型の生成方法と、生成前のエラーの意味は、CLAUDE.md の「コマンド」に従う。

- 型を生成できないときは、スクラッチパッドに一時の `tsconfig.json` を置いて検査する。リポジトリに `typescript` を追加しない。
- `tsc` は `--noEmit` を付けて実行する。一時の `tsconfig.json` で実行するときも同じである。`hooks/register.js` が出力されたときは、コミットしない。コミット前に `git status` で確認する。

## 検証の報告

報告は、次の3区分に分ける。

- 変えたこと
- 確認できたこと(実行したコマンドと結果)
- 確認できていないこと(実機の動作、未実行のテスト、推測)

実行していない検証を、通ったと書かない。

## 落とし穴

### フックモジュール(`claude plugin validate` が拒否する書き方)

- `on()` のイベント名は、文字列リテラルで書く。変数やループで渡さない。
- `register` の中で宣言した関数に `$` を渡さない。関数はファイル先頭で宣言する。

### 音と通知

- `$.audio.play` は mac でしか鳴らない。`$.process.run` で OS ごとのコマンドを呼ぶ(WSL は `powershell.exe`、mac は `afplay`、Linux は `paplay` か `aplay`)。
- `$.ui.notify` は、tmux・VS Code・WSL の環境で `no-channel` になる。通知手段として当てにしない。
- チームメイトの質問は、親では `AskUserQuestion` の許可確認として届く。このとき `classic.PermissionRequest` と `classic.Elicitation` は発火しない。親自身の待ちでは、この2つも発火する。検知には `classic.Notification` も使う。

### 点滅と表示

以下の数値は、session-rm と notify-on-wait の作業時点の値である。使う前に、`types/index.d.ts` と実機で確認する。

- プロンプト上の帯とステータスラインは、質問のダイアログが出ている間は見えない。
- トーストを短い間隔で出し続けると、積み重なる(`+5 more`)。
- ペインは、端末の幅が110桁以上のときだけ開く。tmux でチームメイトを分割すると、親が狭くなり、ペインが開かない。
- mod が画面に出す文言と、スラッシュコマンドの出力は、英語にする。現在の `mods/*/hooks/register.tsx` には、日本語の文字列がない。日本語の説明は `README.ja.md` に残す。ユーザーへの報告は、CLAUDE.md に従い日本語にする。

### ペインと `Select`

この節の内容と数値も、session-rm の作業時点のものである。使う前に、`types/index.d.ts` と実機で確認する。

- `Select` は、選んだ項目を覚える。ページを切り替えると、選択中の項目が消え、一覧が空に見える。ページごとに `key` を変える。
- `Select` が描く見出し行は、隠せない。見出し行が不要なときは、`Button` を縦に並べる。
- 100件の一覧は、ペインに収まらず、空に見える。1ページ8件でページ送りにする。
- ページ送りのボタンを押すと、フォーカスがメイン側へ戻る。ページ更新の後に `$.ui.focus` でフォーカスを戻す。
- 確認ダイアログで `Cancel` を選ぶと、フォーカスがペインから外れる。ペインを `focus: true` で開き直し、`$.ui.focus` でフォーカスを戻す。
- 左右キーは、ペインのイベントとして受け取れない。ページ送りは、一覧の末尾の項目にする。
- Esc でペインを閉じるには、`$.ui.open` に `closeOnEscape: true` を指定する。

### テスト

- session-rm の作業時点では、テスト環境に `fs` と `process` がなかった。そのため、検証できる範囲は `ui.focus` などの呼び出しに限られた。現在の環境は、テストを書く前に確認する。
- テストを追加するかどうか迷うときは、ユーザーに聞く。

### リリースと README

- README は第三者向けに書く。開発者向けの手順は書かない。
- README は `README.md`(英語)と `README.ja.md`(日本語)の2つを同時に更新する。
- 表示の説明には、画面のキャプチャを `docs/image/` に置いて参照する。
- 新しい mod を追加するときは、次の3か所を更新する。
  - `.claude-plugin/marketplace.json`
  - ルートの README
  - CLAUDE.md の「mod 一覧」
- ルートの README には、mod ごとの README と重複する内容を書かない。リンクにする。

### 権限

- squash マージしたブランチは、`git branch --merged` に出ない。ローカルの削除は `git branch -D` を使う。
- 権限の判定で拒否されたコマンドは、再実行しない。ユーザーに `! <コマンド>` で実行してもらう。
- 画像と動画は、ユーザーがファイルのパスで渡す。動画は、`ffmpeg` がないと読めない。インストールを許可されていないときは、スクリーンショットを依頼する。
- `pip` と `npm` のインストールは、ユーザーの許可が必要である。

## 後片付け

1. マージ済みの PR のブランチを確認する。`gh pr list --state all` を使う。
2. ローカルとリモートの両方を削除する。削除の前に、対象の一覧をユーザーに示す。
3. `dev-mods` 側のコピーは、`mods/` と同一であることを `diff` で確認する。差分があるときは、削除せず、どちらが新しいかをユーザーに確認する。差分がなければ、ユーザーに無効にする方法を確認する。無効にした後で、コピーを削除する。同じ mod が二重に読み込まれると、音が二重に鳴るなどの不具合が出る。
