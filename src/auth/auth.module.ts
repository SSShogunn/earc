import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { GoogleAuthService } from "./google-auth.service";
import { PrismaModule } from "../prisma/prisma.module";
import { GmailService } from "../gmail/gmail.service";
import { DriveModule } from "../drive/drive.module";

@Module({
  imports: [PrismaModule, DriveModule],
  controllers: [AuthController],
  providers: [GoogleAuthService, GmailService],
  exports: [GoogleAuthService],
})
export class AuthModule {}
