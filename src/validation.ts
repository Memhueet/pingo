export function isValidIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false;
    const number = Number(part);
    return number >= 0 && number <= 255;
  });
}

/** IPv6 字面量校验：组 0–ffff，"::" 至多一次，末组允许内嵌 IPv4，拒绝 zone index */
export function isValidIpv6(value: string): boolean {
  if (value.includes("%")) return false;
  const sections = value.split("::");
  if (sections.length > 2) return false;

  const parseGroups = (part: string, allowEmbeddedIpv4: boolean): number[] | null => {
    if (part === "") return [];
    const groups = part.split(":");
    const out: number[] = [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      // 内嵌 IPv4 仅允许出现在整地址的最后一组（tail 末组），折算为 2 个 16 位组
      if (allowEmbeddedIpv4 && i === groups.length - 1 && group.includes(".")) {
        if (!isValidIpv4(group)) return null;
        const octets = group.split(".").map(Number);
        out.push(((octets[0] << 8) | octets[1]) >>> 0, ((octets[2] << 8) | octets[3]) >>> 0);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };

  if (sections.length === 2) {
    // "::" 左侧（head）一律不接受内嵌 IPv4
    const head = parseGroups(sections[0], false);
    const tail = parseGroups(sections[1], true);
    if (head === null || tail === null) return false;
    // "::" 至少替掉一组
    return head.length + tail.length <= 7;
  }
  const groups = parseGroups(sections[0], true);
  return groups !== null && groups.length === 8;
}

/** 目标地址校验入口：IPv4 或 IPv6 字面量 */
export function isValidAddress(value: string): boolean {
  return isValidIpv4(value) || isValidIpv6(value);
}
