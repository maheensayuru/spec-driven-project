import { z } from 'zod';

export const UserRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const RegisterRequestSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(255),
  organizationName: z.string().min(2).max(255),
  defaultCurrency: z.string().length(3).default('USD'),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthSessionSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string(),
  }),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    tier: z.enum(['free', 'business', 'pro']),
    role: UserRoleSchema,
    defaultCurrency: z.string().length(3),
  }),
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

export const InviteMemberRequestSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']),
});
export type InviteMemberRequest = z.infer<typeof InviteMemberRequestSchema>;
