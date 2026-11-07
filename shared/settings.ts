import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const chatSettings = defineSettings({
  id: "new-chat",
  scope: "host",
  version: 1,
  schema: z.object({
    /** Absolute path on the daemon host. Empty means `$PASEO_HOME/scratch`. Only affects new chats. */
    scratchRoot: z.string().trim().max(4096).default(""),
    /** `provider/model`. Empty means the first ready provider's default model. */
    defaultModel: z.string().trim().max(512).default(""),
  }),
});
