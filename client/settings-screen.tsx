import type { PluginSurfaceProps, SettingsState } from "@getpaseo/plugin/client";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { Text } from "react-native";
import { chatRootInfoRpc } from "../shared/rpc";
import { chatSettings } from "../shared/settings";
import { useModelOptions } from "./models";

type Ready = Extract<SettingsState<typeof chatSettings.schema>, { status: "ready" }>;
const AUTOMATIC = "__automatic__";

function Controls({ settings, theme }: { settings: Ready; theme: PluginSurfaceProps["theme"] }) {
  const paseo = usePaseo();
  const models = useModelOptions(paseo);
  const rootInfo = useRpc(chatRootInfoRpc);
  const info = useQuery({ queryKey: ["new-chat", "root-info", settings.revision], queryFn: () => rootInfo({}) });
  const [root, setRoot] = useState(settings.values.scratchRoot);
  const text = useMemo(() => ({ color: theme.colors.foreground }), [theme]);

  const modelChoices = useMemo(
    () => [
      { label: "Automatic (first ready provider)", value: AUTOMATIC },
      ...(models.data ?? []).map((option) => ({ label: option.label, value: option.value })),
    ],
    [models.data],
  );
  const changeModel = useCallback(
    (value: string) =>
      void settings.save({ ...settings.values, defaultModel: value === AUTOMATIC ? "" : value }, settings.revision),
    [settings],
  );
  const saveRoot = useCallback(
    () => void settings.save({ ...settings.values, scratchRoot: root.trim() }, settings.revision),
    [settings, root],
  );

  return (
    <>
      <SettingsSection title="New chats">
        <SettingsCard>
          <SettingsSelect
            label="Default model"
            value={settings.values.defaultModel || AUTOMATIC}
            options={modelChoices}
            disabled={settings.saving}
            onValueChange={changeModel}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Advanced">
        <SettingsCard>
          <SettingsInput
            label="Chat folder"
            hint={`An absolute path on the daemon host. Empty uses ${info.data?.defaultRoot ?? "$PASEO_HOME/scratch"}. Only new chats move; existing chats keep their folders.`}
            initialValue={settings.values.scratchRoot}
            onChangeText={setRoot}
            disabled={settings.saving}
            error={settings.saveError}
          />
          <SettingsAction label="Apply chat folder" actionLabel="Save" disabled={settings.saving} onPress={saveRoot} />
          <SettingsRow label="New chats are created in" hint={info.data?.rootError ?? undefined}>
            <Text style={text}>{info.data?.effectiveRoot ?? "…"}</Text>
          </SettingsRow>
          <SettingsRow label="Chats created">
            <Text style={text}>{info.data ? String(info.data.chatCount) : "…"}</Text>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </>
  );
}

export function NewChatSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(chatSettings);
  const text = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  if (settings.status === "loading") return <Text style={text}>Loading settings…</Text>;
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="New chats">
        <Text style={text}>{settings.error}</Text>
        <SettingsAction label="Try again" actionLabel="Reload" onPress={settings.reload} />
        {settings.status === "invalid" ? (
          <SettingsAction label="Restore default settings" actionLabel="Reset" onPress={settings.reset} />
        ) : null}
      </SettingsSection>
    );
  }
  return <Controls settings={settings} theme={theme} />;
}
