//! Windows 原生 ICMP 探测：IcmpSendEcho（IPv4）/ Icmp6SendEcho2（IPv6）。
//! 免管理员权限，且摆脱对系统 ping 文本输出的 locale 依赖。

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use windows_sys::Win32::Foundation::{GetLastError, HANDLE, INVALID_HANDLE_VALUE};
use windows_sys::Win32::NetworkManagement::IpHelper::{
    Icmp6CreateFile, Icmp6SendEcho2, IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho,
    ICMP_ECHO_REPLY, ICMPV6_ECHO_REPLY_LH,
};
use windows_sys::Win32::Networking::WinSock::{AF_INET6, IN6_ADDR, SOCKADDR_IN6};

use super::map_ip_status;
use super::ParsedPing;
use crate::error::{AppError, CommandResult};

/// 探测负载大小，对齐 Windows ping 默认的 32 字节
const REQUEST_SIZE: usize = 32;

pub async fn probe(address: &str, timeout_secs: u64) -> CommandResult<ParsedPing> {
    let addr: IpAddr = address.parse().map_err(|_| AppError::InvalidAddress)?;
    // 同步阻塞 API 放入阻塞线程池，避免占用异步 worker
    tokio::task::spawn_blocking(move || match addr {
        IpAddr::V4(v4) => probe_v4(v4, timeout_secs),
        IpAddr::V6(v6) => probe_v6(v6, timeout_secs),
    })
    .await
    .map_err(|e| AppError::PingCommand(e.to_string()))?
}

fn probe_v4(addr: Ipv4Addr, timeout_secs: u64) -> CommandResult<ParsedPing> {
    unsafe {
        let handle = IcmpCreateFile();
        if handle == INVALID_HANDLE_VALUE {
            return Err(AppError::PingCommand("IcmpCreateFile 失败".into()).into());
        }
        let result = send_echo_v4(handle, addr, timeout_secs);
        IcmpCloseHandle(handle);
        result
    }
}

fn probe_v6(addr: Ipv6Addr, timeout_secs: u64) -> CommandResult<ParsedPing> {
    unsafe {
        let handle = Icmp6CreateFile();
        if handle == INVALID_HANDLE_VALUE {
            return Err(AppError::PingCommand("Icmp6CreateFile 失败".into()).into());
        }
        let result = send_echo_v6(handle, addr, timeout_secs);
        IcmpCloseHandle(handle);
        result
    }
}

fn send_echo_v4(handle: HANDLE, addr: Ipv4Addr, timeout_secs: u64) -> CommandResult<ParsedPing> {
    let request = [0u8; REQUEST_SIZE];
    let reply_size = (std::mem::size_of::<ICMP_ECHO_REPLY>() + REQUEST_SIZE + 8) as u32;
    let mut reply_buf = vec![0u8; reply_size as usize];
    let timeout_ms = timeout_millis(timeout_secs);

    // inet_addr 风格的网络字节序目标地址（详见 ping::ipv4_dest_u32 的说明）
    let dest = super::ipv4_dest_u32(addr);

    let replies = unsafe {
        IcmpSendEcho(
            handle,
            dest,
            request.as_ptr().cast(),
            REQUEST_SIZE as u16,
            std::ptr::null(),
            reply_buf.as_mut_ptr().cast(),
            reply_size,
            timeout_ms,
        )
    };

    if replies == 0 {
        // 无应答：按 GetLastError 的 IP_STATUS 区分超时与其他错误
        let status = unsafe { GetLastError() } as u32;
        return Ok(map_ip_status(status, 0));
    }

    // reply_buf 为 Vec<u8>（对齐 1），这里依赖全局分配器 16 字节对齐的保证按
    // ICMP_ECHO_REPLY 读取安全，且仅读取 Status/RoundTripTime 等 u32 字段；
    // 若将来要读取 Data/Options 字段，需改用 read_unaligned/addr_of!
    let reply = unsafe { &*(reply_buf.as_ptr().cast::<ICMP_ECHO_REPLY>()) };
    Ok(map_ip_status(reply.Status, reply.RoundTripTime))
}

fn send_echo_v6(handle: HANDLE, addr: Ipv6Addr, timeout_secs: u64) -> CommandResult<ParsedPing> {
    let request = [0u8; REQUEST_SIZE];
    let reply_size = (std::mem::size_of::<ICMPV6_ECHO_REPLY_LH>() + REQUEST_SIZE + 8) as u32;
    let mut reply_buf = vec![0u8; reply_size as usize];
    let timeout_ms = timeout_millis(timeout_secs);

    // source 传未指定地址（::），由系统选择出接口
    let mut source: SOCKADDR_IN6 = unsafe { std::mem::zeroed() };
    source.sin6_family = AF_INET6;
    let mut dest: SOCKADDR_IN6 = unsafe { std::mem::zeroed() };
    dest.sin6_family = AF_INET6;
    dest.sin6_addr = in6_addr(addr);

    let replies = unsafe {
        Icmp6SendEcho2(
            handle,
            std::ptr::null_mut(), // 同步调用，不使用事件
            None, // 不使用 APC 回调
            std::ptr::null(),
            &source,
            &dest,
            request.as_ptr().cast(),
            REQUEST_SIZE as u16,
            std::ptr::null(),
            reply_buf.as_mut_ptr().cast(),
            reply_size,
            timeout_ms,
        )
    };

    if replies == 0 {
        let status = unsafe { GetLastError() } as u32;
        return Ok(map_ip_status(status, 0));
    }

    // 同上：reply_buf 为 Vec<u8>（对齐 1），依赖全局分配器 16 字节对齐的保证按
    // ICMPV6_ECHO_REPLY_LH 读取安全，且仅读取 u32 字段；
    // 若将来要读取 Data/Options 字段，需改用 read_unaligned/addr_of!
    let reply = unsafe { &*(reply_buf.as_ptr().cast::<ICMPV6_ECHO_REPLY_LH>()) };
    Ok(map_ip_status(reply.Status, reply.RoundTripTime))
}

fn in6_addr(addr: Ipv6Addr) -> IN6_ADDR {
    let mut raw: IN6_ADDR = unsafe { std::mem::zeroed() };
    raw.u.Byte = addr.octets();
    raw
}

fn timeout_millis(timeout_secs: u64) -> u32 {
    timeout_secs.saturating_mul(1000).min(u32::MAX as u64) as u32
}
