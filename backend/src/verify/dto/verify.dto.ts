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

export class SiteVerifyDto {
  @IsString()
  @IsNotEmpty()
  secret: string;

  @IsString()
  @IsNotEmpty()
  verify_token: string;
}
