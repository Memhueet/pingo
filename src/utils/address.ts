function ipv4ToNum(ip: string): number {
  // 累加结果用 >>> 0 归一回无符号，避免首段 ≥ 128 时 int32 符号位回绕成负数
  return ip.split(".").reduce((acc, octet) => ((acc << 8) + parseInt(octet)) >>> 0, 0);
}

/** IP 排序比较（a-b 语义）：IPv4 按数值，IPv6 间按字符串；IPv4 恒排在 IPv6 之前 */
export function compareAddresses(a: string, b: string): number {
  const aIsV6 = a.includes(":");
  const bIsV6 = b.includes(":");
  if (aIsV6 !== bIsV6) return aIsV6 ? 1 : -1;
  if (aIsV6) return a.localeCompare(b);
  return ipv4ToNum(a) - ipv4ToNum(b);
}

/** 地址末段自增：仅修改最后一个数字段，前缀保持不变；末段到达最大值时回绕到 1 */
export function incrementAddress(address: string): string {
  if (!address.includes(":")) {
    const octets = address.split(".");
    const last = Number(octets[3]);
    octets[3] = String(last === 255 ? 1 : last + 1);
    return octets.join(".");
  }
  // IPv6：以 "::" 结尾（无显式末组）视作追加 ":1"；内嵌 IPv4 末组则末字节自增
  if (address.endsWith(":")) return `${address}1`;
  const head = address.slice(0, address.lastIndexOf(":") + 1);
  const tail = address.slice(address.lastIndexOf(":") + 1);
  if (tail.includes(".")) {
    const octets = tail.split(".");
    const last = Number(octets[3]);
    octets[3] = String(last === 255 ? 1 : last + 1);
    return head + octets.join(".");
  }
  const value = parseInt(tail, 16);
  return head + (value === 0xffff ? "1" : (value + 1).toString(16));
}

/** 地址相等：忽略大小写，覆盖 IPv6 十六进制大小写差异 */
export function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
