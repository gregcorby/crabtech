import { z } from "zod";

export const bootstrapParamsSchema = z.object({
  botId: z.string(),
  gatewayToken: z.string(),
  clawdbotVersion: z.string().default("latest"),
  modelProviderKey: z.string().optional(),
  modelProvider: z.string().optional(),
  systemInstructions: z.string().optional(),
  volumeDevice: z.string().default("/dev/sda1"),
  mountPath: z.string().default("/data"),
});

export type BootstrapParams = z.infer<typeof bootstrapParamsSchema>;
