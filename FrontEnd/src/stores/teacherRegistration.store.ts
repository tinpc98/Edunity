import { create } from "zustand";
import type {
  QualificationDocument,
  TeacherRegisterResponse,
  TeacherVerificationStatus,
} from "../types/auth";

interface TeacherRegistrationState {
  registration: TeacherRegisterResponse | null;
  qualification: QualificationDocument | null;
  verificationStatus: TeacherVerificationStatus | null;
  setRegistration: (registration: TeacherRegisterResponse) => void;
  setQualification: (qualification: QualificationDocument, status: "PENDING") => void;
  clearRegistration: () => void;
}

export const useTeacherRegistrationStore = create<TeacherRegistrationState>((set) => ({
  registration: null,
  qualification: null,
  verificationStatus: null,
  setRegistration: (registration) => set({
    registration,
    qualification: null,
    verificationStatus: registration.verificationStatus,
  }),
  setQualification: (qualification, status) => set({ qualification, verificationStatus: status }),
  clearRegistration: () => set({ registration: null, qualification: null, verificationStatus: null }),
}));