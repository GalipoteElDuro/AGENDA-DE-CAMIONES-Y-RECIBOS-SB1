/**
 * SAP Business One Service Layer Client
 * 
 * Handles authentication and session management for SAP B1 Service Layer API.
 * Follows best practices from SAP B1 Service Layer documentation.
 */

interface LoginCredentials {
  serviceLayerUrl: string;
  companyDB: string;
  userName: string;
  password: string;
}

interface LoginResponse {
  SessionId: string;
  Version: string;
  SessionTimeout: number;
}

export class ServiceLayerClient {
  private baseUrl: string;
  private sessionId: string | null = null;
  private sessionTimeout: NodeJS.Timeout | null = null;
  private companyDB: string;

  constructor(baseUrl: string, companyDB: string) {
    // Ensure URL doesn't have trailing slash
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.companyDB = companyDB;
  }

  /**
   * Authenticate with SAP B1 Service Layer
   */
  async login(credentials: Omit<LoginCredentials, 'serviceLayerUrl'>): Promise<LoginResponse> {
    const response = await fetch(`${this.baseUrl}/Login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        CompanyDB: credentials.companyDB,
        UserName: credentials.userName,
        Password: credentials.password,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error?.message?.value || `Login failed: ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    const data: LoginResponse = await response.json();
    this.sessionId = data.SessionId;

    // Schedule session refresh before timeout
    this.scheduleSessionRefresh(data.SessionTimeout);

    return data;
  }

  /**
   * Make an authenticated request to any Service Layer endpoint
   */
  async request(method: string, endpoint: string, body?: any): Promise<Response> {
    if (!this.sessionId) {
      throw new Error('No active session. Please login first.');
    }

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `B1SESSION=${this.sessionId}`,
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}/${endpoint}`, options);

    // Handle session expiration
    if (response.status === 401) {
      this.sessionId = null;
      throw new Error('Session expired. Please login again.');
    }

    return response;
  }

  /**
   * Logout from SAP B1 Service Layer
   */
  async logout(): Promise<void> {
    if (!this.sessionId) return;

    // Clear session refresh timeout
    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
      this.sessionTimeout = null;
    }

    try {
      await fetch(`${this.baseUrl}/Logout`, {
        method: 'POST',
        headers: {
          'Cookie': `B1SESSION=${this.sessionId}`,
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.sessionId = null;
    }
  }

  /**
   * Keep session alive by pinging the server
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.request('GET', '$ping');
      return response.ok;
    } catch (error) {
      console.error('Ping error:', error);
      return false;
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Check if there's an active session
   */
  hasActiveSession(): boolean {
    return this.sessionId !== null;
  }

  /**
   * Schedule automatic session refresh before timeout
   */
  private scheduleSessionRefresh(timeoutMinutes: number): void {
    // Refresh 2 minutes before timeout (or half the timeout if less than 4 minutes)
    const refreshTimeMs = Math.max(
      (timeoutMinutes - 2) * 60 * 1000,
      (timeoutMinutes / 2) * 60 * 1000
    );

    if (this.sessionTimeout) {
      clearTimeout(this.sessionTimeout);
    }

    this.sessionTimeout = setTimeout(async () => {
      try {
        await this.ping();
        console.log('Session refreshed successfully');
      } catch (error) {
        console.error('Failed to refresh session:', error);
      }
    }, refreshTimeMs);
  }
}

// Session storage for multiple users (in-memory)
interface SapSession {
  client: ServiceLayerClient;
  credentials: {
    companyDB: string;
    userName: string;
  };
  loginTime: Date;
}

const activeSessions = new Map<string, SapSession>();

/**
 * Create a new SAP session for a user
 */
export async function createSapSession(
  userId: string,
  credentials: LoginCredentials
): Promise<{ sessionId: string; sessionTimeout: number; version: string }> {
  const client = new ServiceLayerClient(
    credentials.serviceLayerUrl,
    credentials.companyDB
  );

  const loginResponse = await client.login({
    companyDB: credentials.companyDB,
    userName: credentials.userName,
    password: credentials.password,
  });

  // Store session
  activeSessions.set(userId, {
    client,
    credentials: {
      companyDB: credentials.companyDB,
      userName: credentials.userName,
    },
    loginTime: new Date(),
  });

  return {
    sessionId: loginResponse.SessionId,
    sessionTimeout: loginResponse.SessionTimeout,
    version: loginResponse.Version,
  };
}

/**
 * Get an active session for a user
 */
export function getSapSession(userId: string): SapSession | null {
  return activeSessions.get(userId) || null;
}

/**
 * Remove a session for a user
 */
export async function removeSapSession(userId: string): Promise<void> {
  const session = activeSessions.get(userId);
  if (session) {
    await session.client.logout();
    activeSessions.delete(userId);
  }
}

/**
 * Make an authenticated request on behalf of a user
 */
export async function makeAuthenticatedRequest(
  userId: string,
  method: string,
  endpoint: string,
  body?: any
): Promise<Response> {
  const session = getSapSession(userId);
  if (!session) {
    throw new Error('No active SAP session for this user');
  }

  return session.client.request(method, endpoint, body);
}
