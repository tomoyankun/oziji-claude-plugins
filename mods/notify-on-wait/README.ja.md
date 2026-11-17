# notify-on-wait

[English](./README.md) | 日本語

Claude Code があなたの操作を待っているとき、知らせます。音を鳴らし、回答するまで、プロンプト上の帯を点滅させます。

## インストール

```
/plugin install notify-on-wait --marketplace tomoyankun/oziji-claude-plugins
```

スコープの選択、チームでの共有、更新の手順は、[ルートの README](../../README.ja.md) を参照してください。

## 動作

- 対象: 許可の確認、モデルからの質問、およびチームメイトの許可の確認と質問です。
- 音: 同梱の WAV(0.3秒)を1回鳴らします。許可の確認は 880 Hz、質問は 660 Hz です。
- 点滅: 回答するまで、プロンプト上の帯と、右側の「Waiting for input」ペインを点滅させます。
- 同じ待ちに対して、音を重ねて鳴らしません。

## 音の再生

| OS | コマンド |
| --- | --- |
| mac | `afplay` |
| Linux | `paplay`。失敗したときは `aplay` |
| WSL | `powershell.exe` 経由の `System.Media.SoundPlayer` |

mod は、次のコマンドを実行します。他のコマンドは実行しません。

1. `uname -sr` で、OS を判定します。
2. WSL では、`wslpath -w <WAV のパス>` で、WAV のパスを Windows 形式に変換します。
3. WSL では、`powershell.exe -NoProfile -Command "(New-Object System.Media.SoundPlayer '<Windows 形式のパス>').PlaySync()"` で、WAV を再生します。パス内の `'` は、2個に置き換えます。
4. mac では、`afplay <WAV のパス>` で、WAV を再生します。
5. Linux では、`paplay <WAV のパス>` で、WAV を再生します。`paplay` が失敗したとき、または存在しないときは、`aplay -q <WAV のパス>` で再生します。

どのコマンドにも、タイムアウトがあります(`uname` と `wslpath` は3秒、再生は5秒)。mod が再生するのは、mod 自身の `sounds/` フォルダの WAV だけです。他のデータの読み取りと送信は、しません。

mac、Linux、WSL 以外の OS では、再生コマンドを実行せず、音は鳴りません。判定または再生が失敗したときも、音は鳴らず、エラーも表示しません。`wslpath` が失敗したときも、空のパスで `powershell.exe` を実行し、音は鳴りません。

## 制限事項

- WSL(tmux と VS Code のターミナル)でだけ動作を確認しています。mac と Linux では未確認です。
- ペインは、ターミナルの幅が110桁以上のときだけ開きます。tmux の分割が狭いときは、音だけが鳴ります。
- 質問のダイアログが表示されている間は、プロンプト上の帯が非表示になります。
- チームメイトの待ちに対する回答は、検知できません。点滅は30秒後に止まります。
- 再生コマンドがない環境では、音が鳴りません。
