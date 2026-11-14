import type { Dayjs } from "dayjs";
import type { SubmitIdentity } from "../types/teacherVerification";

export interface IdentityFormValues {
  fullName: string;
  idNumber: string;
  dateOfBirth: Dayjs;
  address: string;
  issueDate?: Dayjs | null;
  expiryDate?: Dayjs | null;
}

export const toIdentityPayload = (values: IdentityFormValues): SubmitIdentity => ({
  fullName: values.fullName.trim(),
  idNumber: values.idNumber.trim(),
  dateOfBirth: values.dateOfBirth.format("YYYY-MM-DD"),
  address: values.address.trim(),
  issueDate: values.issueDate ? values.issueDate.format("YYYY-MM-DD") : undefined,
  expiryDate: values.expiryDate ? values.expiryDate.format("YYYY-MM-DD") : undefined,
});
