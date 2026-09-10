import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'crypto';

/**
 * JWT Guard bảo vệ toàn bộ /admin/v1/* endpoint.
 * Verify token HS256 thủ công (không dùng @nestjs/jwt để tránh thêm dependency).
 * Token được tạo ra bởi AdminService.login() theo cùng cách.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly secret = process.env.JWT_SECRET || 'vina-captcha-jwt-secret-key-3068';

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException({
        error: { code: 'missing_token', message: 'Authorization header bắt buộc' },
      });
    }

    const token = authHeader.slice(7);
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException({
        error: { code: 'invalid_token', message: 'Token không hợp lệ' },
      });
    }

    const [header, body, signature] = parts;

    // Verify signature
    const expectedSig = createHmac('sha256', this.secret)
      .update(`${header}.${body}`)
      .digest('base64url');

    if (expectedSig !== signature) {
      throw new UnauthorizedException({
        error: { code: 'invalid_token', message: 'Chữ ký token không hợp lệ' },
      });
    }

    // Verify expiry
    let payload: { sub: string; email: string; name: string; exp: number; role?: string };
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    } catch {
      throw new UnauthorizedException({
        error: { code: 'invalid_token', message: 'Không thể decode token' },
      });
    }

    if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) {
      throw new UnauthorizedException({
        error: { code: 'token_expired', message: 'Token đã hết hạn, vui lòng đăng nhập lại' },
      });
    }

    // Đính kèm thông tin account vào request để controller dùng nếu cần
    request.account = { id: payload.sub, email: payload.email, name: payload.name, role: payload.role || 'user' };
    return true;
  }
}
