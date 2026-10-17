import { IMessageFormatter, FormatterOptions } from '../formatter.types';

export class TelegramFormatter implements IMessageFormatter {
  /**
   * Safely escapes HTML special characters.
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  format(text: string, _options?: FormatterOptions): string {
    if (!text) return '';

    // Placeholders to protect code blocks, inline code, and existing valid HTML tags
    const codeBlocks: string[] = [];
    const inlineCodes: string[] = [];
    const existingTags: string[] = [];

    let processed = text;

    // 1. Extract and store multiline code blocks ```lang ... ```
    processed = processed.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, (_match, lang, code) => {
      const escapedCode = this.escapeHtml(code.trimEnd());
      const placeholder = `@@CODEBLOCK${codeBlocks.length}@@`;
      if (lang) {
        codeBlocks.push(`<pre><code class="language-${lang}">${escapedCode}</code></pre>`);
      } else {
        codeBlocks.push(`<pre><code>${escapedCode}</code></pre>`);
      }
      return placeholder;
    });

    // 2. Extract and store inline code `code`
    processed = processed.replace(/`([^`]+)`/g, (_match, code) => {
      const placeholder = `@@INLINECODE${inlineCodes.length}@@`;
      inlineCodes.push(`<code>${this.escapeHtml(code)}</code>`);
      return placeholder;
    });

    // 3. Extract and protect pre-existing valid Telegram HTML tags
    const validTagRegex = /<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|a(?:\s+href="[^"]*")?)\s*\/?>/gi;
    processed = processed.replace(validTagRegex, (match) => {
      const placeholder = `@@EXISTINGTAG${existingTags.length}@@`;
      existingTags.push(match);
      return placeholder;
    });

    // 4. Escape general HTML in the remaining text
    processed = this.escapeHtml(processed);

    // 5. Convert Links [text](url) -> <a href="url">text</a>
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // 6. Convert Headers (# Header) -> <b>Header</b>
    processed = processed.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

    // 7. Convert Bold (***text***, **text**, __text__) -> <b>text</b>
    processed = processed.replace(/(\*{3}|_{3})([\s\S]+?)\1/g, '<b><i>$2</i></b>');
    processed = processed.replace(/(\*{2}|_{2})([\s\S]+?)\1/g, '<b>$2</b>');

    // 8. Convert Italic (*text*, _text_) -> <i>text</i>
    processed = processed.replace(/(?<!\w)(\*|_)(?!\s)([\s\S]+?)(?<!\s)\1(?!\w)/g, '<i>$2</i>');

    // 9. Convert Bullet Lists (* item, - item) -> • item
    processed = processed.replace(/^[\s]*[*+-]\s+/gm, '• ');

    // 10. Restore pre-existing HTML tags
    existingTags.forEach((tagHtml, index) => {
      processed = processed.replace(`@@EXISTINGTAG${index}@@`, tagHtml);
    });

    // 11. Restore Inline Code
    inlineCodes.forEach((codeHtml, index) => {
      processed = processed.replace(`@@INLINECODE${index}@@`, codeHtml);
    });

    // 12. Restore Code Blocks
    codeBlocks.forEach((blockHtml, index) => {
      processed = processed.replace(`@@CODEBLOCK${index}@@`, blockHtml);
    });

    return processed;
  }
}
