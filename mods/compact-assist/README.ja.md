# compact-assist

[English](./README.md) | 日本語

コンテキスト使用率が70%に達したら、compact の合図を、モード行の下に表示します。コンテキストが増えると、AI の精度が下がることがあります。この mod は、要約(`/compact`)をするタイミングを知らせます。

## インストール

```
/plugin install compact-assist --marketplace tomoyankun/oziji-claude-plugins
```

スコープの選択、チームでの共有、更新の手順は、[ルートの README](../../README.ja.md) を参照してください。

## 動作

- 使用率が70%以上: 赤の「context N%:」と、ボタン「メモを残して /compact を実行」を表示します。
- ボタン: モデルに `~/.claude/compact-memo.md` を書かせます。メモを書いたターンの直後に、mod が `/compact` を自動で実行します。要約の指示には、メモをもう一度読むようモデルに伝える1文を含めます。

## コマンド

| コマンド | 動作 |
| --- | --- |
| `/compact-memo` | モデルにメモを書かせる。compact は実行しない |

メモには、決定事項、未完了のタスク、次の作業、失敗した方法を書きます。既存のファイルは上書きされます。
