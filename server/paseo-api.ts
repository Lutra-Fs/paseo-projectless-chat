import type { PluginHandlerContext } from "@getpaseo/plugin/server";

/**
 * The SDK client handlers receive. Derived from the host-provided plugin SDK: a type import of
 * `@getpaseo/client` would have to resolve from this plugin's own node_modules, which a Git
 * install does not have.
 */
export type PaseoApi = PluginHandlerContext["paseo"];
