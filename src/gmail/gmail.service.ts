import { Injectable, Logger } from "@nestjs/common";
import { google, gmail_v1 } from "googleapis";
import { PrismaService } from "../prisma/prisma.service";
import { Cron } from "@nestjs/schedule";
import { CreateEmailDto } from "../email/dto/create-email.dto";
import { Token } from "generated/prisma";
import { GoogleAuthService } from "../auth/google-auth.service";
import { DriveService, AttachmentData, DriveUploadResult } from "../drive/drive.service";

interface EmailHeader {
  name: string;
  value: string;
}

@Injectable()
export class GmailService {
  private logger = new Logger(GmailService.name);

  constructor(
    private prisma: PrismaService,
    private googleAuthService: GoogleAuthService,
    private driveService: DriveService
  ) {}

  @Cron("*/30 * * * * *") 
  async handleCron() {
    this.logger.log('Running scheduled Gmail fetch for all users...');

    await this.googleAuthService.refreshAllExpiredTokens();
    
    const tokens = await this.prisma.token.findMany();
  
    for (const token of tokens) {
      await this.fetchEmails(token);
    }
  }

  async fetchEmails(token: Token, isInitialSync: boolean = false): Promise<void> {
    if (!token) {
      this.logger.warn("No OAuth token found. Please authenticate first.");
      return;
    }

    try {

      const oAuth2Client = await this.googleAuthService.getAuthenticatedClient(token);
      const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

      const historyId = token.historyId;

      let messageIds: string[] = [];

      if (historyId && !isInitialSync) {
        try {
          const historyRes = await gmail.users.history.list({
            userId: "me",
            startHistoryId: historyId,
            historyTypes: ["messageAdded"],
          });

          const history = historyRes.data.history || [];
          messageIds = history
            .flatMap((h) => h.messages || [])
            .map((m) => m.id)
            .filter((id): id is string => id !== undefined);

          this.logger.log(
            `Found ${messageIds.length} new messages via history API`
          );

          if (historyRes.data.historyId) {
            await this.prisma.token.update({
              where: { id: token.id },
              data: { historyId: historyRes.data.historyId },
            });
          }
        } catch (historyError) {
          this.logger.warn(
            `History API failed: ${historyError instanceof Error ? historyError.message : "Unknown error"}, falling back to full message list`
          );
          const maxMessages = isInitialSync ? 1000 : 100;
          messageIds = await this.getRecentMessages(gmail, maxMessages);
        }
      } else {
        this.logger.log("No history ID found, performing initial sync");
        const maxMessages = isInitialSync ? 2000 : 100;
        messageIds = await this.getRecentMessages(gmail, maxMessages);

        if (isInitialSync) {
          await this.setupGmailWatch(gmail, token);
        }
      }

      for (const id of messageIds) {
        const userId = token.userId ? String(token.userId) : undefined;
        await this.processMessage(gmail, id, userId);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(`Failed to fetch emails for token ${token.id}: ${errorMessage}`);

      if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid_grant')) {
        this.logger.error(`Authentication failed for token ${token.id}. User may need to re-authenticate.`);
      }
    }
  }

  private async getRecentMessages(gmail: gmail_v1.Gmail, maxMessages: number = 100): Promise<string[]> {
    try {
      const allMessageIds: string[] = [];
      let nextPageToken: string | null | undefined;
      let totalFetched = 0;
      const batchSize = 50; 

      this.logger.log(`Starting to fetch recent messages (max: ${maxMessages})`);

      do {
        const response = await gmail.users.messages.list({
          userId: "me",
          maxResults: Math.min(batchSize, maxMessages - totalFetched),
          pageToken: nextPageToken || undefined,
        });

        const messages = response.data.messages || [];
        const messageIds = messages
          .map((m) => m.id)
          .filter((id): id is string => id !== undefined);

        allMessageIds.push(...messageIds);
        totalFetched += messageIds.length;
        nextPageToken = response.data.nextPageToken;

        this.logger.log(`Fetched ${messageIds.length} messages (total: ${totalFetched})`);

        if (totalFetched >= maxMessages || !nextPageToken || messageIds.length === 0) {
          break;
        }

      } while (nextPageToken && totalFetched < maxMessages);

      this.logger.log(`Completed message fetch: ${allMessageIds.length} total messages`);
      return allMessageIds;

    } catch (error) {
      this.logger.error("Failed to fetch recent messages:", error);
      return [];
    }
  }

