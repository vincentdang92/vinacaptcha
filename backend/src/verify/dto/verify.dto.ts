import { IsNotEmpty, IsOptional, IsString, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ChallengeResponseDto {
  @IsString()
  type: string; // 'none', 'slider', 'pow'

  @IsNumber()
  @IsOptional()
  final_position?: number;

  @IsNumber()
  @IsOptional()
  drag_duration_ms?: number;

  @IsOptional()
  trajectory?: Array<{ x: number; y: number; t: number }>;

  @IsString()
  @IsOptional()
  nonce?: string;
}

export class VerifyDto {
  @IsString()
  @IsNotEmpty()
  session_id: string;

  @ValidateNested()
  @Type(() => ChallengeResponseDto)
  @IsOptional()
  challenge_response?: ChallengeResponseDto;
}

/**
 * Body của POST /v1/siteverify. Cố ý KHÔNG dùng class-validator: input sai (thiếu / rỗng / sai kiểu)
 * phải trả 200 { success: false } chứ không phải 400 — nhiều backend khách coi mọi mã khác 2xx là
 * "server captcha lỗi" và cho qua, nên một form gửi không kèm token sẽ vượt được captcha.
 * VerifyService.siteVerify tự kiểm tra kiểu dữ liệu.
 */
export interface SiteVerifyDto {
  secret?: unknown;
  verify_token?: unknown;
}
