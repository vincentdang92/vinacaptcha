import { Body, Controller, Headers, Post, UnauthorizedException, HttpCode, HttpStatus, Ip } from '@nestjs/common';
import { IssueService } from './issue.service.js';
import { IssueTokenDto } from './dto/issue.dto.js';
import { resolveClientIp } from '../common/client-ip.js';

@Controller('v1')
export class IssueController {
  constructor(private readonly issueService: IssueService) {}

  @Post('issue')
  @HttpCode(HttpStatus.OK)
  async issueToken(
    @Headers('x-api-key') apiKey: string,
    @Headers('x-site-key') siteKeyHeader: string,
    @Body() dto: IssueTokenDto,
    @Ip() requestIp: string,
  ) {
    const key = siteKeyHeader || apiKey;
    if (!key) {
      throw new UnauthorizedException({
        error: { code: 'missing_site_key', message: 'Thiếu Site Key trong headers (X-Site-Key hoặc X-Api-Key)' }
      });
    }

    const clientIp = resolveClientIp(requestIp, dto.client_reported_ip);

    return this.issueService.issueToken(key, dto, clientIp);
  }
}
