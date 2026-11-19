# Game #0004 実機受け入れテスト手順（Windows 11）

この手順は、同じ信頼できる自宅Wi-Fiに接続したiPhone、Android、iPad、Windows PCから一時的にGame #0004へアクセスするためのものです。インターネット公開ではありません。

## 1. PowerShellを開いてゲームへ移動

```powershell
cd "$HOME\Desktop\学習\40_生成AI\99_tool\Codex\10_ゲーム開発\games\0004_wobbly-tower"
```

## 2. Windows PCのIPv4を毎回確認

```powershell
ipconfig
```

`Wireless LAN adapter Wi-Fi`の次を確認します。

- IPv4 Address
- Default Gateway

表示されたIPv4を以降のコマンドとURLに使います。Wi-Fi再接続やルーター再起動で値が変わることがあるため、テストのたびに確認します。VPNや仮想アダプターではなく、デフォルトゲートウェイが表示されるWi-Fiを選びます。

ネットワークプロファイルを確認できる場合は次も実行します。読み取りだけで、設定は変更しません。

```powershell
Get-NetConnectionProfile
```

自宅Wi-Fiが意図したネットワーク名であることを確認してください。

## 3. LANテストサーバーを起動

今回確認したIPv4を使う場合：

```powershell
node tests/preview-server.mjs --host 192.168.0.123
```

PowerShellに次のURLが表示されれば起動成功です。

```text
Game #0004 LAN test preview: http://192.168.0.123:4174
```

このPowerShellはテスト終了まで閉じません。

## 4. 各端末から開く

4端末をWindows PCと同じ自宅Wi-Fiへ接続し、ブラウザのアドレス欄へ次を入力します。

```text
http://192.168.0.123:4174/
```

| 端末 | ブラウザ | URL |
| --- | --- | --- |
| iPhone | Safari | `http://192.168.0.123:4174/` |
| Android | Chrome | `http://192.168.0.123:4174/` |
| iPad | Safari | `http://192.168.0.123:4174/` |
| Windows PC | Chrome / Edge | `http://192.168.0.123:4174/` |

上記の`192.168.0.123`は入力例です。実際には`ipconfig`で確認したIPv4へ置き換えます。`https://`ではなく`http://`です。

## 5. 接続できない場合

順番に確認します。

1. サーバーを起動したPowerShellが開いたままか。
2. URL、IPv4、ポート`4174`、`http://`が正しいか。
3. 全端末が同じ自宅Wi-Fiに接続されているか。モバイル通信だけになっていないか。
4. Windows PCのIPv4が`ipconfig`実行時から変わっていないか。
5. VPNがPCまたは端末でLAN通信を遮断していないか。必要ならユーザー判断で一時停止し、テスト後に元へ戻す。
6. ルーターのゲストWi-FiやAP isolation／端末間通信禁止を使っていないか。
7. Windows PC自身のChrome／EdgeでLAN URLを開けるか。

PCでは開けるのに他端末だけ接続できない場合、Windowsファイアウォールが受信を遮断している可能性があります。

- ファイアウォールを無効にしないでください。
- ルーターのポート転送を設定しないでください。
- 恒久例外を作成しないでください。
- Windowsセキュリティの許可画面が出た場合は、安易に許可せず、対象がNode.js、現在の自宅Wi-Fi、プライベートネットワークのみであることを確認してください。
- 一時的なPrivateネットワーク／TCP 4174限定の許可が必要なら、実行前にユーザーが範囲と削除手順を判断してください。今回の作業ではファイアウォールを変更していません。

## 6. サーバーを停止

サーバーを起動したPowerShellを選び、次を押します。

```text
Ctrl + C
```

停止後はLAN用URLへ接続できなくなります。

## 7. 元の安全な状態へ戻す

1. `Ctrl+C`でLANサーバーを停止する。
2. テスト用にVPNを停止した場合は元へ戻す。
3. 今回はファイアウォール・ルーター設定を変更していないため、戻す設定はありません。
4. PCだけで確認するときは次の通常起動を使います。

```powershell
npm run preview
```

通常起動は`http://127.0.0.1:4174/`だけで待ち受け、他端末からは接続できません。
