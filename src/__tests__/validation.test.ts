import { describe, expect, it } from "vitest";
import { isValidAddress, isValidIpv6 } from "../validation";
import { compareAddresses } from "../utils/address";

describe("isValidIpv6", () => {
  it.each([
    ["2001:db8::1", true],
    ["::1", true],
    ["::", true],
    ["2001:db8:0:0:0:0:0:1", true],
    ["::ffff:192.168.1.1", true],
    ["fe80::1", true],
    ["1::2::3", false],
    ["2001:db8:::1", false],
    ["1.2.3.4::5", false],
    ["1.2.3.4::", false],
    ["12345::", false],
    [":1:2", false],
    ["1:2:", false],
    ["fe80::1%eth0", false],
    ["example.com", false],
    ["192.168.1.1", false],
  ])("isValidIpv6(%s) = %s", (input, expected) => {
    expect(isValidIpv6(input)).toBe(expected);
  });
});

describe("isValidAddress", () => {
  it("同时接受 IPv4 与 IPv6 字面量，拒绝域名", () => {
    expect(isValidAddress("192.168.1.1")).toBe(true);
    expect(isValidAddress("2001:db8::1")).toBe(true);
    expect(isValidAddress("example.com")).toBe(false);
  });
});

describe("compareAddresses", () => {
  it("IPv4 按数值比较而非字典序", () => {
    expect(compareAddresses("10.0.0.10", "10.0.0.2")).toBeGreaterThan(0);
  });
  it("IPv4 恒排在 IPv6 之前，IPv6 间按字符串比较", () => {
    expect(compareAddresses("2001:db8::1", "192.168.1.1")).toBeGreaterThan(0);
    expect(compareAddresses("::1", "2001:db8::1")).toBeLessThan(0);
  });
  it("跨 128.0.0.0 边界排序不回绕", () => {
    expect(compareAddresses("255.255.255.255", "128.0.0.0")).toBeGreaterThan(0);
    expect(compareAddresses("127.255.255.255", "128.0.0.0")).toBeLessThan(0);
  });
});
