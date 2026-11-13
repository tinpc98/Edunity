import { create } from "zustand";
import type { TeacherRegistrationDraft } from "../types/auth";

interface TeacherRegistrationState {
  draft: TeacherRegistrationDraft | null;
  setDraft: (draft: TeacherRegistrationDraft) => void;
  clearDraft: () => void;
}

// Keep the registration-to-verification handoff in memory instead of browser storage.
export const useTeacherRegistrationStore = create<TeacherRegistrationState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
