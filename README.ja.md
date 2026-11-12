# oziji-claude-plugins

[English](./README.md) | 日本語

Claude Code の mod(プラグイン)を集めたリポジトリです。mod は、ステータス表示やスラッシュコマンドなど、Claude Code 自身のインターフェースや挙動を変更します。

このリポジトリは、Claude Code の marketplace です。`/plugin install` で、mod をインストールできます。

## mod 一覧

| mod | 内容 |
| --- | --- |
| [`usage-status`](./mods/usage-status/README.ja.md) | 5時間枠と1週間枠の使用量制限、およびセッションのトークン使用量を、モード行の下にゲージで常時表示する。50%以上は黄、80%以上は赤で表示する |
| [`compact-assist`](./mods/compact-assist/README.ja.md) | コンテキスト使用率が70%に達したら、合図とボタンを表示する。ボタンを押すと、メモを書き出してから compact を実行する |
| [`notify-on-wait`](./mods/notify-on-wait/README.ja.md) | 許可の確認とモデルからの質問が出たとき、0.3秒の音を鳴らす。回答するまで、プロンプト上の帯とペインを点滅させる |
| [`session-rm`](./mods/session-rm/README.ja.md) | 現在のプロジェクトのセッションをペインに一覧表示する(`/session-rm`)。選んだ1件を、関連データごと削除する |
| [`session-tag`](./mods/session-tag/README.ja.md) | 現在のプロジェクトのセッションにタグを付けて、ペインに一覧表示する(`/session-tag`)。内容タグは Claude が付け、完了の印は手で付ける |

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

## ライセンス

[MIT License](./LICENSE) です。
