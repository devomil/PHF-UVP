export interface Logger {
  info: (message: string, data?: any) => void;
  warn: (message: string, data?: any) => void;
  error: (message: string, data?: any) => void;
  debug: (message: string, data?: any) => void;
}

export function createLogger(prefix: string): Logger {
  const format = (level: string, message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const base = `[${timestamp}] [${level}] [${prefix}] ${message}`;
    if (data !== undefined) {
      return `${base} ${typeof data === 'string' ? data : JSON.stringify(data)}`;
    }
    return base;
  };

  return {
    info: (message: string, data?: any) => console.log(format('INFO', message, data)),
    warn: (message: string, data?: any) => console.warn(format('WARN', message, data)),
    error: (message: string, data?: any) => console.error(format('ERROR', message, data)),
    debug: (message: string, data?: any) => {
      if (process.env.LOG_LEVEL === 'debug') {
        console.log(format('DEBUG', message, data));
      }
    },
  };
}
