import { IMessageFormatter, FormatterOptions } from '../formatter.types';
import { PlainTextFormatter } from './plaintext.formatter';

export class MinecraftFormatter implements IMessageFormatter {
  private plainTextFormatter = new PlainTextFormatter();

  format(text: string, options?: FormatterOptions): string {
    if (!text) return '';

    // By default for Minecraft, singleLine is true unless explicitly set to false
    const singleLine = options?.singleLine ?? true;
    const singleLineSeparator = options?.singleLineSeparator ?? ' | ';

    // Format text using plain text rules
    let formatted = this.plainTextFormatter.format(text, {
      singleLine,
      singleLineSeparator,
    });

    // Replace multiple spaces with single space
    formatted = formatted.replace(/\s+/g, ' ');

    return formatted.trim();
  }
}
