import { Injectable, Logger } from '@nestjs/common';
import { google, Auth } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { Token } from '../../generated/prisma';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private oauth2Client: Auth.OAuth2Client;

  constructor(private prisma: PrismaService) {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }
  
  async storeTokens(tokens: Auth.Credentials): Promise<void> {
    await this.prisma.token.create({
      data: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        expiryDate: BigInt(tokens.expiry_date!),
      },
    });
  }

  private isTokenExpired(token: Token): boolean {
    const expiryTime = Number(token.expiryDate);
    const currentTime = Date.now();
    const bufferTime = 5 * 60 * 1000;
    
    return expiryTime <= (currentTime + bufferTime);
  }

  async refreshToken(token: Token): Promise<Token> {
    try {
      this.logger.log(`Refreshing token for user: ${token.userId || 'unknown'}`);
      
      this.oauth2Client.setCredentials({
        refresh_token: token.refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      if (!credentials.access_token) {
        throw new Error('Failed to get new access token');
      }

      const updatedToken = await this.prisma.token.update({
        where: { id: token.id },
        data: {
          accessToken: credentials.access_token,
          expiryDate: BigInt(credentials.expiry_date || Date.now() + 3600000),
          ...(credentials.refresh_token && { refreshToken: credentials.refresh_token }),
        },
      });

      this.logger.log(`Token refreshed successfully for user: ${token.userId || 'unknown'}`);
      return updatedToken;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to refresh token: ${errorMessage}`);
      
      if (errorMessage.includes('invalid_grant') || errorMessage.includes('invalid_request')) {
        this.logger.warn(`Token appears to be permanently invalid, marking for re-authentication`);
      }
      
      throw new Error(`Token refresh failed: ${errorMessage}`);
    }
  }

  async getValidToken(token: Token): Promise<Token> {
    if (this.isTokenExpired(token)) {
      this.logger.log(`Token expired, refreshing...`);
      return await this.refreshToken(token);
    }
    
    return token;
  }

  async getAuthenticatedClient(token: Token): Promise<Auth.OAuth2Client> {
    const validToken = await this.getValidToken(token);
    
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    client.setCredentials({
      access_token: validToken.accessToken,
      refresh_token: validToken.refreshToken,
      expiry_date: Number(validToken.expiryDate),
    });

    return client;
  }

  async refreshAllExpiredTokens(): Promise<void> {
    try {
      const tokens = await this.prisma.token.findMany();
      const expiredTokens = tokens.filter(token => this.isTokenExpired(token));
      
      if (expiredTokens.length === 0) {
        this.logger.log('No expired tokens found');
        return;
      }

      this.logger.log(`Found ${expiredTokens.length} expired tokens, refreshing...`);
      
      for (const token of expiredTokens) {
        try {
          await this.refreshToken(token);
        } catch (error) {
          this.logger.error(`Failed to refresh token ${token.id}: ${error}`);
        }
      }
      
      this.logger.log('Completed token refresh cycle');
    } catch (error) {
      this.logger.error(`Error during bulk token refresh: ${error}`);
    }
  }

  getAuthUrl(): string {
    const SCOPES = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
    });
  }

  async getTokensFromCode(code: string): Promise<Auth.Credentials> {
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  setCredentials(tokens: Auth.Credentials): void {
    this.oauth2Client.setCredentials(tokens);
  }

  getClient(): Auth.OAuth2Client {
    return this.oauth2Client;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduledTokenRefresh(): Promise<void> {
    this.logger.log('Running scheduled token refresh check...');
    await this.refreshAllExpiredTokens();
  }
}
