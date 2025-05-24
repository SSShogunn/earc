import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module'; 
import { PrismaService } from './prisma/prisma.service';
import { ScheduleModule } from '@nestjs/schedule';
import { GmailService } from './gmail/gmail.service';
import { GoogleAuthService } from './auth/google-auth.service';
import { WebhookController } from './gmail/webhook.controller';
import { DriveModule } from './drive/drive.module';
import { GmailController } from './gmail/gmail.controller';

@Module({
  imports: [ScheduleModule.forRoot(), AuthModule, DriveModule],
  controllers: [AppController, WebhookController, GmailController],
  providers: [AppService, PrismaService, GmailService, GoogleAuthService],
})
export class AppModule {}
