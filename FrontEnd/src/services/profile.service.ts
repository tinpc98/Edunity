import type { StudentProfile, UpdateStudentProfilePayload } from "../types/profile";
import type { AuthUser } from "../types/auth";

const PROFILE_STORAGE_KEY = "edunity_mock_profile";

function getStoredProfile(): StudentProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredProfile(profile: StudentProfile): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch (error) {
    console.error("Failed to save profile to localStorage:", error);
  }
}

export class ProfileService {
  async getStudentProfile(user: AuthUser): Promise<StudentProfile> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    const stored = getStoredProfile();
    if (stored && stored.id === user.userId) {
      return stored;
    }

    // Default mock profile based on current auth user
    const defaultProfile: StudentProfile = {
      id: user.userId,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      updatedAt: new Date().toISOString(),
    };
    saveStoredProfile(defaultProfile);
    return defaultProfile;
  }

  async updateStudentProfile(
    userId: string,
    payload: UpdateStudentProfilePayload
  ): Promise<StudentProfile> {
    await new Promise((resolve) => setTimeout(resolve, 500));

    const stored = getStoredProfile();
    if (!stored || stored.id !== userId) {
      throw new Error("Profile not found");
    }

    const updatedProfile: StudentProfile = {
      ...stored,
      ...payload,
      updatedAt: new Date().toISOString(),
    };
    saveStoredProfile(updatedProfile);
    return updatedProfile;
  }

  async updateAvatar(userId: string, file: File): Promise<{ avatarUrl: string }> {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const stored = getStoredProfile();
    if (!stored || stored.id !== userId) {
      throw new Error("Profile not found");
    }

    // Convert file to object URL to mock upload behavior
    const avatarUrl = URL.createObjectURL(file);
    
    const updatedProfile: StudentProfile = {
      ...stored,
      avatarUrl,
      updatedAt: new Date().toISOString(),
    };
    saveStoredProfile(updatedProfile);
    return { avatarUrl };
  }
}

export const profileService = new ProfileService();
