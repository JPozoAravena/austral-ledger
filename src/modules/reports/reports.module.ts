import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsRepository } from './reports.repository.js';

@Module({ controllers: [ReportsController], providers: [ReportsRepository] })
export class ReportsModule {}
