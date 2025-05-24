export class CreateEmailDto {
    messageId: string;
    threadId: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    sender: string;
    recipients: string;
    cc: string;
    bcc: string;
    date: Date;
  }
  