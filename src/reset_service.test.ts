import assert from "node:assert/strict";
import { sendResetLink } from "./reset_service.ts";

const calls: Array<{ path: string; body: any }> = [];
const client = { post: async <T>(path: string, body: unknown) => {
  calls.push({ path, body });
  return (path.includes("reset_request") ? { reset_token: "abc123" } : { message_id: "msg-7" }) as T;
} };

const result = await sendResetLink({ email: "founder@example.com", returnTo: "https://creator.example/reset" }, client as any);
assert.equal(result.resetLink, "https://creator.example/reset?token=abc123");
assert.equal(calls[0].path, "/v1/auth/password/reset_request");
assert.equal(calls[1].path, "/v1/email/send");
assert.equal(calls[1].body.to, "founder@example.com");
assert.match(calls[1].body.body, /token=abc123/);
console.log("reset decision test passed");
