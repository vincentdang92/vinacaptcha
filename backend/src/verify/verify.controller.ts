import { Body, Controller, Post, HttpCode, HttpStatus, Ip } from '@nestjs/common';
import { VerifyService } from './verify.service.js';
import { VerifyDto, SiteVerifyDto } from './dto/verify.dto.js';
import { resolveClientIp } from '../common/client-ip.js';

@Controller('v1')
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyChallenge(
    @Body() dto: VerifyDto,
    @Ip() requestIp: string,
  ) {
    const clientIp = resolveClientIp(requestIp);
    return this.verifyService.verifyChallenge(dto, clientIp);
  }

  @Post('siteverify')
  @HttpCode(HttpStatus.OK)
  async siteVerify(@Body() dto: SiteVerifyDto) {
    return this.verifyService.siteVerify(dto);
  }
}
