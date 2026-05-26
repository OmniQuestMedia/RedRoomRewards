import { Controller, Post, Body, Req } from '@nestjs/common';
import { CreatorGiftingService } from '../services/creator-gifting.service';
import { CreatorGiftingPromotion } from '../interfaces/redroom-rewards';
import { Request } from 'express';

@Controller('creator-gifting')
export class CreatorGiftingController {
  constructor(private readonly creatorGiftingService: CreatorGiftingService) {}

  @Post('create')
  async create(@Body() promotion: CreatorGiftingPromotion, @Req() req: Request) {
    const creatorId = (req as unknown as { user: { creatorId: string } }).user.creatorId;
    return this.creatorGiftingService.createPromotion(creatorId, promotion);
  }
}
