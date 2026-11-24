import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { unauthorized } from '../../common/api-error.js';
import type { ApiScope } from '../../domain/auth/api-key.js';
import type { AuthenticatedRequest, Principal } from './principal.js';

export const SCOPES_KEY = 'auth:scopes';
export const PUBLIC_KEY = 'auth:public';

/** Restricts an endpoint to the given key scopes. Endpoints without @Scopes or @Public are rejected. */
export const Scopes = (...scopes: readonly [ApiScope, ...ApiScope[]]) =>
  applyDecorators(SetMetadata(SCOPES_KEY, scopes), ApiBearerAuth());

export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const { principal } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (principal === undefined) throw unauthorized();
    return principal;
  },
);
