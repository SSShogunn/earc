import { Controller, Get, Query, Res, Post } from '@nestjs/common';
import { Response } from 'express';
import { GoogleAuthService } from './google-auth.service';
import { GmailService } from '../gmail/gmail.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly googleAuthService: GoogleAuthService,
    private readonly gmailService: GmailService,
    private readonly prisma: PrismaService
  ) {}

  @Get('google')
  googleAuth(@Res() res: Response) {
    const url = this.googleAuthService.getAuthUrl();
    return res.redirect(url);
  }

  @Get('google/redirect')
  async googleAuthRedirect(@Query('code') code: string, @Res() res: Response) {
    try {
      const tokens = await this.googleAuthService.getTokensFromCode(code);
      
      await this.googleAuthService.storeTokens(tokens);
      console.log('Tokens stored successfully:', tokens);
      
      return res.send('Authentication successful! Tokens have been stored. You can close this window.');
    } catch (error) {
      console.error('Error during Google authentication redirect:', error);
      return res.status(500).send('An error occurred during authentication.');
    }
  }

  @Post('refresh-tokens')
  async refreshTokens(@Res() res: Response) {
    try {
      await this.googleAuthService.refreshAllExpiredTokens();
      return res.json({ 
        success: true, 
        message: 'Token refresh process completed. Check logs for details.' 
      });
    } catch (error) {
      console.error('Error during manual token refresh:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Token refresh failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  @Post('initial-sync')
  async triggerInitialSync(@Res() res: Response) {
    try {
      const tokens = await this.prisma.token.findMany();
      
      if (tokens.length === 0) {
        return res.json({ 
          success: false, 
          message: 'No tokens found. Please authenticate first.' 
        });
      }

      for (const token of tokens) {
        this.gmailService.fetchEmails(token, true).catch(error => {
          console.error(`Initial sync failed for token ${token.id}:`, error);
        });
      }

      return res.json({ 
        success: true, 
        message: `Initial sync started for ${tokens.length} token(s). This will fetch up to 2000 messages per account and set up push notifications.` 
      });
    } catch (error) {
      console.error('Error during initial sync trigger:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Initial sync trigger failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
