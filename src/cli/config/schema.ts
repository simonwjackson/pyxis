import { z } from 'zod';

/**
 * Zod schema for application configuration
 */
export const AppConfigSchema = z.object({
  auth: z
    .object({
      username: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),

  output: z
    .object({
      format: z.enum(['human', 'json']).default('human'),
      verbose: z.boolean().default(false),
      color: z.boolean().default(true),
    })
    .optional(),

  cache: z
    .object({
      enabled: z.boolean().default(true),
      ttl: z.number().int().positive().default(3600), // seconds
      path: z.string().optional(),
    })
    .optional(),

  playlist: z
    .object({
      quality: z.enum(['high', 'medium', 'low']).default('high'),
      additionalUrl: z.string().optional(),
    })
    .optional(),

  stations: z
    .object({
      sort: z.enum(['name', 'created', 'recent']).default('recent'),
      limit: z.number().int().positive().optional(),
    })
    .optional(),
});

/**
 * Inferred TypeScript type from the Zod schema
 */
export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: AppConfig = {
  output: {
    format: 'human',
    verbose: false,
    color: true,
  },
  cache: {
    enabled: true,
    ttl: 3600,
  },
  playlist: {
    quality: 'high',
  },
  stations: {
    sort: 'recent',
  },
};
