# oziji-claude-plugins

Claude Code の mod(プラグイン)を集めたリポジトリです。mod は、ステータス表示やスラッシュコマンドなど、Claude Code 自身のインターフェースや挙動を変更します。

このリポジトリは、Claude Code の marketplace です。`/plugin install` で、mod をインストールできます。

## mod 一覧

| mod | 内容 |
| --- | --- |
| `usage-status` | 5時間枠と1週間枠の使用量制限、およびセッションのトークン使用量を、モード行の下にゲージで常時表示する。50%以上は黄、80%以上は赤で表示する |

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

5時間枠と1週間枠の値は、サブスクリプションを使っているときだけ表示されます。

- 5時間枠と1週間枠のゲージに、リセット時刻(`↻`)を付けます。
- tmux のチームメイトのペインには、ゲージを表示しません。
- `/usage-status` で、表示をオン・オフします。引数なしは反転します。`on` または `off` で指定できます。設定は `~/.claude/usage-status.json` に保存され、再起動後も保たれます。
- 既知の制限: アンケート表示中とエージェント transcript 表示中も、ゲージを表示します。`PromptHint` の props に、この2つの状態が無いためです。

## ライセンス

[MIT License](./LICENSE) です。
