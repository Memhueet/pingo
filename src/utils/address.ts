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
