import { access, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { demoDoctors, type DemoDoctor } from "@/lib/demo/mock-data";
import { shouldUseFilesystemLocalStore } from "@/lib/supabase/config";

export interface LocalDoctorProfile extends DemoDoctor {
  organizationName: string;
}

const LOCAL_DATA_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), ".local-data");
const LOCAL_DOCTORS_FILE = path.join(LOCAL_DATA_DIR, "doctors.json");

function seedDoctors(): LocalDoctorProfile[] {
  return demoDoctors.map((doctor) => ({
    ...doctor,
    organizationName: "PlasmaXAI Clinical Lab",
  }));
}

async function ensureDoctorStore() {
  if (!shouldUseFilesystemLocalStore()) {
    return;
  }

  await mkdir(LOCAL_DATA_DIR, { recursive: true });

  try {
    await access(LOCAL_DOCTORS_FILE);
  } catch {
    await writeFile(
      LOCAL_DOCTORS_FILE,
      JSON.stringify(seedDoctors(), null, 2),
      "utf-8",
    );
  }
}

async function readLocalDoctors() {
  if (!shouldUseFilesystemLocalStore()) {
    return seedDoctors();
  }

  await ensureDoctorStore();
  const raw = await readFile(LOCAL_DOCTORS_FILE, "utf-8");
  return JSON.parse(raw) as LocalDoctorProfile[];
}

async function writeLocalDoctors(doctors: LocalDoctorProfile[]) {
  if (!shouldUseFilesystemLocalStore()) {
    return;
  }

  await ensureDoctorStore();
  await writeFile(LOCAL_DOCTORS_FILE, JSON.stringify(doctors, null, 2), "utf-8");
}

export async function getLocalDoctorByEmail(email: string | null | undefined) {
  const doctors = await readLocalDoctors();
  if (!email) {
    return doctors[0] ?? seedDoctors()[0];
  }

  return (
    doctors.find((doctor) => doctor.email.toLowerCase() === email.toLowerCase()) ??
    doctors[0] ??
    seedDoctors()[0]
  );
}

export async function updateLocalDoctorProfile(
  email: string,
  updates: {
    fullName: string;
    specialization: string;
    organizationName: string;
  },
) {
  const doctors = await readLocalDoctors();
  const current = doctors.find((doctor) => doctor.email.toLowerCase() === email.toLowerCase());

  if (!current) {
    throw new Error("Doctor account was not found.");
  }

  const nextDoctor: LocalDoctorProfile = {
    ...current,
    fullName: updates.fullName.trim() || current.fullName,
    specialization: updates.specialization.trim() || current.specialization,
    organizationName: updates.organizationName.trim() || current.organizationName,
  };

  await writeLocalDoctors(
    doctors.map((doctor) =>
      doctor.email.toLowerCase() === email.toLowerCase() ? nextDoctor : doctor,
    ),
  );

  return nextDoctor;
}
