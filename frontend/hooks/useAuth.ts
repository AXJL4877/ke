"use client";

import { useAuthStore } from "@/stores/useAuthStore";
import { apiClient } from "@/lib/api-client";

export function useAuth() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);

  async function login(username: string, password: string) {
    const data = await apiClient.post<{
      access_token: string;
      user: { id: string; username: string };
    }>("/api/auth/login", { username, password }, { auth: false });
    setAuth(data.access_token, data.user);
    return data;
  }

  return {
    token,
    user,
    isAuthenticated: Boolean(token),
    login,
    logout,
  };
}
