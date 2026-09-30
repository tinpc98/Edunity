export interface StudentProfile {
  id: string;
  fullName: string;
  email: string;
  dateOfBirth?: string;
  avatarUrl?: string;
  bio?: string;
  updatedAt?: string;
}

export interface UpdateStudentProfilePayload {
  fullName: string;
  dateOfBirth?: string;
  bio?: string;
}
