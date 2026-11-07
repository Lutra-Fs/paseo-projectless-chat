import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc, useSettings, useTranslation } from "@getpaseo/plugin/client";
import { Icon, Modal, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import { abandonChatRpc, bindChatRpc, prepareChatRpc } from "../shared/rpc";
import { chatSettings } from "../shared/settings";
import { readDraft, writeDraft } from "./drafts";
import { messages } from "./messages";
import { type ModelOption, pickModel, useModelOptions } from "./models";
import { newNonce } from "./nonce";

/**
 * The first message of a chat. Sending it claims a folder on the daemon host, creates the
 * workspace and agent in one call with the message as prompt (so Paseo names the workspace from
 * it), then hands over to Paseo's own chat page for everything after.
 *
 * Laid out like Paseo's New workspace page: a centred column of the app's content width, a
 * plain title, and a composer with the same frame, padding and toolbar geometry.
 */
export function NewChatScreen({ theme, layout, params, navigation }: PluginScreenProps) {
  const { t } = useTranslation(messages);
  const paseo = usePaseo();
  const prepare = useRpc(prepareChatRpc);
  const bind = useRpc(bindChatRpc);
  const abandon = useRpc(abandonChatRpc);
  const settings = useSettings(chatSettings);
  const models = useModelOptions(paseo);

  // The sidebar item always passes a nonce; a hand-typed link without one still gets its own.
  const [fallbackNonce] = useState(newNonce);
  const nonce = params.nonce ?? fallbackNonce;

  const [text, setText] = useState(() => readDraft(nonce));
  useEffect(() => setText(readDraft(nonce)), [nonce]);
  const changeText = useCallback(
    (next: string) => {
      setText(next);
      writeDraft(nonce, next);
    },
    [nonce],
  );

  const preferredModel = settings.status === "ready" ? settings.values.defaultModel : "";
  const [chosenModel, setChosenModel] = useState<string | null>(null);
  const model = chosenModel ?? pickModel(models.data ?? [], preferredModel);
  const selected = models.data?.find((option) => option.value === model);
  const [pickerOpen, setPickerOpen] = useState(false);

  const send = useMutation({
    mutationFn: async (input: { text: string; model: string }) => {
      const chat = await prepare({ nonce, text: input.text });
      if (chat.status !== "active") {
        const workspace = await paseo.workspaces.create({
          idempotencyKey: nonce,
          source: { kind: "directory", path: chat.dir, projectId: chat.projectId },
          // The prompt as workspace context is what makes the daemon name the workspace from it.
          firstAgentContext: { prompt: input.text },
          agent: {
            agentId: chat.agentId,
            cwd: chat.dir,
            config: { provider: input.model },
            prompt: input.text,
          },
        });
        await bind({ nonce, workspaceId: workspace.id });
      }
      return chat.agentId;
    },
    onSuccess: (agentId) => {
      writeDraft(nonce, "");
      navigation?.openAgent({ agentId });
    },
  });

  // Only a failed send leaves something to discard: a claimed, still empty folder.
  const discard = useMutation({
    mutationFn: () => abandon({ nonce }),
    onSettled: () => {
      changeText("");
      send.reset();
    },
  });

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && model !== null && !send.isPending && navigation !== undefined;
  const submit = useCallback(() => {
    if (canSend && model) send.mutate({ text: trimmed, model });
  }, [canSend, model, send, trimmed]);

  // Web/desktop: Enter sends, Shift+Enter breaks the line, and nothing fires mid-IME composition.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const onKeyPress = useCallback(
    (event: { nativeEvent: unknown; preventDefault?: () => void }) => {
      if (layout.platform !== "web") return;
      const key = event.nativeEvent as { key?: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number };
      // keyCode 229 is the IME's own Enter on browsers that do not set isComposing.
      if (key.key === "Enter" && !key.shiftKey && !key.isComposing && key.keyCode !== 229) {
        event.preventDefault?.();
        submitRef.current();
      }
    },
    [layout.platform],
  );

  const pointer = layout.platform === "web";
  const styles = useMemo(() => makeStyles(theme, pointer, layout.compact), [theme, pointer, layout.compact]);
  const groups = useMemo(() => groupByProvider(models.data ?? []), [models.data]);

  if (!navigation) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>{t("newChat.updatePaseo")}</Text>
      </View>
    );
  }

  let modelText: string;
  if (selected) modelText = selected.modelLabel;
  else if (models.isLoading) modelText = t("newChat.loadingModels");
  else modelText = t("newChat.noModel");

  return (
    <View style={styles.screen}>
      <View style={styles.column}>
        {layout.compact ? null : <Text style={styles.title}>{t("newChat.title")}</Text>}
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={changeText}
            onKeyPress={onKeyPress}
            placeholder={t("newChat.placeholder")}
            placeholderTextColor={theme.colors.foregroundMuted}
            multiline
            autoFocus
            editable={!send.isPending}
            accessibilityLabel={t("newChat.inputLabel")}
            style={styles.input}
          />
          <View style={styles.toolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("newChat.chooseModel")}
              onPress={() => setPickerOpen(true)}
              disabled={send.isPending || !models.data?.length}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
                styles.modelControl,
                (hovered || pressed) && styles.modelControlActive,
              ]}
            >
              <Text style={styles.modelText} numberOfLines={1}>
                {modelText}
              </Text>
              <Icon name="ChevronDown" size={14} color={theme.colors.foregroundMuted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("newChat.send")}
              onPress={submit}
              disabled={!canSend}
              style={[styles.send, !canSend && !send.isPending && styles.sendDisabled]}
            >
              {send.isPending ? (
                <ActivityIndicator size="small" color={theme.colors.accentForeground} />
              ) : (
                <Icon
                  name="CornerDownLeft"
                  size={pointer ? 14 : 18}
                  color={canSend ? theme.colors.accentForeground : theme.colors.foregroundMuted}
                />
              )}
            </Pressable>
          </View>
        </View>
        <View style={styles.below}>
          {send.isError ? (
            <View style={styles.errorRow}>
              <Text style={styles.error}>
                {t("newChat.sendFailed", { error: errorText(send.error) })}
              </Text>
              <Pressable accessibilityRole="button" onPress={submit} disabled={!canSend}>
                <Text style={styles.link}>{t("newChat.retry")}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => discard.mutate()}>
                <Text style={styles.link}>{t("newChat.discard")}</Text>
              </Pressable>
            </View>
          ) : models.isError ? (
            <Text style={styles.error}>{t("newChat.modelsError", { error: errorText(models.error) })}</Text>
          ) : (
            <Text style={styles.hint}>{t("newChat.hint")}</Text>
          )}
        </View>
      </View>

      <Modal title={t("newChat.modelPicker")} open={pickerOpen} onOpenChange={setPickerOpen}>
        <Modal.Content scrollable={false}>
          <ScrollView contentContainerStyle={styles.sheet}>
            {groups.map((group) => (
              <View key={group.provider} style={styles.sheetGroup}>
                <Text style={styles.sheetGroupLabel}>{group.providerLabel}</Text>
                {group.options.map((option) => {
                  const active = option.value === model;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        setChosenModel(option.value);
                        setPickerOpen(false);
                      }}
                      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
                        styles.sheetRow,
                        (active || hovered || pressed) && styles.sheetRowActive,
                      ]}
                    >
                      <Text style={styles.sheetLabel} numberOfLines={1}>
                        {option.modelLabel}
                      </Text>
                      {active ? <Icon name="Check" size={16} color={theme.colors.foreground} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </Modal.Content>
      </Modal>
    </View>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function groupByProvider(options: readonly ModelOption[]) {
  const groups: { provider: string; providerLabel: string; options: ModelOption[] }[] = [];
  for (const option of options) {
    let group = groups.find((entry) => entry.provider === option.provider);
    if (!group) {
      group = { provider: option.provider, providerLabel: option.providerLabel, options: [] };
      groups.push(group);
    }
    group.options.push(option);
  }
  return groups;
}

/** Paseo's composer geometry (`composer/input/toolbar-rails.ts`), by pointer or touch sizing. */
const GEOMETRY = {
  pointer: { padTop: 16, padBottom: 12, padX: 16, radius: 16, control: 28, disc: 28 },
  touch: { padTop: 12, padBottom: 4, padX: 16, radius: 26, control: 44, disc: 36 },
} as const;
/** Paseo's default content width (`DEFAULT_CONTENT_MAX_WIDTH`). */
const CONTENT_MAX_WIDTH = 820;

function makeStyles(theme: PluginScreenProps["theme"], pointer: boolean, compact: boolean) {
  const c = theme.colors;
  const g = pointer ? GEOMETRY.pointer : GEOMETRY.touch;
  // Any browser, phone-sized ones included, draws a focus outline the composer frame replaces.
  const web = Platform.OS === "web" ? ({ outlineStyle: "none", lineHeight: 21 } as object) : {};
  return {
    screen: {
      flex: 1,
      backgroundColor: c.surface0,
      paddingHorizontal: compact ? 8 : 24,
      paddingBottom: compact ? 8 : 64,
      alignItems: "center" as const,
      // Compact: the free space sits above, so the composer rests where the thumb is.
      justifyContent: compact ? ("flex-end" as const) : ("center" as const),
    },
    column: { width: "100%" as const, maxWidth: CONTENT_MAX_WIDTH },
    title: {
      color: c.foreground,
      fontSize: 20,
      fontWeight: "normal" as const,
      marginBottom: 32,
      paddingLeft: 24,
      paddingRight: 16,
    },
    composer: {
      gap: 12,
      backgroundColor: c.surface1,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: g.radius,
      paddingTop: g.padTop,
      paddingBottom: g.padBottom,
      paddingHorizontal: g.padX,
    },
    input: {
      color: c.foreground,
      fontSize: 15,
      minHeight: 44,
      maxHeight: 320,
      padding: 0,
      textAlignVertical: "top" as const,
      ...web,
    },
    toolbar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      minHeight: g.control,
      // Controls overhang the padding slightly, as Paseo's toolbar does.
      marginHorizontal: pointer ? -6 : 0,
    },
    modelControl: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      height: g.disc,
      paddingHorizontal: 8,
      borderRadius: 9999,
      maxWidth: 320,
    },
    modelControlActive: { backgroundColor: c.surface2 },
    modelText: { color: c.foregroundMuted, fontSize: 14 },
    send: {
      width: g.disc,
      height: g.disc,
      borderRadius: 9999,
      backgroundColor: c.accent,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    sendDisabled: { backgroundColor: c.surface2 },
    below: { minHeight: 20, marginTop: 10, paddingHorizontal: 16 },
    hint: { color: c.foregroundMuted, fontSize: 12 },
    errorRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: 12 },
    error: { color: c.statusDanger, fontSize: 12, flexShrink: 1 },
    link: { color: c.foreground, fontSize: 12, textDecorationLine: "underline" as const },
    muted: { color: c.foregroundMuted },
    sheet: { gap: 16, paddingBottom: 8 },
    sheetGroup: { gap: 4 },
    sheetGroupLabel: { color: c.foregroundMuted, fontSize: 12, paddingHorizontal: 16, marginBottom: 2 },
    sheetRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      gap: 8,
      minHeight: pointer ? 36 : 44,
      paddingHorizontal: 16,
      borderRadius: 16,
    },
    sheetRowActive: { backgroundColor: c.surface2 },
    sheetLabel: { color: c.foreground, fontSize: 14, flexShrink: 1 },
  };
}
