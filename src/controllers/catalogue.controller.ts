import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  BurnCatalogueService,
  CreateCatalogueItemInput,
  UpdateCatalogueItemInput,
  CatalogueFilters,
} from '../services/burn-catalogue.service';
import { RedemptionType } from '../db/models/burn-catalogue-item.model';

interface AuthedRequest extends Request {
  tenantId?: string;
  userId?: string;
}

@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: BurnCatalogueService) {}

  /** GET /api/v1/catalogue — list active items for tenant */
  @Get()
  async list(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('redemption_type') redemptionType: string,
    @Query('max_points_cost') maxPointsCost: string,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? '';
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenantId is required' });
      return;
    }

    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    if (isNaN(pageNum) || pageNum < 1) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'page must be a positive integer' });
      return;
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'limit must be an integer between 1 and 100' });
      return;
    }

    const filters: CatalogueFilters = {};
    if (redemptionType) {
      filters.redemption_type = redemptionType as RedemptionType;
    }
    if (maxPointsCost) {
      const parsed = parseInt(maxPointsCost, 10);
      if (isNaN(parsed)) {
        res.status(HttpStatus.BAD_REQUEST).json({ error: 'max_points_cost must be an integer' });
        return;
      }
      filters.max_points_cost = parsed;
    }

    const result = await this.catalogueService.listCatalogueItems(
      tenantId,
      filters,
      pageNum,
      limitNum,
    );

    res.status(HttpStatus.OK).json(result);
  }

  /** GET /api/v1/catalogue/my-redemptions — member's redemption history */
  @Get('my-redemptions')
  async myRedemptions(@Req() req: AuthedRequest, @Res() res: Response): Promise<void> {
    const tenantId = req.tenantId ?? '';
    const memberId = req.userId ?? '';

    if (!memberId || !tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'auth required' });
      return;
    }

    const redemptions = await this.catalogueService.getMyRedemptions(memberId, tenantId);
    res.status(HttpStatus.OK).json({ redemptions });
  }

  /** GET /api/v1/catalogue/:id — item detail */
  @Get(':id')
  async getItem(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? '';
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenantId is required' });
      return;
    }
    const item = await this.catalogueService.getCatalogueItem(id, tenantId);
    res.status(HttpStatus.OK).json(item);
  }

  /** POST /api/v1/catalogue/redeem — redeem item (auth required) */
  @Post('redeem')
  async redeem(
    @Body() body: { itemId: string; idempotencyKey: string },
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? '';
    const memberId = req.userId ?? '';

    if (!memberId || !tenantId) {
      res.status(HttpStatus.UNAUTHORIZED).json({ error: 'auth required' });
      return;
    }
    if (!body.itemId?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'itemId is required' });
      return;
    }
    if (!body.idempotencyKey?.trim()) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'idempotencyKey is required' });
      return;
    }

    const result = await this.catalogueService.redeemItem(
      memberId,
      body.itemId,
      tenantId,
      body.idempotencyKey,
    );
    res.status(HttpStatus.CREATED).json(result);
  }
}

@Controller('admin/catalogue')
export class AdminCatalogueController {
  constructor(private readonly catalogueService: BurnCatalogueService) {}

  /** POST /api/v1/admin/catalogue — create item (admin auth) */
  @Post()
  async create(
    @Body() body: CreateCatalogueItemInput,
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? body.tenant_id ?? '';
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenant_id is required' });
      return;
    }

    const item = await this.catalogueService.createCatalogueItem({ ...body, tenant_id: tenantId });
    res.status(HttpStatus.CREATED).json(item);
  }

  /** PUT /api/v1/admin/catalogue/:id — update item (admin auth) */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCatalogueItemInput & { tenant_id?: string },
    @Req() req: AuthedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const tenantId = req.tenantId ?? body.tenant_id ?? '';
    if (!tenantId) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: 'tenant_id is required' });
      return;
    }

    const item = await this.catalogueService.updateCatalogueItem(id, tenantId, body);
    res.status(HttpStatus.OK).json(item);
  }
}
