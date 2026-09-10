import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ClientSignalsDto {
  @IsBoolean()
  webdriver: boolean;

  @IsString()
  @IsNotEmpty()
  canvas_fingerprint: string;

  @IsNumber()
  time_on_page_ms: number;

  @IsNumber()
  mouse_moves: number;

  @IsNumber()
  mouse_clicks: number;

  @IsNumber()
  key_strokes: number;
}

export class IssueTokenDto {
  @IsString()
  @IsNotEmpty()
  domain: string;

  @IsBoolean()
  honeypot_filled: boolean;

  @ValidateNested()
  @Type(() => ClientSignalsDto)
  client_signals: ClientSignalsDto;

  /**
   * IP public do Widget tự báo cáo (lấy qua api.ipify.org trên browser).
   * Dùng làm fallback khi server không nhận được IP thật qua X-Forwarded-For
   * (thường xảy ra trong môi trường dev local không có reverse proxy).
   */
  @IsOptional()
  @IsString()
  client_reported_ip?: string;

  /**
   * Chế độ thử thách ép buộc (Dùng cho Demo / Testing / QA).
   */
  @IsOptional()
  @IsString()
  force_challenge?: 'none' | 'slider' | 'pow';
}
