import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiZodBody } from '../../common/openapi.js';
import { ZodValidationPipe } from '../../common/zod.pipe.js';
import { CurrentPrincipal, Scopes } from '../auth/decorators.js';
import type { Principal } from '../auth/principal.js';
import { toAccountResponse, toPostingResponse } from './accounts.presenter.js';
import {
  createAccountBody,
  type CreateAccountBody,
  postingsQuery,
  type PostingsQuery,
  uuidParam,
} from './accounts.schemas.js';
import { AccountsService } from './accounts.service.js';

@ApiTags('accounts')
@Controller('v1/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  @Scopes('platform')
  @ApiZodBody(createAccountBody)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(createAccountBody)) body: CreateAccountBody,
  ) {
    return toAccountResponse(await this.accounts.createWallet(principal, body.ownerRef));
  }

  @Get(':id')
  @Scopes('platform', 'user', 'ops', 'auditor')
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ZodValidationPipe(uuidParam)) id: string,
  ) {
    return toAccountResponse(await this.accounts.getReadable(principal, id));
  }

  @Get(':id/postings')
  @Scopes('platform', 'user', 'ops', 'auditor')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async postings(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ZodValidationPipe(uuidParam)) id: string,
    @Query(new ZodValidationPipe(postingsQuery)) query: PostingsQuery,
  ) {
    const page = await this.accounts.listPostings(principal, id, query);
    return { items: page.items.map(toPostingResponse), nextCursor: page.nextCursor };
  }
}
