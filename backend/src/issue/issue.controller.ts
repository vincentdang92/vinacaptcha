import { Body, Controller, Headers, Post, UnauthorizedException, HttpCode, HttpStatus, Ip } from '@nestjs/common';
import { IssueService } from './issue.service.js';
import { IssueTokenDto } from './dto/issue.dto.js';

const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

@Controller('v1')
export class IssueController {
  constructor(private readonly issueService: IssueService) {}

  @Post('issue')
  @HttpCode(HttpStatus.OK)
  async issueToken(
    @Headers('x-api-key') apiKey: string,
    @Headers('x-site-key') siteKeyHeader: string,
    @Headers('x-forwarded-for') forwardedFor: string,
    @Body() dto: IssueTokenDto,
    @Ip() rawIp: string,
  ) {
    const key = siteKeyHeader || apiKey;
    if (!key) {
      throw new UnauthorizedException({
        error: { code: 'missing_site_key', message: 'Thiếu Site Key trong headers (X-Site-Key hoặc X-Api-Key)' }
      });
    }

    // Ưu tiên theo thứ tự:
    // 1. X-Forwarded-For header (set bởi Nginx/reverse proxy trong production)
    // 2. Raw TCP connection IP (nếu không qua proxy)
    // 3. client_reported_ip từ widget (fallback cho dev local, widget tự fetch qua api.ipify.org)
    const proxyIp = forwardedFor?.split(',')[0]?.trim();
    const tcpIp = rawIp;
    const reportedIp = dto.client_reported_ip;

    let clientIp = proxyIp || tcpIp || '127.0.0.1';

    // Nếu IP từ TCP vẫn là localhost (dev không có proxy), dùng IP do widget báo cáo
    if (LOCALHOST_IPS.has(clientIp) && reportedIp && !LOCALHOST_IPS.has(reportedIp)) {
      clientIp = reportedIp;
    }

    return this.issueService.issueToken(key, dto, clientIp);
  }
}
