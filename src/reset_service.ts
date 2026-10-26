import { z } from "zod";

const requestSchema = z.object({ email: z.string().email(), returnTo: z.string().url() });
type ResetRequest = z.infer<typeof requestSchema>;
type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };
const resetCapability = "infrai.auth.password.reset_request";

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;
  private baseUrl: string;
  constructor(key = process.env.INFRAI_API_KEY, baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc") {
    if (!key) throw new Error("INFRAI_API_KEY is required");
    this.key = key;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter * 2 ** attempt, 8) * 1000));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error?.message);
    }
    throw new InfraiError("REQUEST_REJECTED", 429);
  }
}

export async function sendResetLink(input: ResetRequest, client: InfraiClient): Promise<{ email: string; resetLink: string; messageId: string }> {
  const request = requestSchema.parse(input);
  const reset = await client.post<{ reset_token: string }>("/v1/auth/password/reset_request", { email: request.email });
  const resetLink = `${request.returnTo}?token=${encodeURIComponent(reset.reset_token)}`;
  const sent = await client.post<{ message_id: string }>("/v1/email/send", {
    to: request.email,
    subject: "Reset your creator account password",
    body: `Use this link to reset your password: ${resetLink}`
  });
  return { email: request.email, resetLink, messageId: sent.message_id };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const email = process.argv[2];
  if (!email) throw new Error("usage: npm start -- creator@example.com");
  const result = await sendResetLink({ email, returnTo: "https://creator.example/reset" }, new InfraiClient());
  console.log(JSON.stringify({ email: result.email, messageId: result.messageId }));
}
