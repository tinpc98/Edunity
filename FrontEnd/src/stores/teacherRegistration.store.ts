import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TeacherRegistrationDraft } from "../types/auth";

interface TeacherRegistrationState {
  draft: TeacherRegistrationDraft | null;
  setDraft: (draft: TeacherRegistrationDraft) => void;
  clearDraft: () => void;
}

// sessionStorage: survives a reload between step 1 and step 2, but not a new browser session
export const useTeacherRegistrationStore = create<TeacherRegistrationState>()(
  persist(
    (set) => ({
      draft: null,
      setDraft: (draft) => set({ draft }),
      clearDraft: () => set({ draft: null }),
    }),
    {
      name: "edunity-teacher-registration",
      storage: {
        getItem: (name) => {
          try {
            const raw = sessionStorage.getItem(name);
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            sessionStorage.setItem(name, JSON.stringify(value));
          } catch {
            // storage unavailable: the draft just won't survive a reload
          }
        },
        removeItem: (name) => {
          try {
            sessionStorage.removeItem(name);
          } catch {
            // ignore
          }
        },
      },
    },
  ),
);