  async processMessage(gmail: gmail_v1.Gmail, id: string, userId?: string): Promise<void> {
    try {
      const existingEmail = await this.prisma.email.findUnique({
        where: { messageId: id },
      });

      if (existingEmail) {
        this.logger.debug(`Email ${id} already exists, skipping...`);
        return;
      }

      const res = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });

      const msg = res.data;
      if (!msg || !msg.payload) {
        this.logger.warn(`No payload found for message ${id}`);
        return;
      }

      const payload = msg.payload;
      const headers = (payload.headers || []) as EmailHeader[];

      const getHeader = (name: string): string => {
        const header = headers.find(
          (h) => h.name.toLowerCase() === name.toLowerCase()
        );
        return header?.value || "";
      };

      const emailDto: CreateEmailDto = {
        messageId: msg.id || '',
        threadId: msg.threadId || '',
        subject: getHeader('Subject'),
        sender: getHeader('From'),
        recipients: getHeader('To') || '',
        cc: getHeader('Cc') || '',
        bcc: getHeader('Bcc') || '',
        date: new Date(Number(msg.internalDate) || Date.now()),
        bodyText: '',
        bodyHtml: '',
      };
      

      const parts = this.extractParts(payload);
      for (const part of parts) {
        const mimeType = part.mimeType;

        this.logger.debug(`Processing MIME type: ${mimeType}`);

        const bodyData = part.body?.data;

        if (bodyData && typeof bodyData === "string") {
          const decoded = Buffer.from(bodyData, "base64").toString("utf8");
          if (mimeType === "text/plain") {
            emailDto.bodyText = decoded;
          }
          if (mimeType === "text/html") {
            emailDto.bodyHtml = decoded;
          }
        }
      }

      await this.prisma.email.create({
        data: {
          ...emailDto,
          userId: userId,
        },
      });

      await this.processAttachments(gmail, msg, emailDto.messageId, userId);

