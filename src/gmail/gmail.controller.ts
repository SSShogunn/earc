import { Controller, Get, Param, Query, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('gmail')
export class GmailController {
  private readonly logger = new Logger(GmailController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('emails')
  async getEmails(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10'
  ) {
    try {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      const emails = await this.prisma.email.findMany({
        skip,
        take: limitNum,
        orderBy: { date: 'desc' },
        include: {
          attachments: {
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              driveLink: true,
              createdAt: true,
            },
          },
        },
      });

      const total = await this.prisma.email.count();

      return {
        emails,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch emails:', error);
      throw error;
    }
  }

  @Get('emails/:messageId')
  async getEmail(@Param('messageId') messageId: string) {
    try {
      const email = await this.prisma.email.findUnique({
        where: { messageId },
        include: {
          attachments: true,
        },
      });

      if (!email) {
        throw new Error('Email not found');
      }

      return email;
    } catch (error) {
      this.logger.error(`Failed to fetch email ${messageId}:`, error);
      throw error;
    }
  }

  @Get('attachments')
  async getAttachments(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20'
  ) {
    try {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const skip = (pageNum - 1) * limitNum;

      const attachments = await this.prisma.attachment.findMany({
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          email: {
            select: {
              messageId: true,
              subject: true,
              sender: true,
              date: true,
            },
          },
        },
      });

      const total = await this.prisma.attachment.count();

      return {
        attachments,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      this.logger.error('Failed to fetch attachments:', error);
      throw error;
    }
  }

  @Get('stats')
  async getStats() {
    try {
      const [emailCount, attachmentCount] = await Promise.all([
        this.prisma.email.count(),
        this.prisma.attachment.count(),
      ]);

      // Get recent activity
      const recentEmails = await this.prisma.email.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          subject: true,
          sender: true,
          date: true,
          createdAt: true,
        },
      });

      return {
        stats: {
          totalEmails: emailCount,
          totalAttachments: attachmentCount,
        },
        recentActivity: recentEmails,
      };
    } catch (error) {
      this.logger.error('Failed to fetch stats:', error);
      throw error;
    }
  }
} 