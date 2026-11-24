import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { forbidden } from '../../common/api-error.js';
import type { ApiScope } from '../../domain/auth/api-key.js';
import { AuthService } from './auth.service.js';
import { PUBLIC_KEY, SCOPES_KEY } from './decorators.js';
import type { AuthenticatedRequest } from './principal.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_KEY, targets) === true) {
      return true;
    }
    const scopes = this.reflector.getAllAndOverride<readonly ApiScope[] | undefined>(
      SCOPES_KEY,
      targets,
    );
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    const principal = await this.auth.authenticate(typeof header === 'string' ? header : undefined);
    if (scopes === undefined || !scopes.includes(principal.scope)) throw forbidden();
    request.principal = principal;
    return true;
  }
}
