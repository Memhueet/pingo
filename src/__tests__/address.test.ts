import { describe, expect, it } from "vitest";
import {
  compareAddresses,
  incrementAddress,
  sameAddress,
} from "../utils/address";

describe("incrementAddress", () => {
  it.each([
    ["192.168.0.10", "192.168.0.11"],
    ["192.168.0.0", "192.168.0.1"],
    ["192.168.0.255", "192.168.0.1"],
    ["255.255.255.255", "255.255.255.1"],
    // IPv6 末组 +1
    ["2001:db8::1", "2001:db8::2"],
    ["fe80::fffe", "fe80::ffff"],
    // 末组到达最大值回绕到 1
    ["fe80::ffff", "fe80::1"],
    ["::ffff", "::1"],
    // "::" 结尾视作追加末组
    ["fe80::", "fe80::1"],
    // 内嵌 IPv4 末组按末字节自增
    ["64:ff9b::1.2.3.4", "64:ff9b::1.2.3.5"],
    ["64:ff9b::1.2.3.255", "64:ff9b::1.2.3.1"],
  ])("%s -> %s", (input, expected) => {
    expect(incrementAddress(input)).toBe(expected);
  });
});

describe("sameAddress", () => {
  it("忽略 IPv6 十六进制大小写", () => {
    expect(sameAddress("FE80::A", "fe80::a")).toBe(true);
  });

  it("IPv4 区分不同地址", () => {
    expect(sameAddress("192.168.0.1", "192.168.0.2")).toBe(false);
  });
});

describe("compareAddresses 批量复制取最大 IP", () => {
  it("按末段数值取最大", () => {
    const addrs = ["192.168.0.15", "192.168.0.12", "192.168.0.10"];
    const max = addrs.reduce((m, a) => (compareAddresses(a, m) > 0 ? a : m));
    expect(max).toBe("192.168.0.15");
  });
});
