export type TargetFormat = 'telegram' | 'minecraft' | 'discord' | 'plaintext';

export interface FormatterOptions {
  /**
   * If true, converts multiline text into a single line (useful for in-game chats like Minecraft).
   */
  singleLine?: boolean;
  /**
   * Separator to use when joining multiline text into single line. Default is ' | '.
   */
  singleLineSeparator?: string;
}

export interface IMessageFormatter {
  format(text: string, options?: FormatterOptions): string;
}
