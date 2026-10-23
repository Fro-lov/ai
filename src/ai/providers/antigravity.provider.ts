import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { AIProvider, AIChatInput, AIChatResponse, AIProviderRuntimeInfo } from '../types';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

const execFileAsync = promisify(execFile);

export interface AntigravityTaskResponse {
  success: boolean;
  goal: string;
  report: string;
  error?: string;
  files?: Array<{ path: string; filename?: string; caption?: string }>;
}

export class AntigravityProvider implements AIProvider {
  readonly name = 'antigravity';
  private binPath: string;
  private workspace: string;
  private modelName = 'Google Antigravity CLI';

  constructor(
    binPath = env.ANTIGRAVITY_BIN_PATH,
    workspace = env.ANTIGRAVITY_WORKSPACE
  ) {
    this.binPath = binPath;
    this.workspace = path.resolve(workspace);

    if (!fs.existsSync(this.workspace)) {
      try {
        fs.mkdirSync(this.workspace, { recursive: true });
      } catch (err) {
        logger.warn(`Could not create workspace directory: ${this.workspace}`);
      }
    }
  }

  private buildPromptFromMessages(messages: AIChatInput['messages']): string {
    if (!messages || messages.length === 0) return '';
    if (messages.length === 1) return messages[0].content;

    const formatted = messages.map(m => {
      let roleLabel = 'Пользователь';
      if (m.role === 'assistant') roleLabel = 'Ассистент';
      else if (m.role === 'system') roleLabel = 'Инструкция';
      return `${roleLabel}${m.author ? ` (${m.author})` : ''}: ${m.content}`;
    }).join('\n\n');

    return `${formatted}\n\nАссистент:`;
  }

  async chat(input: AIChatInput): Promise<AIChatResponse> {
    const prompt = this.buildPromptFromMessages(input.messages);
    logger.info(`Sending chat prompt to Antigravity CLI (length: ${prompt.length})`);

    try {
      const args = [
        '-p',
        prompt,
        '--dangerously-skip-permissions',
        '--output-format',
        'text',
      ];

      if (input.model) {
        args.push('--model', input.model);
      }

      const { stdout, stderr } = await execFileAsync(this.binPath, args, {
        cwd: this.workspace,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 120000, // 2 minutes
        env: {
          ...process.env,
          HOME: process.env.HOME || '/home/opc',
        },
      });

      const content = stdout.trim();
      if (!content && stderr) {
        logger.warn(`Antigravity CLI stderr: ${stderr}`);
      }

      return {
        content: content || 'Ответ от Antigravity пуст.',
        model: this.modelName,
      };
    } catch (error) {
      logger.error(`AntigravityProvider chat failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async runAutonomousTask(goal: string): Promise<AntigravityTaskResponse> {
    logger.info(`Starting autonomous Antigravity task in workspace [${this.workspace}]: ${goal}`);

    try {
      const args = [
        '-p',
        `Выполни следующую автономную задачу в текущей рабочей директории: ${goal}. Работай автономно, создавай необходимые файлы и проверяй их. В конце дай краткий отчет.`,
        '--dangerously-skip-permissions',
        '--output-format',
        'text',
      ];

      const { stdout, stderr } = await execFileAsync(this.binPath, args, {
        cwd: this.workspace,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 300000, // 5 minutes
        env: {
          ...process.env,
          HOME: process.env.HOME || '/home/opc',
        },
      });

      const report = stdout.trim() || stderr.trim() || 'Задача выполнена.';

      return {
        success: true,
        goal,
        report,
      };
    } catch (error) {
      logger.error(`AntigravityProvider runAutonomousTask error: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        goal,
        report: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async downloadWorkspaceFile(relPath: string): Promise<Buffer> {
    const cleanRel = relPath.trim().replace(/^[/\\]+/, '');
    const safePath = path.resolve(this.workspace, cleanRel);

    if (!safePath.startsWith(this.workspace)) {
      throw new Error(`Access denied: path '${relPath}' is outside workspace`);
    }

    if (!fs.existsSync(safePath)) {
      throw new Error(`File '${relPath}' not found in workspace`);
    }

    return await fs.promises.readFile(safePath);
  }

  getRuntimeInfo(): AIProviderRuntimeInfo {
    return {
      provider: this.name,
      model: this.modelName,
    };
  }
}
