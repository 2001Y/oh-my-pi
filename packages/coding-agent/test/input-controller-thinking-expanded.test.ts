/**
 * InputController thinking-expansion pair (`setThinkingExpanded`), the
 * extension-facing counterpart to `setToolsExpanded`.
 *
 * Contract: the call applies the new state to every live assistant block and
 * to the session state extensions read back, but — like the tool pair — it
 * must NOT rewrite the persisted `expandThinkingBlocks` setting, so a later
 * session still starts from the user's configured preference.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "bun:test";
import type { AssistantMessage } from "@oh-my-pi/pi-ai";
import { resetSettingsForTest, Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { InputController } from "@oh-my-pi/pi-coding-agent/modes/controllers/input-controller";
import { cfgExpandThinkingBlocks } from "@oh-my-pi/pi-coding-agent/session/settings";
import { AssistantMessageComponent } from "@oh-my-pi/pi-tui/chat/assistant-message";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import { createInteractiveModeContext } from "./helpers/interactive-mode-context";

function thinkingMessage(): AssistantMessage {
	return {
		role: "assistant",
		content: [{ type: "thinking", thinking: "Weighing it carefully" }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "claude-sonnet-4-5",
		stopReason: "stop",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		timestamp: 1,
	};
}

describe("InputController setThinkingExpanded", () => {
	beforeAll(async () => {
		await initTheme(false);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		resetSettingsForTest();
	});

	it("applies to live blocks and session state without persisting the setting", async () => {
		await Settings.init({ inMemory: true });
		const ctx = createInteractiveModeContext({ expandThinkingBlocks: false });
		const component = new AssistantMessageComponent(thinkingMessage());
		ctx.chatContainer.addChild(component);
		const apply = vi.spyOn(component, "setExpandThinkingBlocks");
		const controller = new InputController(ctx);

		controller.setThinkingExpanded(true);
		expect(ctx.expandThinkingBlocks).toBe(true);
		expect(apply).toHaveBeenCalledWith(true);
		expect(cfgExpandThinkingBlocks.get(ctx.settings)).toBe(false);

		controller.setThinkingExpanded(false);
		expect(ctx.expandThinkingBlocks).toBe(false);
		expect(apply).toHaveBeenCalledWith(false);
		expect(cfgExpandThinkingBlocks.get(ctx.settings)).toBe(false);
	});
});
