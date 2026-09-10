import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.account;

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException({
        error: { code: 'access_denied', message: 'Bạn không có quyền thực hiện hành động này.' },
      });
    }

    return true;
  }
}
