import { TargetFormat, FormatterOptions, IMessageFormatter } from './formatter.types';
import { TelegramFormatter } from './formatters/telegram.formatter';
import { MinecraftFormatter } from './formatters/minecraft.formatter';
import { DiscordFormatter } from './formatters/discord.formatter';
import { PlainTextFormatter } from './formatters/plaintext.formatter';

export class FormatterService {
  private formatters: Map<TargetFormat, IMessageFormatter> = new Map();

  constructor() {
    this.registerFormatter('telegram', new TelegramFormatter());
    this.registerFormatter('minecraft', new MinecraftFormatter());
    this.registerFormatter('discord', new DiscordFormatter());
    this.registerFormatter('plaintext', new PlainTextFormatter());
  }

  /**
   * Register a custom or overridden formatter for a specific target format.
   */
  registerFormatter(target: TargetFormat, formatter: IMessageFormatter): void {
    this.formatters.set(target, formatter);
  }

  /**
   * Format message for the specified target destination.
   */
  format(text: string, target: TargetFormat, options?: FormatterOptions): string {
    const formatter = this.formatters.get(target);
    if (!formatter) {
      // Fall back to plain text formatter if target not found
      const fallback = this.formatters.get('plaintext');
      return fallback ? fallback.format(text, options) : text;
    }
    return formatter.format(text, options);
  }
}

export const formatterService = new FormatterService();
