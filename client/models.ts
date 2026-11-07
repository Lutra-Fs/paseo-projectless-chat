import type { usePaseo } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";

/** Derived from the host SDK; `@getpaseo/client` does not resolve in a Git install. */
type PaseoApi = ReturnType<typeof usePaseo>;

export interface ModelOption {
  /** `provider/model`, the form `config.provider` takes. */
  value: string;
  /** "Provider · Model", for lists that mix providers. */
  label: string;
  provider: string;
  providerLabel: string;
  modelLabel: string;
  isDefault: boolean;
}

type Snapshot = Awaited<ReturnType<PaseoApi["providers"]["snapshot"]>>;

export function modelOptions(snapshot: Snapshot): ModelOption[] {
  const options: ModelOption[] = [];
  // Newer daemons may send models only in the compact form.
  const compactModels = new Map(
    (snapshot.compactSnapshot?.entries ?? []).map((entry) => [entry.provider, entry.models ?? []]),
  );
  for (const entry of snapshot.entries) {
    if (entry.enabled === false || entry.status !== "ready") continue;
    const providerLabel = entry.label ?? entry.provider;
    const models = entry.models?.length ? entry.models : (compactModels.get(entry.provider) ?? []);
    for (const model of models) {
      if (model.isSelectable === false) continue;
      options.push({
        value: `${entry.provider}/${model.id}`,
        label: `${providerLabel} · ${model.label}`,
        provider: entry.provider,
        providerLabel,
        modelLabel: model.label,
        isDefault: model.isDefault === true,
      });
    }
  }
  return options;
}

/** The configured model when it is still offered, else the first provider's default model, else the first model. */
export function pickModel(options: readonly ModelOption[], preferred: string): string | null {
  if (preferred && options.some((option) => option.value === preferred)) return preferred;
  return (options.find((option) => option.isDefault) ?? options[0])?.value ?? null;
}

export function useModelOptions(paseo: PaseoApi) {
  return useQuery({
    queryKey: ["projectless-chat", "models"],
    queryFn: async () => modelOptions(await paseo.providers.waitForReady({ timeoutMs: 30_000 })),
    staleTime: 60_000,
  });
}
