import { Specialty } from "../types.js";

export interface DoctorProfile {
  id: string;
  name: string;
  specialty: Specialty;
  createdAt: string;
}
