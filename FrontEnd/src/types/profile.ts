export interface BaseProfile {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  fullName: string;
  avatarUrl?: string;
}

export interface StudentProfile extends BaseProfile {
  dateOfBirth?: string;
  bio?: string;
}

export interface TeacherProfile extends BaseProfile {
  biography?: string;
  qualificationSummary?: string;
  verificationStatus?: string;
  ratingAverage?: number;
  ratingCount?: number;
}

export interface SponsorProfile extends BaseProfile {
  sponsorType?: string;
  organizationName?: string;
  representativeName?: string;
  description?: string;
}

export type Profile = StudentProfile | TeacherProfile | SponsorProfile;

export interface UpdateStudentProfilePayload {
  fullName?: string;
  dateOfBirth?: string;
  bio?: string;
}

export interface UpdateTeacherProfilePayload {
  fullName?: string;
  biography?: string;
  qualificationSummary?: string;
}

export interface UpdateSponsorProfilePayload {
  fullName?: string;
  sponsorType?: string;
  organizationName?: string;
  representativeName?: string;
  description?: string;
}

export type UpdateProfilePayload = UpdateStudentProfilePayload | UpdateTeacherProfilePayload | UpdateSponsorProfilePayload;

export interface ChangePasswordPayload {
  currentPassword?: string;
  newPassword?: string;
}
