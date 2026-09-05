import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  SESSION_SECRET: z
    .string()
    .min(32)
    .default('renewalradar_super_secure_session_secret_32_bytes_min'),
  DATABASE_URL: z
    .string()
    .default('postgresql://renewalradar:local_dev_password@localhost:5432/renewalradar_dev'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('renewalradar-documents'),
  S3_ACCESS_KEY_ID: z.string().default('minio_admin'),
  S3_SECRET_ACCESS_KEY: z.string().default('minio_dev_password'),
  S3_FORCE_PATH_STYLE: z
    .string()
    .transform((v) => v === 'true')
    .default('true'),
  AI_PROVIDER: z.enum(['mock', 'anthropic', 'openai']).default('mock'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