      this.logger.log(
        `Stored message: "${emailDto.subject}" from ${emailDto.sender}`
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("Unique constraint")) {
        this.logger.debug(`Duplicate email ${id}, skipping...`);
      } else {
        this.logger.warn(`Failed to process email ${id}: ${errorMessage}`);
      }
    }
  }

  private extractParts(
    part: gmail_v1.Schema$MessagePart
  ): gmail_v1.Schema$MessagePart[] {
    let allParts: gmail_v1.Schema$MessagePart[] = [];

    if (part.parts) {
      for (const subPart of part.parts) {
        allParts = allParts.concat(this.extractParts(subPart));
      }
    } else {
      allParts.push(part);
    }

    return allParts;
  }

  async processAttachments(
    gmail: gmail_v1.Gmail,
    message: gmail_v1.Schema$Message,
    messageId: string,
    userId?: string
  ): Promise<void> {
    try {
      if (!message.payload) {
        return;
      }

      const attachments = await this.extractAttachments(gmail, message);
      
      if (attachments.length === 0) {
        this.logger.debug(`No attachments found for message ${messageId}`);
        return;
      }

      this.logger.log(`Found ${attachments.length} attachment(s) for message ${messageId}`);

      const tokens = await this.prisma.token.findMany();
      const userToken = userId ? tokens.find(t => t.userId === userId) : tokens[0];
      
      if (!userToken) {
        this.logger.warn('No valid token found for Drive upload');
        return;
      }

      const oAuth2Client = await this.googleAuthService.getAuthenticatedClient(userToken);
      
      const headers = (message.payload.headers || []) as EmailHeader[];
      const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || 'No Subject';

      const uploadResults = await this.driveService.uploadAttachments(
        oAuth2Client,
        attachments,
        subject
      );

      for (const result of uploadResults) {
        await this.storeAttachmentMetadata(messageId, result);
      }

      this.logger.log(`Processed ${uploadResults.length} attachments for message ${messageId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to process attachments for message ${messageId}: ${errorMessage}`);
    }
  }

  async extractAttachments(
    gmail: gmail_v1.Gmail,
    message: gmail_v1.Schema$Message
  ): Promise<AttachmentData[]> {
    const attachments: AttachmentData[] = [];

    if (!message.payload) {
      return attachments;
    }

    const parts = this.extractParts(message.payload);

    for (const part of parts) {
      if (this.isAttachment(part)) {
        try {
          const attachmentData = await this.downloadAttachment(gmail, message.id!, part);
          if (attachmentData) {
            attachments.push(attachmentData);
          }
        } catch (error) {
          this.logger.error(`Failed to download attachment ${part.filename}:`, error);
        }
      }
    }

    return attachments;
  }

  private isAttachment(part: gmail_v1.Schema$MessagePart): boolean {
    if (part.body?.attachmentId) {
      return true;
    }

    if (part.headers) {
      const disposition = part.headers.find(
        h => h.name?.toLowerCase() === 'content-disposition'
      );
      if (disposition?.value?.includes('attachment')) {
        return true;
      }
    }

    return !!(part.filename && part.body?.size && part.body.size > 0);
  }

  async downloadAttachment(
    gmail: gmail_v1.Gmail,
    messageId: string,
    part: gmail_v1.Schema$MessagePart
  ): Promise<AttachmentData | null> {
    try {
      if (!part.body?.attachmentId || !part.filename) {
        return null;
      }

      const attachmentResponse = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: part.body.attachmentId,
      });

      const data = attachmentResponse.data.data;
      if (!data) {
        throw new Error('No attachment data received');
      }

      const buffer = Buffer.from(data, 'base64');

      return {
        fileName: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        data: buffer,
        size: buffer.length,
      };

    } catch (error) {
      this.logger.error(`Failed to download attachment ${part.filename}:`, error);
      return null;
    }
  }

  async storeAttachmentMetadata(
    emailMessageId: string,
    uploadResult: DriveUploadResult
  ): Promise<void> {
    try {
      const email = await this.prisma.email.findUnique({
        where: { messageId: emailMessageId },
      });

      if (!email) {
        this.logger.warn(`Email not found for attachment storage: ${emailMessageId}`);
        return;
      }

      await this.prisma.attachment.create({
        data: {
          emailId: email.id,
          fileName: uploadResult.fileName,
          mimeType: uploadResult.mimeType,
          driveLink: uploadResult.webViewLink,
        },
      });

      this.logger.log(`Stored attachment metadata: ${uploadResult.fileName}`);

    } catch (error) {
      this.logger.error(`Failed to store attachment metadata:`, error);
    }
  }

  async setupGmailWatch(gmail: gmail_v1.Gmail, token: Token): Promise<void> {
    try {
      const watchRequest = {
        userId: 'me',
        requestBody: {
          topicName: process.env.GOOGLE_PUBSUB_TOPIC,
          labelIds: [],
          labelFilterAction: 'include' as const,
        },
      };

      const response = await gmail.users.watch(watchRequest);
      
      if (response.data.historyId) {
        await this.prisma.token.update({
          where: { id: token.id },
          data: { historyId: response.data.historyId },
        });
        
        this.logger.log(`Gmail watch setup successful for token ${token.id}, history ID: ${response.data.historyId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to setup Gmail watch for token ${token.id}:`, error);
    }
  }

  async handlePushNotification(message: { data?: string; [key: string]: any }): Promise<void> {
    try {
      this.logger.log('Received Gmail push notification');
      
      let parsedData: unknown = {};
      if (message.data && typeof message.data === 'string') {
        const data = Buffer.from(message.data, 'base64').toString();
        try {
          parsedData = JSON.parse(data);
        } catch (parseError) {
          this.logger.warn('Failed to parse push notification data:', parseError);
        }
      }
      
      this.logger.log('Push notification data:', parsedData);
      
      const tokens = await this.prisma.token.findMany();
      
      for (const token of tokens) {
        await this.fetchEmails(token, false);
      }
      
    } catch (error) {
      this.logger.error('Error processing push notification:', error);
    }
  }
}
