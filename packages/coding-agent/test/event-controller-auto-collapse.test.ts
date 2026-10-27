/**
 * `display.autoCollapseOnTurnEnd` wiring in EventController.
 *
 * While a turn runs, tool output stays expanded so the user can monitor and
 * interrupt early. When the terminal `agent_end` lands, the finished turn's
 * tool cards must collapse to their preview so the final answer is not buried
 * under the output — without flipping the sticky `toolOutputExpanded`
 * preference the next turn starts from. With the setting off, the settled
 * transcript keeps its expanded presentation.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "bun:test";
import type { AssistantMessage, ToolCall, Usage } from "@oh-my-pi/pi-ai";
import { resetSettingsForTest, Settings } from "@oh-my-pi/pi-coding-agent/config/settings";
import { EventController } from "@oh-my-pi/pi-coding-agent/modes/controllers/event-controller";
import type { AgentSessionEvent } from "@oh-my-pi/pi-coding-agent/session/agent-session";
import { initTheme } from "@oh-my-pi/pi-tui/theme";
import { createInteractiveModeContext } from "./helpers/interactive-mode-context";

const TOOL_CALL_ID = "toolu_auto_collapse_a";
const FINAL_MARKER = "FINAL ANSWER AFTER TOOL";
const DEEP_RESULT_MARKER = "RESULT LINE 30 DEEP";

function zeroUsage(): Usage {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function assistantMessage(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "cursor",
		provider: "cursor",
		model: "cursor-model",
		stopReason: "stop",
		usage: zeroUsage(),
		timestamp: 1,
	};
}

function createFixture() {
	const ctx = createInteractiveModeContext({
		toolOutputExpanded: true,
		noteDisplayableThinkingContent: vi.fn(() => false),
		lastAssistantUsage: zeroUsage(),
	});
	return { controller: new EventController(ctx), chatContainer: ctx.chatContainer, ctx };
}

async function runTurn(controller: EventController): Promise<AssistantMessage> {
	const toolCall: ToolCall = {
		type: "toolCall",
		id: TOOL_CALL_ID,
		name: "contract_probe",
		arguments: { value: "a" },
	};
	const started = assistantMessage([]);
	const withToolCall = assistantMessage([toolCall]);
	const completed = assistantMessage([toolCall, { type: "text", text: FINAL_MARKER }]);
	const deepResult = Array.from({ length: 30 }, (_, i) =>
		i === 29 ? DEEP_RESULT_MARKER : `RESULT LINE ${i + 1}`,
	).join("\n");

	await controller.handleEvent({ type: "message_start", message: started } as Extract<
		AgentSessionEvent,
		{ type: "message_start" }
	>);
	await controller.handleEvent({
		type: "message_update",
		message: withToolCall,
		assistantMessageEvent: { type: "toolcall_end", contentIndex: 0, toolCall, partial: withToolCall },
	} as Extract<AgentSessionEvent, { type: "message_update" }>);
	await controller.handleEvent({
		type: "tool_execution_start",
		toolCallId: TOOL_CALL_ID,
		toolName: "contract_probe",
		args: { value: "a" },
	} as Extract<AgentSessionEvent, { type: "tool_execution_start" }>);
	await controller.handleEvent({
		type: "tool_execution_end",
		toolCallId: TOOL_CALL_ID,
		toolName: "contract_probe",
		result: { content: [{ type: "text", text: deepResult }] },
		isError: false,
	} as Extract<AgentSessionEvent, { type: "tool_execution_end" }>);
	await controller.handleEvent({ type: "message_end", message: completed } as Extract<
		AgentSessionEvent,
		{ type: "message_end" }
	>);
	return completed;
}

function renderedLines(chatContainer: { render(width: number): readonly string[] }): string[] {
	return chatContainer.render(120).map(line => Bun.stripANSI(line));
}

describe("EventController auto-collapse on turn end", () => {
	beforeAll(async () => {
		await initTheme(false);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		resetSettingsForTest();
	});

	it("collapses the finished turn's tool output at agent_end when the setting is on", async () => {
		await Settings.init({
			inMemory: true,
			overrides: { "display.smoothStreaming": false, "display.autoCollapseOnTurnEnd": true },
		});
		const { controller, chatContainer, ctx } = createFixture();
		const completed = await runTurn(controller);

		// During the turn the deep output is visible for monitoring.
		expect(renderedLines(chatContainer).some(line => line.includes(DEEP_RESULT_MARKER))).toBe(true);

		await controller.handleEvent({ type: "agent_end", messages: [completed], isTerminal: true } as Extract<
			AgentSessionEvent,
			{ type: "agent_end" }
		>);

		const lines = renderedLines(chatContainer);
		expect(lines.some(line => line.includes(DEEP_RESULT_MARKER))).toBe(false);
		expect(lines.some(line => line.includes(FINAL_MARKER))).toBe(true);
		// The sticky preference is untouched: the next turn starts expanded again.
		expect(ctx.toolOutputExpanded).toBe(true);
	});

	it("keeps the finished turn expanded at agent_end when the setting is off", async () => {
		await Settings.init({ inMemory: true, overrides: { "display.smoothStreaming": false } });
		const { controller, chatContainer } = createFixture();
		const completed = await runTurn(controller);

		await controller.handleEvent({ type: "agent_end", messages: [completed], isTerminal: true } as Extract<
			AgentSessionEvent,
			{ type: "agent_end" }
		>);

		const lines = renderedLines(chatContainer);
		expect(lines.some(line => line.includes(DEEP_RESULT_MARKER))).toBe(true);
		expect(lines.some(line => line.includes(FINAL_MARKER))).toBe(true);
	});
});
