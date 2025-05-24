import { Injectable, Logger } from '@nestjs/common';
import { google, drive_v3, Auth } from 'googleapis';
import { Readable } from 'stream';

export interface DriveUploadResult {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  webViewLink: string;
  webContentLink: string;
}

export interface AttachmentData {
  fileName: string;
  mimeType: string;
  data: Buffer;
  size: number;
}

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);

  constructor() {}

  async uploadFile(
    auth: Auth.OAuth2Client,
    attachmentData: AttachmentData,
    folderId?: string
  ): Promise<DriveUploadResult> {
    try {
      const drive = google.drive({ version: 'v3', auth });

      const stream = new Readable();
      stream.push(attachmentData.data);
      stream.push(null);

      const fileMetadata: drive_v3.Schema$File = {
        name: attachmentData.fileName,
        parents: folderId ? [folderId] : undefined,
      };

      this.logger.log(`Uploading file: ${attachmentData.fileName} (${this.formatFileSize(attachmentData.size)})`);

      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: {
          mimeType: attachmentData.mimeType,
          body: stream,
        },
        fields: 'id,name,mimeType,size,webViewLink,webContentLink',
      });

      const file = response.data;
      
      if (!file.id) {
        throw new Error('Upload failed: No file ID returned');
      }

      await drive.permissions.create({
        fileId: file.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      });

      const result: DriveUploadResult = {
        fileId: file.id,
        fileName: file.name || attachmentData.fileName,
        mimeType: file.mimeType || attachmentData.mimeType,
        size: parseInt(file.size || '0'),
        webViewLink: file.webViewLink || '',
        webContentLink: file.webContentLink || '',
      };

      this.logger.log(`File uploaded successfully: ${result.fileName} (ID: ${result.fileId})`);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to upload file ${attachmentData.fileName}: ${errorMessage}`);
      throw new Error(`Drive upload failed: ${errorMessage}`);
    }
  }

  async getOrCreateAttachmentsFolder(auth: Auth.OAuth2Client): Promise<string> {
    try {
      const drive = google.drive({ version: 'v3', auth });
      const folderName = 'Email Attachments';

      const searchResponse = await drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id,name)',
      });

      const folders = searchResponse.data.files || [];
      
      if (folders.length > 0 && folders[0].id) {
        this.logger.log(`Using existing attachments folder: ${folders[0].id}`);
        return folders[0].id;
      }

      const createResponse = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });

      const folderId = createResponse.data.id;
      if (!folderId) {
        throw new Error('Failed to create folder: No folder ID returned');
      }

      this.logger.log(`Created new attachments folder: ${folderId}`);
      return folderId;

    } catch (error) {
      this.logger.error('Failed to create/get attachments folder:', error);
      throw error;
    }
  }

  async uploadAttachments(
    auth: Auth.OAuth2Client,
    attachments: AttachmentData[],
    emailSubject?: string
  ): Promise<DriveUploadResult[]> {
    if (attachments.length === 0) {
      return [];
    }

    try {
      const mainFolderId = await this.getOrCreateAttachmentsFolder(auth);
      
      let targetFolderId = mainFolderId;
      if (attachments.length > 1 && emailSubject) {
        targetFolderId = await this.createEmailFolder(auth, mainFolderId, emailSubject);
      }

      const results: DriveUploadResult[] = [];

      for (const attachment of attachments) {
        try {
          const result = await this.uploadFile(auth, attachment, targetFolderId);
          results.push(result);
        } catch (error) {
          this.logger.error(`Failed to upload attachment ${attachment.fileName}:`, error);
        }
      }

      this.logger.log(`Uploaded ${results.length}/${attachments.length} attachments successfully`);
      return results;

    } catch (error) {
      this.logger.error('Failed to upload attachments batch:', error);
      return [];
    }
  }

  private async createEmailFolder(
    auth: Auth.OAuth2Client,
    parentFolderId: string,
    emailSubject: string
  ): Promise<string> {
    try {
      const drive = google.drive({ version: 'v3', auth });
      
      const folderName = this.sanitizeFolderName(emailSubject);
      
      const response = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentFolderId],
        },
        fields: 'id',
      });

      return response.data.id || parentFolderId;
    } catch (error) {
      this.logger.warn('Failed to create email subfolder, using parent:', error);
      return parentFolderId;
    }
  }

  private sanitizeFolderName(subject: string): string {
    return subject
      .replace(/[<>:"/\\|?*]/g, '')
      .substring(0, 100)
      .trim();
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async getFileInfo(auth: Auth.OAuth2Client, fileId: string): Promise<drive_v3.Schema$File | null> {
    try {
      const drive = google.drive({ version: 'v3', auth });
      const response = await drive.files.get({
        fileId,
        fields: 'id,name,mimeType,size,webViewLink,webContentLink,createdTime',
      });
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get file info for ${fileId}:`, error);
      return null;
    }
  }
} 