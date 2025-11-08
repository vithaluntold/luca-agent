import { encryptApiKey, decryptApiKey } from "../utils/encryption";

export interface QuickBooksConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: 'sandbox' | 'production';
}

export interface XeroConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface ZohoConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  dataCenterLocation: string;
}

export class AccountingIntegrationService {
  
  /**
   * QuickBooks OAuth - Get authorization URL
   */
  static getQuickBooksAuthUrl(config: QuickBooksConfig, state: string): string {
    const baseUrl = config.environment === 'production'
      ? 'https://appcenter.intuit.com/connect/oauth2'
      : 'https://appcenter.intuit.com/connect/oauth2';
    
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      state: state,
    });

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * QuickBooks - Exchange authorization code for tokens
   */
  static async exchangeQuickBooksCode(
    config: QuickBooksConfig,
    code: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const tokenUrl = config.environment === 'production'
      ? 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
      : 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange QuickBooks authorization code');
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Xero OAuth - Get authorization URL
   */
  static getXeroAuthUrl(config: XeroConfig, state: string): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'offline_access accounting.transactions accounting.contacts accounting.settings',
      state: state,
    });

    return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
  }

  /**
   * Xero - Exchange authorization code for tokens
   */
  static async exchangeXeroCode(
    config: XeroConfig,
    code: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

    const response = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange Xero authorization code');
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Zoho OAuth - Get authorization URL
   */
  static getZohoAuthUrl(config: ZohoConfig, state: string): string {
    const baseUrl = `https://accounts.zoho.${config.dataCenterLocation}`;
    
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'ZohoBooks.fullaccess.all',
      state: state,
      access_type: 'offline',
    });

    return `${baseUrl}/oauth/v2/auth?${params.toString()}`;
  }

  /**
   * Zoho - Exchange authorization code for tokens
   */
  static async exchangeZohoCode(
    config: ZohoConfig,
    code: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const tokenUrl = `https://accounts.zoho.${config.dataCenterLocation}/oauth/v2/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code: code,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to exchange Zoho authorization code');
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Refresh QuickBooks access token
   */
  static async refreshQuickBooksToken(
    config: QuickBooksConfig,
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh QuickBooks token');
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Fetch company information from QuickBooks
   */
  static async getQuickBooksCompanyInfo(
    accessToken: string,
    realmId: string,
    environment: 'sandbox' | 'production'
  ): Promise<{ name: string; id: string }> {
    const baseUrl = environment === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';

    const response = await fetch(`${baseUrl}/v3/company/${realmId}/companyinfo/${realmId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch QuickBooks company info');
    }

    const data = await response.json();
    return {
      name: data.CompanyInfo?.CompanyName || 'Unknown',
      id: realmId,
    };
  }

  /**
   * Encrypt tokens before storing
   */
  static encryptTokens(accessToken: string, refreshToken?: string): {
    encryptedAccessToken: string;
    encryptedRefreshToken?: string;
  } {
    return {
      encryptedAccessToken: encryptApiKey(accessToken),
      encryptedRefreshToken: refreshToken ? encryptApiKey(refreshToken) : undefined,
    };
  }

  /**
   * Decrypt tokens for use
   */
  static decryptTokens(encryptedAccessToken: string, encryptedRefreshToken?: string): {
    accessToken: string;
    refreshToken?: string;
  } {
    return {
      accessToken: decryptApiKey(encryptedAccessToken),
      refreshToken: encryptedRefreshToken ? decryptApiKey(encryptedRefreshToken) : undefined,
    };
  }
}
