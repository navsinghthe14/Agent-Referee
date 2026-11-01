#!/usr/bin/env node
// PostToolUse hook: records every tool call (name + short summary) for the session audit.
// The log comes from the harness, not from what the agent says it did.
import { readStdin, logEvent, summarize, fullSendActive } from '../lib.mjs';
const raw = await readStdin();
let input = {}; try { input = JSON.parse(raw || '{}'); } catch {}
if (input.tool_name) logEvent(input.session_id, { type: 'tool', ...summarize(input.tool_name, input.tool_input || {}), fullSend: fullSendActive() });
process.exit(0);
