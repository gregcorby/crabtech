import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const createBotSchema = z.object({
  name: z.string().min(1).max(64),
});

export const updateBotConfigSchema = z.object({
  modelProvider: z.string().optional(),
  apiKey: z.string().optional(),
  systemInstructions: z.string().max(10000).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateBotInput = z.infer<typeof createBotSchema>;
export type UpdateBotConfigInput = z.infer<typeof updateBotConfigSchema>;
