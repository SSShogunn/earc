import { Controller, Post, Body, Logger, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { GmailService } from './gmail.service';

interface PubSubMessage {
  message: {
    data?: string;
    messageId: string;
    publishTime: string;
    attributes?: Record<string, string>;
  };
  subscription: string;
}

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly gmailService: GmailService) {}

  @Post('gmail')
  async handleGmailNotification(
    @Body() body: PubSubMessage,
    @Res() res: Response
  ): Promise<void> {
    try {
      this.logger.log('Received Gmail webhook notification');
      
      if (!body.message) {
        this.logger.warn('Invalid webhook payload: missing message');
        res.status(HttpStatus.BAD_REQUEST).send('Invalid payload');
        return;
      }

      await this.gmailService.handlePushNotification(body.message);
      
      res.status(HttpStatus.OK).send('OK');
      
    } catch (error) {
      this.logger.error('Error handling Gmail webhook:', error);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).send('Error processing webhook');
    }
  }

  @Post('gmail/verify')
  verifyWebhook(@Body() body: any, @Res() res: Response): void {
    this.logger.log('Webhook verification request');
    res.status(HttpStatus.OK).send('Webhook verified');
  }
} 