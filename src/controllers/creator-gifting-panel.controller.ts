import { Controller, Get, Req } from '@nestjs/common';
import { CreatorGiftingPanelService } from '../services/creator-gifting-panel.service';
import { Request } from 'express';

@Controller('creator/gifting-panel')
export class CreatorGiftingPanelController {
  constructor(private readonly panelService: CreatorGiftingPanelService) {}

  @Get('state')
  async getState(@Req() req: Request) {
    const creatorId = (req as unknown as { user?: { creatorId: string } }).user?.creatorId;
    return this.panelService.getPanelState(creatorId);
  }
}
