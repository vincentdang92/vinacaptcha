import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
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

  @IsOptional()
  @IsString()
  action?: string;

  // UX & CRO Interaction Signals
  @IsOptional()
  @IsNumber()
  execution_count?: number;

  @IsOptional()
  @IsNumber()
  total_page_duration_ms?: number;

  @IsOptional()
  @IsBoolean()
  paste_detected?: boolean;

  @IsOptional()
  @IsNumber()
  tab_switch_count?: number;

  @IsOptional()
  @IsNumber()
  scroll_depth_pct?: number;

  @IsOptional()
  @IsNumber()
  form_focus_delay_ms?: number;

  // Device & Screen Environment
  @IsOptional()
  @IsNumber()
  screen_width?: number;

  @IsOptional()
  @IsNumber()
  screen_height?: number;

  @IsOptional()
  @IsNumber()
  color_depth?: number;

  @IsOptional()
  @IsNumber()
  pixel_ratio?: number;

  @IsOptional()
  @IsNumber()
  device_memory?: number;

  @IsOptional()
  @IsNumber()
  hardware_concurrency?: number;

  @IsOptional()
  @IsBoolean()
  touch_support?: boolean;

  @IsOptional()
  @IsString()
  gpu_renderer?: string;

  // Localization & Region
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsNumber()
  timezone_offset?: number;

  @IsOptional()
  languages?: string[];

  // Network Performance
  @IsOptional()
  @IsString()
  connection_type?: string;

  @IsOptional()
  @IsNumber()
  rtt_ms?: number;

  // Marketing Attribution
  @IsOptional()
  @IsString()
  referrer?: string;

  @IsOptional()
  @IsString()
  landing_path?: string;

  @IsOptional()
  @IsString()
  utm_source?: string;

  @IsOptional()
  @IsString()
  utm_medium?: string;

  @IsOptional()
  @IsString()
  utm_campaign?: string;

  @IsOptional()
  @IsString()
  utm_term?: string;

  @IsOptional()
  @IsString()
  utm_content?: string;
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

  @IsOptional()
  @IsString()
  action?: string;

  /**
   * IP public do Widget tự báo cáo (lấy qua api.ipify.org trên browser).
   * Dùng làm fallback khi server không nhận được IP thật qua X-Forwarded-For
   * (thường xảy ra trong môi trường dev local không có reverse proxy).
   */
  @IsOptional()
  @IsString()
  client_reported_ip?: string;

  /**
   * Yêu cầu tối thiểu một loại thử thách (VD: form đăng nhập / nạp tiền luôn muốn slider).
   * Chỉ có tác dụng khi NÂNG mức so với lựa chọn của site / risk engine; 'auto' và 'none'
   * được giữ lại để tương thích client cũ nhưng không hạ được mức thử thách.
   */
  @IsOptional()
  @IsIn(['auto', 'none', 'slider', 'pow'])
  force_challenge?: 'auto' | 'none' | 'slider' | 'pow';
}
