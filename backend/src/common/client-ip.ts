import { isIP } from 'node:net';

/**
 * Các hop proxy được tin khi đọc X-Forwarded-For (cấu hình `trustProxy` của Fastify).
 *
 * Backend không publish cổng, chỉ nhận request từ gateway nginx trong mạng Docker (dải IP private).
 * Fastify đi từ phải sang trái trong chuỗi X-Forwarded-For và lấy địa chỉ ĐẦU TIÊN không thuộc các dải
 * này làm `request.ip` — nên phần client tự điền vào đầu header không bao giờ được dùng. Trước đây backend
 * lấy phần tử đầu tiên của header: bot đổi IP mỗi request để vượt rate-limit/ban, hoặc gài ban IP người khác.
 */
export const TRUSTED_PROXY_RANGES = 'loopback, linklocal, uniquelocal';

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const UNKNOWN_IP = '0.0.0.0';

/**
 * Chuẩn hóa IP client từ `request.ip` (đã áp dụng TRUSTED_PROXY_RANGES).
 *
 * Rate-limit, ban IP và ip_reputation đều khóa theo IP này, và cột `ip` trong DB kiểu INET — giá trị
 * không phải IP sẽ làm lỗi ghi log, nên thay bằng 0.0.0.0.
 *
 * `reportedIp` (widget tự báo qua api.ipify.org) chỉ dùng khi dev local không có gateway (IP kết nối là
 * loopback) và KHÔNG BAO GIỜ ở production, vì client tự điền được giá trị này.
 */
export function resolveClientIp(requestIp: string | undefined, reportedIp?: string): string {
  const ip = requestIp && isIP(requestIp) ? requestIp : UNKNOWN_IP;

  if (
    process.env.NODE_ENV !== 'production' &&
    LOOPBACK_IPS.has(ip) &&
    reportedIp &&
    isIP(reportedIp) &&
    !LOOPBACK_IPS.has(reportedIp)
  ) {
    return reportedIp;
  }

  return ip;
}
