# OAuth Integration Setup Guide

This guide explains how to connect QuickBooks, Xero, and Zoho Books to Luca using OAuth 2.0.

## Prerequisites

✅ **ENCRYPTION_KEY** must be set in your Replit Secrets (already done!)

## How OAuth Integration Works

1. **Click "Connect"** on the Integrations page
2. **Redirect to Provider** - You'll be sent to QuickBooks/Xero/Zoho to authorize access
3. **Grant Permission** - Authorize Luca to access your accounting data
4. **Automatic Return** - You'll be redirected back with tokens encrypted and stored
5. **Ready to Use** - Your accounting data can now be accessed securely

## Option 1: Demo Mode (Works Immediately)

The app is **already configured with demo credentials** that will redirect you to the OAuth provider pages. However, since these are demo credentials, the actual OAuth flow may fail at the provider's end.

**To test the demo flow:**
1. Go to **Integrations** page
2. Click **Connect** on QuickBooks, Xero, or Zoho
3. You'll be redirected to the provider's authorization page

## Option 2: Production OAuth (Your Own Apps)

To use **real OAuth credentials**, you need to create OAuth apps with each provider.

### QuickBooks OAuth Setup

1. **Create an App**:
   - Go to [Intuit Developer Portal](https://developer.intuit.com/)
   - Sign in and create a new app
   - Select "QuickBooks Online API"

2. **Get Credentials**:
   - Find your **Client ID** and **Client Secret**
   - Set the **Redirect URI** to: `https://YOUR-REPLIT-DOMAIN.replit.app/api/integrations/callback`

3. **Add to Replit Secrets**:
   ```
   QUICKBOOKS_CLIENT_ID=your_client_id_here
   QUICKBOOKS_CLIENT_SECRET=your_client_secret_here
   QUICKBOOKS_ENV=sandbox  (or "production")
   ```

### Xero OAuth Setup

1. **Create an App**:
   - Go to [Xero Developer Portal](https://developer.xero.com/app/manage)
   - Create a new OAuth 2.0 app

2. **Get Credentials**:
   - Find your **Client ID** and **Client Secret**
   - Set the **Redirect URI** to: `https://YOUR-REPLIT-DOMAIN.replit.app/api/integrations/callback`

3. **Add to Replit Secrets**:
   ```
   XERO_CLIENT_ID=your_client_id_here
   XERO_CLIENT_SECRET=your_client_secret_here
   ```

### Zoho Books OAuth Setup

1. **Create an App**:
   - Go to [Zoho API Console](https://api-console.zoho.com/)
   - Create a new "Server-based Applications" client

2. **Get Credentials**:
   - Find your **Client ID** and **Client Secret**
   - Set the **Redirect URI** to: `https://YOUR-REPLIT-DOMAIN.replit.app/api/integrations/callback`

3. **Add to Replit Secrets**:
   ```
   ZOHO_CLIENT_ID=your_client_id_here
   ZOHO_CLIENT_SECRET=your_client_secret_here
   ZOHO_DATA_CENTER=com  (or "eu", "in", "au", etc.)
   ```

## Security Features

✅ **AES-256-GCM Encryption** - All OAuth tokens are encrypted before storage  
✅ **CSRF Protection** - State parameter validates OAuth callbacks  
✅ **Secure Storage** - Tokens never exposed in logs or API responses  
✅ **Audit Trail** - All integration actions are logged  

## Testing the Integration

1. **Go to Integrations page** (`/integrations`)
2. **Click "Connect"** on any provider
3. **Authorize access** on the provider's page
4. **Confirm success** - You should see "Integration Connected!" message
5. **View integration** - It will appear in the "Active Integrations" section

## Troubleshooting

**"Invalid state parameter"**
- Your session may have expired. Try connecting again.

**"OAuth callback error"**
- Check that your OAuth credentials are correct
- Verify the redirect URI matches exactly
- Check logs for specific error messages

**"Failed to initiate integration"**
- Ensure ENCRYPTION_KEY is set
- Check that the provider ID is correct (quickbooks, xero, zoho)

## What's Next?

Once connected, Luca can:
- Access your accounting data securely
- Provide intelligent analysis of your financials
- Answer questions about your specific company data
- Generate reports and insights

The tokens are automatically refreshed when they expire, ensuring continuous access to your data.
