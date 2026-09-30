import { IMessageFormatter, FormatterOptions } from '../formatter.types';

export class DiscordFormatter implements IMessageFormatter {
  format(text: string, options?: FormatterOptions): string {
    if (!text) return '';

    let result = text;

    // Convert bullet points if needed
    result = result.replace(/^[\s]*[*+-]\s+/gm, '• ');

    if (options?.singleLine) {
      const sep = options.singleLineSeparator ?? ' | ';
      result = result
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join(sep);
    }

    return result.trim();
  }
}
