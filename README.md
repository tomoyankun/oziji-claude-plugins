# oziji-claude-plugins

Claude Code の mod(プラグイン)を集めたリポジトリです。mod は、ステータス表示やスラッシュコマンドなど、Claude Code 自身のインターフェースや挙動を変更します。

このリポジトリは、Claude Code の marketplace です。`/plugin install` で、mod をインストールできます。

## mod 一覧

| mod | 内容 |
| --- | --- |
| `usage-status` | 5時間枠と1週間枠の使用量制限、およびセッションのトークン使用量を、モード行の下にゲージで常時表示する。50%以上は黄、80%以上は赤で表示する |
| `compact-assist` | コンテキスト使用率が70%に達したら、合図とボタンを表示する。ボタンを押すと、メモを書き出してから compact を実行する |

## インストール

前提: Claude Code をインストールし、`claude` コマンドが使える状態にします。

Claude Code のプロンプトに、次のコマンドを入力します。

```
/plugin install usage-status --marketplace tomoyankun/oziji-claude-plugins
```

1. 初回は `Add marketplace?` と表示されます。`y` を選びます。
2. スコープを選びます。
   - **user**: どのリポジトリで開いたセッションでも、mod が有効になります。
   - **project**: 導入先リポジトリの `.claude/settings.json` に、設定を記録します。チームで共有するときに使います。
3. インストール後、同じセッションで mod が有効になります。

GitHub 以外から取得するときは、`tomoyankun/oziji-claude-plugins` の代わりに、git の URL かローカルフォルダのパスを指定します。

### チームで共有する

導入先リポジトリの `.claude/settings.json` に、次の内容を書きます。そのリポジトリを開いて信頼したメンバー全員に、marketplace の追加と mod の有効化が案内されます。

```json
{
  "extraKnownMarketplaces": {
    "oziji-claude-plugins": {
      "source": { "source": "github", "repo": "tomoyankun/oziji-claude-plugins" }
    }
  },
  "enabledPlugins": {
    "usage-status@oziji-claude-plugins": true
  }
}
```

### 更新

1. `claude plugin marketplace update oziji-claude-plugins` を実行します。
2. `claude plugin update usage-status@oziji-claude-plugins` を実行します。
3. `/reload-plugins` を実行します。

## usage-status

ゲージの表示位置は、実行環境で異なります。

- ターミナル: モード行の下に、1行で表示します。色は使用率で変わります。

  50%未満(緑):

  ![50%未満の表示](./docs/image/usage-status-terminal-1.png)

  50%以上(黄):

  ![50%以上の表示](./docs/image/usage-status-terminal-2.png)

  80%以上(赤):

  ![80%以上の表示](./docs/image/usage-status-terminal-3.png)

- デスクトップアプリ: 右側の「使用量」ペインに、縦に並べて表示します。

  ```
  5h ████░░░░░░ 42% ↻ 18:30
  7d ██████░░░░ 63% ↻ 11/8 09:00
  context ██░░░░░░░░ 45k/200k (23%)
  ```

各ゲージの意味は、次のとおりです。

- `5h`: 5時間枠の使用率とリセット時刻。
- `7d`: 1週間枠の使用率とリセット日時。
- `context`: セッションのトークン使用量/上限と、使用率。

5時間枠と1週間枠の値は、サブスクリプションを使っているときだけ表示されます。

- 5時間枠と1週間枠のゲージに、リセット時刻(`↻`)を付けます。
- tmux のチームメイトのペインには、ゲージを表示しません。
- デスクトップアプリでは、モード行の下に加えて「使用量」ペインにもゲージを縦に並べて表示します。ペインはデスクトップアプリが接続すると自動で開きます(0.9.0 以降)。
  - `/usage-status pane`: ペインを開き、ターミナルでも次回から常に開きます。
  - `/usage-status pane off`: ペインを閉じ、デスクトップアプリでも開かなくします。
- `/usage-status` で、表示をオン・オフします。引数なしは反転します。`on` または `off` で指定できます。設定は `~/.claude/usage-status.json` に保存され、再起動後も保たれます。
- 既知の制限: アンケート表示中とエージェント transcript 表示中も、ゲージを表示します。`PromptHint` の props に、この2つの状態が無いためです。

## compact-assist

コンテキストが増えると、AI の精度が下がることがあります。`compact-assist` は、要約(`/compact`)の時機を知らせます。

- 使用率が70%以上: 赤色で「メモを残して /compact を実行」と、ボタン「メモを書いて compact」を表示します。
- ボタン: モデルに `~/.claude/compact-memo.md` を書かせます。書き終えたターンの直後に、`/compact` を自動で実行します。要約の指示には、メモを読み直す文を含めます。
- `/compact-memo`: メモを書かせるだけで、compact は実行しません。メモには、決定事項、未完了のタスク、次の操作、失敗した方法を書きます。既存のファイルは上書きします。

## ライセンス

[MIT License](./LICENSE) です。
