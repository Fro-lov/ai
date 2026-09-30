import { IMessageFormatter, FormatterOptions } from '../formatter.types';

export class PlainTextFormatter implements IMessageFormatter {
  format(text: string, options?: FormatterOptions): string {
    if (!text) return '';

    let result = text;

    // 1. Code blocks ```lang ... ```
    result = result.replace(/```[\s\S]*?```/g, (match) => {
      const content = match.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/```$/, '');
      return content.trim();
    });

    // 2. Inline code `code`
    result = result.replace(/`([^`]+)`/g, '$1');

    // 3. Unordered list bullets (*, -, +) - do BEFORE bold/italic stripping
    result = result.replace(/^\s*[*+-]\s+/gm, '• ');

    // 4. Images ![alt](url) -> alt
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1');

    // 5. Links [text](url) -> text (url)
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

    // 6. Bold/Italic ***text*** or ___text___
    result = result.replace(/(\*{3}|_{3})([\s\S]+?)\1/g, '$2');

    // 7. Bold **text** or __text__
    result = result.replace(/(\*{2}|_{2})([\s\S]+?)\1/g, '$2');

    // 8. Italic *text* or _text_
    result = result.replace(/(\*|_)([\s\S]+?)\1/g, '$2');

    // 9. Headers # Header -> Header
    result = result.replace(/^#{1,6}\s+(.+)$/gm, '$1');

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
