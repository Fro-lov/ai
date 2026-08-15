const logLevels = {
  info: 'INFO',
  error: 'ERROR',
  warn: 'WARN',
} as const;

type LogLevel = keyof typeof logLevels;

function formatMessage(level: LogLevel, message: string): string {
  const timestamp = new Date().toISOString();
  return `[${timestamp}] [${logLevels[level]}] ${message}`;
}

export const logger = {
  info: (message: string) => {
    console.log(formatMessage('info', message));
  },
  error: (message: string) => {
    console.error(formatMessage('error', message));
  },
  warn: (message: string) => {
    console.warn(formatMessage('warn', message));
  },
};
