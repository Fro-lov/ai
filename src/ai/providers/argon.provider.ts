import { AIProvider, AIChatInput, AIChatResponse, AIProviderRuntimeInfo } from '../types';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export interface ArgonTaskResponse {
  success: boolean;
  goal: string;
  report: string;
  iterations?: number;
  error?: string;
  files?: Array<{ path: string; filename?: string; caption?: string }>;
}

export class ArgonProvider implements AIProvider {
  readonly name = 'argon';
  private baseUrl: string;
  private secretToken: string;
  private modelName = 'Gemini 4 Argon (Web Session)';

  constructor(baseUrl = env.ARGON_ENGINE_URL, secretToken = env.ARGON_SECRET_TOKEN) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.secretToken = secretToken;
  }

  async chat(input: AIChatInput): Promise<AIChatResponse> {
    const url = `${this.baseUrl}/api/chat`;
    logger.info(`Sending chat request to Argon Engine: ${url}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.secretToken}`,
        },
        body: JSON.stringify({
          messages: input.messages,
          max_tokens: input.maxTokens,
          user_id: input.userId || 'default',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Argon Engine responded with status ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        content: string;
        model?: string;
        files?: Array<{ path: string; filename?: string; caption?: string }>;
        actions?: string[];
      };
      return {
        content: data.content || '',
        model: data.model || this.modelName,
        files: data.files || [],
        actions: data.actions || [],
      };
    } catch (error) {
      logger.error(`ArgonProvider request failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async runAutonomousTask(goal: string): Promise<ArgonTaskResponse> {
    const url = `${this.baseUrl}/api/agent/task`;
    logger.info(`Sending autonomous task to Argon Engine: ${goal}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.secretToken}`,
        },
        body: JSON.stringify({ goal }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Argon task execution failed (${response.status}): ${errorText}`);
      }

      return await response.json() as ArgonTaskResponse;
    } catch (error) {
      logger.error(`ArgonProvider runAutonomousTask error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async updateCookies(secure1psid: string, secure1psidts: string): Promise<{ success: boolean; message: string }> {
    const url = `${this.baseUrl}/api/cookies`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.secretToken}`,
      },
      body: JSON.stringify({
        secure_1psid: secure1psid,
        secure_1psidts: secure1psidts,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to update cookies: ${err}`);
    }

    return await response.json() as { success: boolean; message: string };
  }

  async getEngineStatus(): Promise<{
    sessionActive: boolean;
    busy: boolean;
    freeDiskGb: number;
    uptimeSeconds: number;
  }> {
    const url = `${this.baseUrl}/api/status`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.secretToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Status check failed with code ${response.status}`);
    }

    return await response.json() as {
      sessionActive: boolean;
      busy: boolean;
      freeDiskGb: number;
      uptimeSeconds: number;
    };
  }

  async resetSession(userId?: string): Promise<{ success: boolean }> {
    const url = `${this.baseUrl}/api/reset`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.secretToken}`,
      },
      body: JSON.stringify({ user_id: userId }),
    });

    return await response.json() as { success: boolean };
  }

  async getLimits(): Promise<{ quotas: Record<string, any> }> {
    const url = `${this.baseUrl}/api/limits`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.secretToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Limits check failed with code ${response.status}`);
    }

    return await response.json() as { quotas: Record<string, any> };
  }

  async downloadWorkspaceFile(relPath: string): Promise<Buffer> {
    const url = `${this.baseUrl}/api/workspace/file?path=${encodeURIComponent(relPath)}`;
    logger.info(`Downloading workspace file from Argon Engine: ${relPath}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.secretToken}`,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to download workspace file '${relPath}' (${response.status}): ${err}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async listWorkspaceFiles(): Promise<Array<{ path: string; filename: string; size: number; modified_at: number }>> {
    const url = `${this.baseUrl}/api/workspace/files`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.secretToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list workspace files with code ${response.status}`);
    }

    const data = await response.json() as { files: Array<{ path: string; filename: string; size: number; modified_at: number }> };
    return data.files || [];
  }

  getRuntimeInfo(): AIProviderRuntimeInfo {
    return {
      provider: this.name,
      model: this.modelName,
    };
  }
}
