/**
 * Antigravity Quota Extension
 * 
 * Provides a command to check the quota status of all available Antigravity models.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

interface CloudCodeQuotaResponse {
  models?: Record<string, {
    displayName?: string;
    model?: string; // e.g. "models/gemini-2.0-flash"
    isInternal?: boolean;
    quotaInfo?: {
      remainingFraction?: number;  // 0.0 to 1.0 (remaining quota)
      limit?: string;              // e.g. "1000"
      resetTime?: string;          // ISO timestamp e.g. "2023-10-27T10:00:00Z"
    };
  }>;
}

interface AntigravityAuth {
  access?: string;
  refresh?: string;
  projectId?: string;
  // Legacy fields
  token?: string;
  accessToken?: string;
}

interface ModelDisplay {
  name: string;
  icon: string;
  remainingPercent: number;
  resetTime: string;
  rawResetTime?: number; // for sorting if needed
}

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const CLOUDCODE_BASE_URL = "https://daily-cloudcode-pa.sandbox.googleapis.com";
const FETCH_TIMEOUT_MS = 15_000;

const ANSI_RESET = "\x1b[0m";
const ANSI_BOLD = "\x1b[1m";
const ANSI_DIM = "\x1b[2m";
const ANSI_RED = "\x1b[31m";
const ANSI_YELLOW = "\x1b[33m";
const ANSI_GREEN = "\x1b[32m";
const ANSI_BLUE = "\x1b[34m";

// ═══════════════════════════════════════════════════════════════════════════
// Auth & API
// ═══════════════════════════════════════════════════════════════════════════

function getAuthPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return join(home, ".pi", "agent", "auth.json");
}

function loadAuth(): AntigravityAuth | null {
  const authPath = getAuthPath();
  if (!existsSync(authPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(authPath, "utf-8");
    const data = JSON.parse(content);
    return data["google-antigravity"] as AntigravityAuth || null;
  } catch {
    return null;
  }
}

async function fetchQuota(accessToken: string, projectId?: string): Promise<CloudCodeQuotaResponse | null> {
  const url = `${CLOUDCODE_BASE_URL}/v1internal:fetchAvailableModels`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  
  try {
    const payload = projectId ? { project: projectId } : {};
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "User-Agent": "antigravity",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      return null;
    }
    
    const text = await response.text();
    if (!text) return null;
    
    return JSON.parse(text) as CloudCodeQuotaResponse;
  } catch (error) {
    console.error("Antigravity quota fetch failed:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Formatting Helpers
// ═══════════════════════════════════════════════════════════════════════════

function getProgressBar(percentRemaining: number, width: number = 10): string {
  const filled = Math.round((percentRemaining / 100) * width);
  const empty = width - filled;
  
  // Color the bar based on remaining
  // Low remaining = Red, High remaining = Green
  let color = ANSI_GREEN;
  if (percentRemaining <= 10) color = ANSI_RED;
  else if (percentRemaining <= 30) color = ANSI_YELLOW;
  
  return `${color}${"━".repeat(filled)}${ANSI_DIM}${"┄".repeat(empty)}${ANSI_RESET}`;
}

function getModelIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("claude")) return "🧠"; 
  if (lower.includes("gpt")) return "🤖";
  if (lower.includes("image") || lower.includes("imagen")) return "🎨";
  if (lower.includes("gemini")) return "✨";
  return "⚡";
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "-";
  
  const target = new Date(isoString).getTime();
  const now = Date.now();
  const diffMs = target - now;
  
  if (diffMs <= 0) return "Ready";
  
  const diffMins = Math.ceil(diffMs / (1000 * 60));
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

function formatLimit(limit?: string): string {
  if (!limit) return "-";
  return limit;
}

// ═══════════════════════════════════════════════════════════════════════════
// Extension
// ═══════════════════════════════════════════════════════════════════════════

export default function antigravityQuota(pi: ExtensionAPI) {
  
  pi.registerCommand("quota", {
    description: "Show quota for all Antigravity models",
    handler: async (_args, ctx) => {
      const auth = loadAuth();
      if (!auth) {
        ctx.ui.notify("Antigravity auth not found (~/.pi/agent/auth.json)", "warning");
        return;
      }

      const token = auth.access || auth.accessToken || auth.token;
      if (!token) {
        ctx.ui.notify("No access token found in auth.json", "warning");
        return;
      }

      ctx.ui.notify("Fetching Antigravity quota...", "info");

      try {
        const data = await fetchQuota(token, auth.projectId);
        
        if (!data || !data.models) {
          ctx.ui.notify("Failed to fetch quota data.", "error");
          return;
        }

        // Process models
        const processedModels: ModelDisplay[] = Object.values(data.models)
          // Filter out internal models and those without display names
          .filter((m: any) => !m.isInternal && m.displayName)
          // Filter out unwanted Gemini 2.5 models
          .filter((m: any) => !m.displayName.includes("Gemini 2.5"))
          .map((m: any) => {
            const name = m.displayName || "Unknown";
            const remaining = m.quotaInfo?.remainingFraction ?? 0;
            const remainingPercent = Math.round(remaining * 100);
            
            return {
              name,
              icon: getModelIcon(name),
              remainingPercent,
              resetTime: formatRelativeTime(m.quotaInfo?.resetTime),
              rawResetTime: m.quotaInfo?.resetTime ? new Date(m.quotaInfo.resetTime).getTime() : 0
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        if (processedModels.length === 0) {
          ctx.ui.notify("No quota information available.", "warning");
          return;
        }

        // Group by family
        const groups: Record<string, ModelDisplay[]> = {
          "Claude": [],
          "Gemini": [],
          "Other": []
        };

        for (const m of processedModels) {
          if (m.name.toLowerCase().includes("claude")) groups["Claude"].push(m);
          else if (m.name.toLowerCase().includes("gemini")) groups["Gemini"].push(m);
          else groups["Other"].push(m);
        }

        // Calculate columns widths
        const all = processedModels;
        
        // Header Texts
        const HEADER_MODEL = "Model";
        const HEADER_USAGE = "Usage";
        const HEADER_RESET = "Resets";

        // Calculate Max Widths
        // Min width for Model is length of "Model"
        const maxNameLen = Math.max(HEADER_MODEL.length, ...all.map(m => m.name.length));
        
        // Usage column width: Bar (10) + Space (1) + Percent (4) = 15 chars
        // We ensure header "Usage" (5) fits.
        const USAGE_COL_WIDTH = 15; 
        
        const maxResetLen = Math.max(HEADER_RESET.length, ...all.map(m => m.resetTime.length));
        
        // Spacing between columns
        const GAP = "   ";
        
        // Total width for separator line
        // Icon (2) + Space (1) + Name + Gap + Usage + Gap + Reset
        // Note: Icon is 2 chars wide usually? Emoji is 2 bytes but often rendered as 2 chars width in terminal? 
        // Using 2 chars for icon space + 1 char space.
        const totalWidth = 3 + maxNameLen + GAP.length + USAGE_COL_WIDTH + GAP.length + maxResetLen;
        
        const separator = `${ANSI_DIM}${"─".repeat(totalWidth)}${ANSI_RESET}`;

        const lines: string[] = [];
        
        // Title
        lines.push(`${ANSI_BOLD}⚡ Antigravity Quota Status${ANSI_RESET}`);
        lines.push(separator);
        
        // Header Row
        // Icon column is empty in header (3 chars)
        lines.push(
          `${ANSI_DIM}   ` +
          `${HEADER_MODEL.padEnd(maxNameLen)}${GAP}` + 
          `${HEADER_USAGE.padEnd(USAGE_COL_WIDTH)}${GAP}` +
          `${HEADER_RESET.padStart(maxResetLen)}${ANSI_RESET}` // Right align reset time
        );
        lines.push(separator);

        const renderGroup = (groupName: string, models: ModelDisplay[]) => {
          if (models.length === 0) return;
          
          for (const m of models) {
            const bar = getProgressBar(m.remainingPercent, 10);
            
            // Color percent
            let pctColor = ANSI_GREEN;
            if (m.remainingPercent <= 10) pctColor = ANSI_RED;
            else if (m.remainingPercent <= 30) pctColor = ANSI_YELLOW;
            
            const pctText = `${pctColor}${m.remainingPercent.toString().padStart(3)}%${ANSI_RESET}`;
            
            const usageContent = `${bar} ${pctText}`;
            
            // Reset time color
            let resetColor = ANSI_DIM;
            if (m.resetTime !== "-" && m.resetTime !== "Ready") resetColor = ANSI_BLUE;
            
            // Usage column needs manual padding because it contains ANSI codes
            // Visual length is fixed at 15 chars: 10 (bar) + 1 (space) + 4 (percent)
            // USAGE_COL_WIDTH is 15. So padding is 0.
            
            lines.push(
              `${m.icon} ` +
              `${m.name.padEnd(maxNameLen)}${GAP}` +
              `${usageContent}${GAP}` +
              `${resetColor}${m.resetTime.padStart(maxResetLen)}${ANSI_RESET}`
            );
          }
        };

        renderGroup("Claude", groups["Claude"]);
        if (groups["Claude"].length && groups["Gemini"].length) lines.push(""); // Spacer
        renderGroup("Gemini", groups["Gemini"]);
        if ((groups["Claude"].length || groups["Gemini"].length) && groups["Other"].length) lines.push(""); // Spacer
        renderGroup("Other", groups["Other"]);

        lines.push(separator);
        
        const message = lines.join("\n");
        ctx.ui.notify(message, "info");
        
      } catch (err) {
        ctx.ui.notify(`Error checking quota: ${err}`, "error");
      }
    },
  });
}
