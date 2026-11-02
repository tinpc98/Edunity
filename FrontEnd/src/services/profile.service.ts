import { apiClient } from "../api/apiClient";
import { useAuthStore } from "../stores/auth.store";
import type { 
  Profile, 
  UpdateProfilePayload,
  ChangePasswordPayload 
} from "../types/profile";

export class ProfileService {
  async getMyProfile(): Promise<Profile> {
    return apiClient<Profile>("/me/profile", { method: "GET" });
  }

  async updateMyProfile(payload: UpdateProfilePayload): Promise<Profile> {
    return apiClient<Profile>("/me/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async updateAvatar(file: File): Promise<{ avatarUrl: string }> {
    const formData = new FormData();
    formData.append("file", file);
    
    // Note: apiClient uses Content-Type application/json by default.
    // We need to override it for multipart/form-data. Axios usually handles this if we pass FormData,
    // but let's be explicit and let Axios remove Content-Type to set boundary correctly.
    return apiClient<{ avatarUrl: string }>("/me/avatar", {
      method: "POST",
      body: formData,
      headers: {
        // Omitting Content-Type allows fetch to set it with the boundary for FormData
      }
    });
  }

  async changePassword(payload: ChangePasswordPayload): Promise<{ changed: boolean }> {
    const data = await apiClient<{ changed: boolean; accessToken: string; refreshToken: string }>("/me/password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // The change ends every session, including this one's old tokens: keep this device signed in with the new ones
    useAuthStore.getState().setTokens(data.accessToken, data.refreshToken);
    return { changed: data.changed };
  }
}

export const profileService = new ProfileService();
