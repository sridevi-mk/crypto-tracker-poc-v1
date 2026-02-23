import { getUserAuthCredentials } from "@/lib/user-store";
import { verifyPassword } from "@/lib/password";

function getAuthUser() {
  return process.env.AUTH_USERNAME || "admin";
}

function getAuthPassword() {
  return process.env.AUTH_PASSWORD || "";
}

export async function validateCredentials(username: string, password: string) {
  const envUser = getAuthUser();
  const envPass = getAuthPassword();
  if (envPass && username === envUser && password === envPass) {
    return true;
  }

  const creds = await getUserAuthCredentials(username);
  if (!creds) return false;
  return verifyPassword(password, creds.passwordSalt, creds.passwordHash);
}
