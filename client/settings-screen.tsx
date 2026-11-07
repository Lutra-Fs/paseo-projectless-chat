import type { PluginSurfaceProps, SettingsState } from "@getpaseo/plugin/client";
import { usePaseo, useRpc, useSettings, useTranslation } from "@getpaseo/plugin/client";
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
import { chatRootInfoRpc, type RootProblem } from "../shared/rpc";
import { chatSettings } from "../shared/settings";
import { messages } from "./messages";
import { useModelOptions } from "./models";

type Ready = Extract<SettingsState<typeof chatSettings.schema>, { status: "ready" }>;
const AUTOMATIC = "__automatic__";

/** The daemon sends a code; the words follow the app's language. */
function useRootProblemText(problem: RootProblem | null | undefined): string | undefined {
  const { t } = useTranslation(messages);
  if (!problem) return undefined;
  return problem.code === "not_absolute"
    ? t("settings.rootNotAbsolute")
    : t("settings.rootInsideGit", { repo: problem.repo });
}

function Controls({ settings, theme }: { settings: Ready; theme: PluginSurfaceProps["theme"] }) {
  const { t, locale } = useTranslation(messages);
  const paseo = usePaseo();
  const models = useModelOptions(paseo);
  const rootInfo = useRpc(chatRootInfoRpc);
  const info = useQuery({
    queryKey: ["projectless-chat", "root-info", settings.revision],
    queryFn: () => rootInfo({}),
  });
  const [root, setRoot] = useState(settings.values.chatRoot);
  const text = useMemo(() => ({ color: theme.colors.foreground }), [theme]);

  const modelChoices = useMemo(
    () => [
      { label: t("settings.automatic"), value: AUTOMATIC },
      ...(models.data ?? []).map((option) => ({ label: option.label, value: option.value })),
    ],
    [models.data, t],
  );
  const changeModel = useCallback(
    (value: string) =>
      void settings.save({ ...settings.values, defaultModel: value === AUTOMATIC ? "" : value }, settings.revision),
    [settings],
  );
  const saveRoot = useCallback(
    () => void settings.save({ ...settings.values, chatRoot: root.trim() }, settings.revision),
    [settings, root],
  );
  const rootError = useRootProblemText(info.data?.rootError);

  return (
    <>
      <SettingsSection title={t("settings.newChats")}>
        <SettingsCard>
          <SettingsSelect
            label={t("settings.defaultModel")}
            value={settings.values.defaultModel || AUTOMATIC}
            options={modelChoices}
            disabled={settings.saving}
            onValueChange={changeModel}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t("settings.advanced")}>
        <SettingsCard>
          <SettingsInput
            label={t("settings.chatFolder")}
            hint={t("settings.chatFolderHint", { defaultRoot: info.data?.defaultRoot ?? "$PASEO_HOME/chats" })}
            initialValue={settings.values.chatRoot}
            onChangeText={setRoot}
            disabled={settings.saving}
            error={settings.saveError}
          />
          <SettingsAction
            label={t("settings.applyChatFolder")}
            actionLabel={t("settings.save")}
            disabled={settings.saving}
            onPress={saveRoot}
          />
          <SettingsRow label={t("settings.createdIn")} error={rootError ?? null}>
            <Text style={text}>{info.data?.effectiveRoot ?? "…"}</Text>
          </SettingsRow>
          <SettingsRow label={t("settings.chatCount")}>
            <Text style={text}>{info.data ? info.data.chatCount.toLocaleString(locale) : "…"}</Text>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
    </>
  );
}

export function ProjectlessChatSettings({ theme }: PluginSurfaceProps) {
  const { t } = useTranslation(messages);
  const settings = useSettings(chatSettings);
  const text = useMemo(() => ({ color: theme.colors.foreground }), [theme]);
  if (settings.status === "loading") return <Text style={text}>{t("settings.loading")}</Text>;
  if (settings.status !== "ready") {
    return (
      <SettingsSection title={t("settings.newChats")}>
        <Text style={text}>{settings.error}</Text>
        <SettingsAction label={t("settings.tryAgain")} actionLabel={t("settings.reload")} onPress={settings.reload} />
        {settings.status === "invalid" ? (
          <SettingsAction label={t("settings.restoreDefaults")} actionLabel={t("settings.reset")} onPress={settings.reset} />
        ) : null}
      </SettingsSection>
    );
  }
  return <Controls settings={settings} theme={theme} />;
}
