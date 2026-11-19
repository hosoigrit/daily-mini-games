import test from "node:test";
import assert from "node:assert/strict";
import { isPrivateIpv4, parseServerOptions } from "./preview-server.mjs";

test("LAN-01: 通常起動は127.0.0.1:4174を維持する", () => {
  assert.deepEqual(parseServerOptions([], {}), {
    host: "127.0.0.1",
    port: 4174,
    lanMode: false,
  });
});

test("LAN-02: --host指定時だけRFC1918アドレスでLANモードになる", () => {
  assert.deepEqual(parseServerOptions(["--host", "192.168.0.123"], {}), {
    host: "192.168.0.123",
    port: 4174,
    lanMode: true,
  });
});

test("LAN-03: RFC1918の3範囲だけをプライベートIPv4と判定する", () => {
  for (const host of ["10.0.0.1", "172.16.0.1", "172.31.255.254", "192.168.1.20"]) {
    assert.equal(isPrivateIpv4(host), true, host);
  }
  for (const host of ["0.0.0.0", "127.0.0.1", "172.32.0.1", "8.8.8.8", "example.test"]) {
    assert.equal(isPrivateIpv4(host), false, host);
  }
});

test("LAN-04: 0.0.0.0・公開IP・loopbackの--host指定を拒否する", () => {
  for (const host of ["0.0.0.0", "127.0.0.1", "8.8.8.8", "not-an-ip"]) {
    assert.throws(() => parseServerOptions(["--host", host], {}), /private IPv4/);
  }
});

test("LAN-05: --portと従来の位置引数ポートを維持する", () => {
  assert.equal(parseServerOptions(["--port", "4180"], {}).port, 4180);
  assert.equal(parseServerOptions(["4176"], {}).port, 4176);
  assert.equal(parseServerOptions([], { PORT: "4190" }).port, 4190);
});

test("LAN-06: 不正ポート・不足値・未知オプションを拒否する", () => {
  for (const args of [["--port", "0"], ["--port", "65536"], ["--host"], ["--unknown"]]) {
    assert.throws(() => parseServerOptions(args, {}));
  }
});

test("LAN-07: --host= と --port= 形式を受け付ける", () => {
  assert.deepEqual(parseServerOptions(["--host=10.1.2.3", "--port=4200"], {}), {
    host: "10.1.2.3",
    port: 4200,
    lanMode: true,
  });
});
