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
      limit?: string;              // e.g. "1000" (sometimes present)
      resetTime?: string;          // ISO timestamp
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

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const CLOUDCODE_BASE_URL = "https://daily-cloudcode-pa.sandbox.googleapis.com";
const FETCH_TIMEOUT_MS = 15_000;

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
// Formatting
// ═══════════════════════════════════════════════════════════════════════════

function getUsageColor(percentUsed: number): string {
  if (percentUsed >= 90) return "\x1b[31m"; // Red
  if (percentUsed >= 70) return "\x1b[33m"; // Yellow
  return "\x1b[32m"; // Green
}

function getProgressBar(percentRemaining: number, width: number = 10): string {
  const filled = Math.round((percentRemaining / 100) * width);
  const empty = width - filled;
  const chars = "━"; // or "█"
  const emptyChar = "┄"; // or "░" or "·"
  
  // Color the bar based on remaining (inverse of used)
  // Low remaining = Red, High remaining = Green
  let color = "\x1b[32m"; // Green
  if (percentRemaining <= 10) color = "\x1b[31m"; // Red
  else if (percentRemaining <= 30) color = "\x1b[33m"; // Yellow
  
  return `${color}${"━".repeat(filled)}${"┄".repeat(empty)}${ANSI_RESET}`;
}

function getModelIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("claude")) return "🧠"; // or 🎭
  if (lower.includes("gpt")) return "🤖";
  if (lower.includes("image")) return "🎨";
  if (lower.includes("gemini")) return "✨";
  return "⚡";
}

const ANSI_RESET = "\x1b[0m";
const ANSI_BOLD = "\x1b[1m";
const ANSI_DIM = "\x1b[2m";

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

        // Build list of models
        const models = Object.values(data.models)
          // Filter out internal models and those without display names
          .filter((m: any) => !m.isInternal && m.displayName)
          // Filter out unwanted Gemini 2.5 models
          .filter((m: any) => !m.displayName.includes("Gemini 2.5"))
          .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));

        if (models.length === 0) {
          ctx.ui.notify("No quota information available.", "warning");
          return;
        }

        const lines: string[] = [];
        
        // Header
        lines.push(`${ANSI_BOLD}⚡ Antigravity Quota Status${ANSI_RESET}`);
        lines.push(`${ANSI_DIM}──────────────────────────────────────────${ANSI_RESET}`);

        // Find max name length for padding
        const maxNameLen = Math.max(...models.map(m => (m.displayName || "").length));
        
        for (const m of models) {
          const name = m.displayName || "Unknown";
          const remaining = m.quotaInfo?.remainingFraction ?? 0;
          const remainingPercent = Math.round(remaining * 100);
          
          const icon = getModelIcon(name);
          const paddedName = name.padEnd(maxNameLen);
          const bar = getProgressBar(remainingPercent, 10);
          
          // Color the percentage text
          let pctColor = "\x1b[32m";
          if (remainingPercent <= 10) pctColor = "\x1b[31m";
          else if (remainingPercent <= 30) pctColor = "\x1b[33m";
          
          const pctText = `${pctColor}${remainingPercent}%${ANSI_RESET}`;
          
          lines.push(`${icon} ${paddedName}  ${bar}  ${pctText}`);
        }
        lines.push(`${ANSI_DIM}──────────────────────────────────────────${ANSI_RESET}`);
        
        // Join with newlines
        const message = lines.join("\n");
        
        ctx.ui.notify(message, "info");
        
      } catch (err) {
        ctx.ui.notify(`Error checking quota: ${err}`, "error");
      }
    },
  });

  // Also register 'antigravity' alias
  pi.registerCommand("antigravity", {
    description: "Alias for /quota",
    handler: async (args, ctx) => {
      // @ts-ignore
      await pi.commands.get("quota")?.handler(args, ctx);
    }
  });
}
