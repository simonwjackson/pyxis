import pc from 'picocolors';
import Table from 'cli-table3';

/**
 * Standard API response structure
 */
export type StandardResponse<T> = {
  success: boolean;
  data: T | null;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

/**
 * Output options for formatters
 */
export type OutputOptions = {
  json: boolean;
};

/**
 * Format a successful response with data
 */
export function formatResponse<T>(
  data: T,
  options: OutputOptions
): string {
  if (options.json) {
    const response: StandardResponse<T> = {
      success: true,
      data,
    };
    return JSON.stringify(response, null, 2);
  }

  // For human output, convert data to string representation
  if (typeof data === 'string') {
    return data;
  }

  if (typeof data === 'object' && data !== null) {
    return JSON.stringify(data, null, 2);
  }

  return String(data);
}

/**
 * Format an error response
 */
export function formatError(
  error: { code: string; message: string; details?: unknown },
  options: OutputOptions
): string {
  if (options.json) {
    const response: StandardResponse<null> = {
      success: false,
      data: null,
      error,
    };
    return JSON.stringify(response, null, 2);
  }

  // Human-readable error
  let output = `${pc.red('✗')} ${pc.red(error.message)}`;

  if (error.code) {
    output += `\n${pc.dim(`Error code: ${error.code}`)}`;
  }

  if (error.details) {
    output += `\n${pc.dim('Details:')} ${JSON.stringify(error.details, null, 2)}`;
  }

  return output;
}

/**
 * Format data as a table
 */
export function formatTable(
  headers: string[],
  rows: Record<string, unknown>[],
  options: OutputOptions
): string {
  if (options.json) {
    const response: StandardResponse<Record<string, unknown>[]> = {
      success: true,
      data: rows,
    };
    return JSON.stringify(response, null, 2);
  }

  // Human-readable table
  if (rows.length === 0) {
    return pc.dim('No data to display');
  }

  const table = new Table({
    head: headers.map(h => pc.cyan(h)),
    style: {
      head: [],
      border: [],
    },
  });

  for (const row of rows) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) {
        return pc.dim('—');
      }
      return String(value);
    });
    table.push(values);
  }

  return table.toString();
}

/**
 * Format a success message
 */
export function formatSuccess(
  message: string,
  options: OutputOptions
): string {
  if (options.json) {
    const response: StandardResponse<{ message: string }> = {
      success: true,
      data: { message },
    };
    return JSON.stringify(response, null, 2);
  }

  return `${pc.green('✓')} ${message}`;
}

/**
 * Format a warning message
 */
export function formatWarning(
  message: string,
  options: OutputOptions
): string {
  if (options.json) {
    const response: StandardResponse<{ warning: string }> = {
      success: true,
      data: { warning: message },
    };
    return JSON.stringify(response, null, 2);
  }

  return `${pc.yellow('⚠')} ${pc.yellow(message)}`;
}
