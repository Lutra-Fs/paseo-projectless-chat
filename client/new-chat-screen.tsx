import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { usePaseo, useRpc, useSettings } from "@getpaseo/plugin/client";
import { Icon, Loading, Modal, ScrollView, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { abandonChatRpc, bindChatRpc, prepareChatRpc } from "../shared/rpc";
import { chatSettings } from "../shared/settings";
import { readDraft, writeDraft } from "./drafts";
import { pickModel, useModelOptions } from "./models";
import { newNonce } from "./nonce";

/**
 * The first message of a chat. Sending it claims a folder on the daemon host, creates the
 * workspace and agent in one call with the message as prompt (so Paseo names the workspace from
 * it), then hands over to Paseo's own chat page for everything after.
 */
export function NewChatScreen({ theme, layout, params, navigation }: PluginScreenProps) {
  const paseo = usePaseo();
  const toast = useToast();
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
  const modelLabel = models.data?.find((option) => option.value === model)?.label;
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
    onError: (error) => toast.error(error instanceof Error ? error.message : String(error)),
  });

  const discard = useMutation({
    mutationFn: () => abandon({ nonce }),
    onSettled: () => changeText(""),
  });

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && model !== null && !send.isPending && navigation !== undefined;
  const submit = useCallback(() => {
    if (canSend && model) send.mutate({ text: trimmed, model });
  }, [canSend, model, send, trimmed]);

  // Web/desktop: Enter sends, Shift+Enter breaks the line, and nothing fires mid-IME composition.
  const submitRef = useRef(submit);
  submitRef.current = submit;
  const onKeyPress = useCallback((event: { nativeEvent: unknown; preventDefault?: () => void }) => {
    if (Platform.OS !== "web") return;
    const key = event.nativeEvent as { key?: string; shiftKey?: boolean; isComposing?: boolean };
    if (key.key === "Enter" && !key.shiftKey && !key.isComposing) {
      event.preventDefault?.();
      submitRef.current();
    }
  }, []);

  const styles = useMemo(() => makeStyles(theme, layout.compact), [theme, layout.compact]);

  if (!navigation) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>This Paseo version cannot open chats from plugins. Update Paseo.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.column}>
        <Text style={styles.heading}>What do you want to talk about?</Text>
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={changeText}
            onKeyPress={onKeyPress}
            placeholder="Message"
            placeholderTextColor={theme.colors.foregroundMuted}
            multiline
            autoFocus
            editable={!send.isPending}
            accessibilityLabel="First message"
            style={styles.input}
          />
          <View style={styles.toolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Choose model"
              onPress={() => setPickerOpen(true)}
              disabled={send.isPending}
              style={styles.chip}
            >
              <Icon name="Cpu" size={14} color={theme.colors.foregroundMuted} />
              <Text style={styles.chipText} numberOfLines={1}>
                {modelLabel ?? (models.isLoading ? "Loading models…" : "No model available")}
              </Text>
            </Pressable>
            <View style={styles.spacer} />
            {trimmed && !send.isPending ? (
              <Pressable accessibilityRole="button" onPress={() => discard.mutate()} style={styles.chip}>
                <Text style={styles.chipText}>Discard</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              onPress={submit}
              disabled={!canSend}
              style={[styles.send, !canSend && styles.sendDisabled]}
            >
              {send.isPending ? (
                <Loading />
              ) : (
                <Icon name="ArrowUp" size={18} color={theme.colors.accentForeground} />
              )}
            </Pressable>
          </View>
        </View>
        {models.isError ? <Text style={styles.muted}>Could not load models: {String(models.error)}</Text> : null}
        <Text style={styles.hint}>
          A folder is created for this chat when you send. No project or folder to pick.
        </Text>
      </View>

      <Modal title="Model" open={pickerOpen} onOpenChange={setPickerOpen}>
        <Modal.Content scrollable={false}>
          <ScrollView>
            {(models.data ?? []).map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                onPress={() => {
                  setChosenModel(option.value);
                  setPickerOpen(false);
                }}
                style={styles.option}
              >
                <Text style={option.value === model ? styles.optionActive : styles.optionText}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Modal.Content>
      </Modal>
    </View>
  );
}

function makeStyles(theme: PluginScreenProps["theme"], compact: boolean) {
  const c = theme.colors;
  return {
    screen: { flex: 1, backgroundColor: c.surface0, padding: compact ? 16 : 32, justifyContent: "center" as const },
    column: { width: "100%" as const, maxWidth: 760, alignSelf: "center" as const, gap: 12 },
    heading: { color: c.foreground, fontSize: compact ? 20 : 24, fontWeight: "600" as const },
    composer: { borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.surface1, padding: 12, gap: 8 },
    input: { color: c.foreground, fontSize: 15, minHeight: 72, maxHeight: 320, textAlignVertical: "top" as const },
    toolbar: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    chip: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 6, paddingHorizontal: 10,
      paddingVertical: 6, borderRadius: 8, backgroundColor: c.surface2, maxWidth: 280,
    },
    chipText: { color: c.foregroundMuted, fontSize: 13 },
    spacer: { flex: 1 },
    send: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.accent, alignItems: "center" as const, justifyContent: "center" as const },
    sendDisabled: { opacity: 0.4 },
    hint: { color: c.foregroundMuted, fontSize: 12 },
    muted: { color: c.foregroundMuted },
    option: { paddingVertical: 10 },
    optionText: { color: c.foreground },
    optionActive: { color: c.accent, fontWeight: "600" as const },
  };
}
