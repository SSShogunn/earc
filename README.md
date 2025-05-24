# 📧 Email Archiving with OAuth Integration

A comprehensive NestJS application that automatically archives Gmail emails to PostgreSQL database with Google Drive attachment storage using OAuth 2.0 authentication.

## 🎯 Project Overview

This system provides automated email archiving for G-Suite inboxes, capturing all incoming emails with their complete metadata, body content, and attachments. The solution ensures compliance-ready email storage without disrupting existing email workflows.

### 🏆 Assessment Task
**Email Archiving with OAuth Integration** - Automatically store incoming emails from G-Suite inbox to database with OAuth integration, complete metadata capture, and attachment handling via Google Drive.

## 🏗️ System Architecture

The following diagram illustrates the complete email archiving workflow and system architecture:

![Email Archiving Flow Diagram](flow-diagram.png)

*This comprehensive flow diagram shows the entire email archiving process from user authentication through OAuth, email fetching from Gmail API, attachment processing with Google Drive, database storage, and API endpoints for accessing archived data.*

## ✨ Features

- 🔐 **OAuth 2.0 Authentication** - Secure Gmail API access without password storage
- 📧 **Automatic Email Archiving** - Real-time email capture within 5 minutes of receipt
- 📎 **Attachment Management** - Google Drive storage with database linking
- 🔄 **Incremental Sync** - Efficient updates using Gmail History API
- 📨 **Push Notifications** - Real-time processing via Gmail webhooks
- 🚫 **Duplicate Prevention** - Smart detection and handling of duplicate emails
- 🧵 **Thread Preservation** - Maintains email conversation threading
- 📊 **RESTful API** - Complete API for accessing archived emails
- ⚡ **High Performance** - Optimized database queries with pagination
- 🛡️ **Error Handling** - Robust error management and recovery

## 🛠️ Tech Stack

- **Backend**: NestJS (Node.js/TypeScript)
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Google OAuth 2.0
- **APIs**: Gmail API, Google Drive API
- **Scheduling**: Node-cron for automated tasks
- **Cloud Storage**: Google Drive
- **Email Processing**: Gmail API with History tracking

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18+ recommended)
- **npm** or **yarn**
- **PostgreSQL** (v13+ recommended)
- **Google Cloud Platform** account
- **Git**

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/email-archiving-oauth.git
cd email-archiving-oauth
```

### 2. Install Dependencies

```bash
npm install
# or
yarn install
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/email_archiving"

# Google OAuth Credentials
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/google/redirect"

# Google Pub/Sub (Optional - for push notifications)
GOOGLE_PUBSUB_TOPIC="projects/your-project/topics/gmail-notifications"

# Application Configuration
PORT=3000
NODE_ENV=development
```

### 4. Google Cloud Console Setup

#### 4.1 Create a New Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the following APIs:
   - Gmail API
   - Google Drive API
   - Google+ API (for user info)

#### 4.2 Configure OAuth 2.0
1. Navigate to **Credentials** → **Create Credentials** → **OAuth 2.0 Client IDs**
2. Configure the consent screen
3. Add authorized redirect URIs:
   ```
   http://localhost:3000/auth/google/redirect
   ```
4. Copy the Client ID and Client Secret to your `.env` file

#### 4.3 Enable Required Scopes
Ensure your OAuth configuration includes these scopes:
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/drive.file`
- `https://www.googleapis.com/auth/userinfo.email`

### 5. Database Setup

#### 5.1 Create Database
```bash
createdb email_archiving
```

#### 5.2 Generate Prisma Client
```bash
npx prisma generate
```

#### 5.3 Run Database Migrations
```bash
npx prisma db push
```

#### 5.4 (Optional) View Database
```bash
npx prisma studio
```

## 🏃‍♂️ Running the Application

### Development Mode
```bash
npm run start:dev
# or
yarn start:dev
```

### Production Mode
```bash
npm run build
npm run start:prod
```

The application will be available at `http://localhost:3000`

## 🔧 Usage Guide

### 1. Authentication Setup
1. Navigate to `http://localhost:3000/auth/google`
2. Complete the Google OAuth flow
3. Tokens will be automatically stored in the database

### 2. Initial Email Sync
```bash
curl -X POST http://localhost:3000/auth/initial-sync
```

### 3. Automatic Processing
- **Scheduled Sync**: Runs every 30 seconds automatically
- **Push Notifications**: Real-time processing when configured
- **Manual Refresh**: Use the refresh tokens endpoint

