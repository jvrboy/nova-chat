import { randomBytes, scryptSync } from "node:crypto";

const password = process.env.NOVA_PASSWORD_INPUT;
if (!password) {
  console.error("Set NOVA_PASSWORD_INPUT in your shell; the password is never written to the repository.");
  process.exit(1);
}
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 32).toString("hex");
console.log(`${salt}:${hash}`);
console.error("Set the printed value as Vercel NOVA_ACCESS_PASSWORD_HASH, then remove NOVA_PASSWORD_INPUT from your shell.");
