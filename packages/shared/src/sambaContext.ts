export type SambaDeploymentRole = "overview" | "install" | "share" | "client" | "ad-dc";

export interface SambaContextSnapshot {
  role?: SambaDeploymentRole;
  lastValidRequest?: string;
  updatedAt?: number;
}

export interface SambaFollowUpResult {
  text: string;
  contextUsed: boolean;
  snapshot: SambaContextSnapshot;
}

export class SambaConversationContext {
  private state: SambaContextSnapshot = {};

  constructor(private readonly ttlMs = 90_000) {}

  getSnapshot(timestamp = Date.now()): SambaContextSnapshot {
    if (this.state.updatedAt === undefined || timestamp - this.state.updatedAt > this.ttlMs) return {};
    return { ...this.state };
  }

  accept(text: string, timestamp = Date.now()): SambaContextSnapshot {
    const role = detectSambaDeploymentRole(text);
    if (!role) return this.getSnapshot(timestamp);
    this.state = { role, lastValidRequest: text.trim(), updatedAt: timestamp };
    return { ...this.state };
  }

  enrichFollowUp(text: string, timestamp = Date.now()): SambaFollowUpResult {
    const snapshot = this.getSnapshot(timestamp);
    const normalized = normalize(text);
    const punctuation = /[?.!]$/.test(text.trim()) ? text.trim().slice(-1) : "?";

    if (snapshot.role === "install" && /^(?:а\s+)?как\s+запустить$/.test(normalized)) {
      return { text: `Как запустить Samba после установки${punctuation}`, contextUsed: true, snapshot };
    }
    if (snapshot.role === "share" && /^(?:а\s+)?как\s+добавить\s+пользователя$/.test(normalized)) {
      return { text: `Как добавить пользователя Samba share${punctuation}`, contextUsed: true, snapshot };
    }
    if (snapshot.role === "ad-dc" && /^(?:а\s+)?как\s+проверить\s+репликацию$/.test(normalized)) {
      return { text: `Как проверить репликацию Samba AD${punctuation}`, contextUsed: true, snapshot };
    }

    return { text, contextUsed: false, snapshot };
  }

  clear(): void {
    this.state = {};
  }
}

export function detectSambaDeploymentRole(text: string): SambaDeploymentRole | undefined {
  const normalized = normalize(text);
  if (/(?:танец|музык|фестивал|samba\s+de\s+amigo)/.test(normalized)) return undefined;
  if (!/\b(?:samba|smb|smbclient|cifs)\b/.test(normalized)) return undefined;
  if (/\bsamba\s+(?:ad|active directory|domain controller)|\bad\s+dc\b|контроллер\s+домена/.test(normalized)) return "ad-dc";
  if (/smbclient|mount\s+cifs|подключ|смонт|windows\s+share|сетевую\s+папку/.test(normalized)) return "client";
  if (/\bshare\b|шар[ауы]|smb\.conf|smbpasswd|общую\s+папку|расшарить/.test(normalized)) return "share";
  if (/установ|постав|после\s+установки|запустить\s+samba/.test(normalized)) return "install";
  return "overview";
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