## 📡 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/google` | Initiate OAuth flow |
| GET | `/auth/google/redirect` | OAuth callback |
| POST | `/auth/refresh-tokens` | Manually refresh tokens |
| POST | `/auth/initial-sync` | Trigger initial email sync |

### Email Endpoints

| Method | Endpoint | Description | Parameters |
|--------|----------|-------------|-----------|
| GET | `/gmail/emails` | Get paginated emails | `page`, `limit` |
| GET | `/gmail/emails/:messageId` | Get specific email | - |
| GET | `/gmail/attachments` | Get paginated attachments | `page`, `limit` |
| GET | `/gmail/stats` | Get system statistics | - |

### Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhook/gmail` | Gmail push notifications |
| POST | `/webhook/gmail/verify` | Webhook verification |

### Example API Responses

#### Get Emails
```json
{
  "emails": [
    {
      "id": 1,
      "messageId": "msg_123456",
      "subject": "Important Meeting",
      "sender": "sender@example.com",
      "recipients": "recipient@example.com",
      "date": "2024-01-15T10:30:00Z",
      "attachments": [
        {
          "fileName": "document.pdf",
          "driveLink": "https://drive.google.com/file/d/abc123"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 150,
    "pages": 15
  }
}
```

## 📁 Project Structure

```
src/
├── auth/                   # Authentication module
│   ├── auth.controller.ts  # OAuth endpoints
│   ├── auth.module.ts      # Auth module configuration
│   └── google-auth.service.ts # OAuth token management
├── gmail/                  # Gmail processing module
│   ├── gmail.controller.ts # Email API endpoints
│   ├── gmail.service.ts    # Core email processing
│   ├── webhook.controller.ts # Push notification handling
│   └── gmail.service.spec.ts # Unit tests
├── drive/                  # Google Drive integration
│   ├── drive.service.ts    # Attachment upload service
│   └── drive.module.ts     # Drive module configuration
├── email/                  # Email data models
│   └── dto/
│       └── create-email.dto.ts # Email data transfer object
├── prisma/                 # Database integration
│   ├── prisma.service.ts   # Database connection
│   └── prisma.module.ts    # Prisma module configuration
├── app.module.ts          # Main application module
└── main.ts                # Application entry point
```

## 🗄️ Database Schema

```sql
-- OAuth Tokens
CREATE TABLE Token (
    id SERIAL PRIMARY KEY,
    accessToken TEXT NOT NULL,
    refreshToken TEXT NOT NULL,
    expiryDate BIGINT NOT NULL,
    userId TEXT,
    historyId BIGINT,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);

-- Emails
CREATE TABLE Email (
    id SERIAL PRIMARY KEY,
    messageId TEXT UNIQUE NOT NULL,
    threadId TEXT,
    subject TEXT,
    bodyText TEXT,
    bodyHtml TEXT,
    sender TEXT,
    recipients TEXT,
    cc TEXT,
    bcc TEXT,
    date TIMESTAMP,
    userId TEXT,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);

-- Attachments
CREATE TABLE Attachment (
    id SERIAL PRIMARY KEY,
    emailId INTEGER REFERENCES Email(id),
    fileName TEXT,
    mimeType TEXT,
    driveLink TEXT,
    createdAt TIMESTAMP DEFAULT NOW(),
    updatedAt TIMESTAMP DEFAULT NOW()
);
```

## 🔍 Monitoring & Logging

The application provides comprehensive logging for:
- OAuth token refresh cycles
- Email processing status
- Attachment upload progress
- Error handling and recovery
- Performance metrics

Log levels:
- `INFO`: Normal operations
- `WARN`: Non-critical issues
- `ERROR`: Critical failures
- `DEBUG`: Detailed debugging info

## 📊 Performance Considerations

- **Database Indexing**: Proper indexes on `messageId`, `date`, `sender`
- **Batch Processing**: Processes emails in batches for efficiency
- **Pagination**: All list endpoints support pagination
- **Connection Pooling**: Prisma handles database connection optimization
- **Rate Limiting**: Built-in Gmail API rate limit handling

## 🔒 Security Features

- **No Password Storage**: Uses OAuth tokens only
- **Token Encryption**: Secure token storage in database
- **Automatic Token Refresh**: Prevents expired token issues
- **Input Validation**: Comprehensive input sanitization
- **Error Logging**: Secure error logging without sensitive data

