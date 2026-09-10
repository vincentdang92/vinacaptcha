import { Body, Controller, Post, HttpCode, HttpStatus, Ip, Headers } from '@nestjs/common';
import { VerifyService } from './verify.service.js';
import { VerifyDto, SiteVerifyDto } from './dto/verify.dto.js';

@Controller('v1')
export class VerifyController {
  constructor(private readonly verifyService: VerifyService) {}

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyChallenge(
    @Body() dto: VerifyDto,
    @Headers('x-forwarded-for') forwardedFor: string,
    @Ip() rawIp: string,
  ) {
    const clientIp = (forwardedFor?.split(',')[0]?.trim()) || rawIp || '127.0.0.1';
    return this.verifyService.verifyChallenge(dto, clientIp);
  }

  @Post('siteverify')
  @HttpCode(HttpStatus.OK)
  async siteVerify(@Body() dto: SiteVerifyDto) {
    return this.verifyService.siteVerify(dto);
  }
}
