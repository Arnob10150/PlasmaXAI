"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import type { CreateCaseState } from "@/app/(workspace)/new-case/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const initialState: CreateCaseState = {
  error: null,
};

const NEW_CASE_SESSION_KEY = "plasmaxai-new-case-draft";
const NEW_CASE_BACKUP_KEY = "plasmaxai-new-case-draft-backup";
const PREPARED_IMAGE_STORAGE_PREFIX = "plasmaxai-upload:";
const MAX_PREPARED_IMAGE_DIMENSION = 320;
const PREPARED_IMAGE_QUALITY = 0.88;
const INFERENCE_WARMUP_INTERVAL_MS = 45_000;
const INFERENCE_WARMUP_URL = "/api/inference/health?warm=1";

interface NewCaseDraftState {
  clientCaseId: string;
  browserImageKey: string;
  patientCode: string;
  patientName: string;
  caseTitle: string;
  sex: string;
  dateOfBirth: string;
  clinicalNote: string;
  imageReference: string;
  preparedImageDataUrl: string;
  preparedImageFileName: string;
  preparedImageMimeType: string;
}

interface PersistedNewCaseDraftState extends Omit<NewCaseDraftState, "preparedImageDataUrl"> {}

interface StoredPreparedImageAsset {
  fileName: string;
  mimeType: string;
  dataUrl: string;
  savedAt: number;
}

function createDraftIdentifiers() {
  const nextId = `case-${Math.random().toString(36).slice(2, 10)}`;
  return {
    clientCaseId: nextId,
    browserImageKey: `browser-storage://${nextId}`,
  };
}

function createEmptyDraftState(): NewCaseDraftState {
  return {
    ...createDraftIdentifiers(),
    patientCode: "",
    patientName: "",
    caseTitle: "",
    sex: "",
    dateOfBirth: "",
    clinicalNote: "",
    imageReference: "",
    preparedImageDataUrl: "",
    preparedImageFileName: "",
    preparedImageMimeType: "",
  };
}

function getPreparedImageStorageKey(clientCaseId: string) {
  return clientCaseId ? `${PREPARED_IMAGE_STORAGE_PREFIX}${clientCaseId}` : "";
}

function replaceFileExtension(fileName: string, nextExtension: string) {
  const base = fileName.replace(/\.[^.]+$/, "");
  return `${base || "prepared-image"}${nextExtension}`;
}

function readStoredJson<T>(storage: Storage, key: string) {
  const raw = storage.getItem(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readPreparedImageAsset(storageKey: string) {
  if (!storageKey) {
    return null;
  }

  try {
    const stored = readStoredJson<StoredPreparedImageAsset>(window.localStorage, storageKey);
    if (!stored?.dataUrl) {
      return null;
    }

    return stored;
  } catch {
    return null;
  }
}

function writePreparedImageAsset(storageKey: string, asset: StoredPreparedImageAsset) {
  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(asset));
  } catch {
    // Ignore storage quota issues; the in-memory draft can still submit.
  }
}

function clearPreparedImageAsset(storageKey: string) {
  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function persistDraftState(draft: NewCaseDraftState) {
  const { preparedImageDataUrl: _preparedImageDataUrl, ...safeDraft } = draft;
  const serialized = JSON.stringify(safeDraft);

  try {
    window.sessionStorage.setItem(NEW_CASE_SESSION_KEY, serialized);
  } catch {
    // Session persistence is opportunistic.
  }

  try {
    window.localStorage.setItem(NEW_CASE_BACKUP_KEY, serialized);
  } catch {
    // Backup persistence is opportunistic.
  }
}

function restoreDraftState() {
  const storedDraft =
    readStoredJson<PersistedNewCaseDraftState>(window.sessionStorage, NEW_CASE_SESSION_KEY) ??
    readStoredJson<PersistedNewCaseDraftState>(window.localStorage, NEW_CASE_BACKUP_KEY);

  if (!storedDraft) {
    return createEmptyDraftState();
  }

  const identifiers =
    storedDraft.clientCaseId && storedDraft.browserImageKey
      ? {
          clientCaseId: storedDraft.clientCaseId,
          browserImageKey: storedDraft.browserImageKey,
        }
      : createDraftIdentifiers();

  const preparedImageAsset = readPreparedImageAsset(getPreparedImageStorageKey(identifiers.clientCaseId));

  return {
    ...createEmptyDraftState(),
    ...storedDraft,
    ...identifiers,
    preparedImageDataUrl: preparedImageAsset?.dataUrl ?? "",
    preparedImageFileName:
      preparedImageAsset?.fileName ?? storedDraft.preparedImageFileName ?? "",
    preparedImageMimeType:
      preparedImageAsset?.mimeType ?? storedDraft.preparedImageMimeType ?? "",
  };
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" type="submit" disabled={pending}>
      <i className={`bi ${pending ? "bi-arrow-repeat" : "bi-play-circle-fill"} text-base`} aria-hidden="true" />
      {pending ? "Creating case..." : "Start analysis workspace"}
    </Button>
  );
}

function AnalysisLaunchOverlay() {
  const { pending } = useFormStatus();
  const spinnerDots = Array.from({ length: 8 });

  if (!pending) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/72 px-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-slate-950 px-6 py-8 text-white shadow-2xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <i className="bi bi-cpu-fill text-3xl text-blue-300" aria-hidden="true" />
        </div>
        <p className="mt-6 text-center text-xs font-medium uppercase tracking-[0.25em] text-blue-200">
          PlasmaXAI
        </p>
        <h3 className="mt-3 text-center text-2xl font-semibold">Building analysis workspace</h3>
        <p className="mt-3 text-center text-sm leading-7 text-slate-300">
          Preparing the uploaded microscopy image, contacting the inference service, and assembling the review workspace for this case.
        </p>
        <div className="mt-6 flex justify-center" aria-hidden="true">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 animate-spin [animation-duration:1.15s]">
              {spinnerDots.map((_, index) => (
                <span
                  key={index}
                  className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full bg-blue-300 shadow-[0_0_14px_rgba(125,211,252,0.35)]"
                  style={{
                    opacity: 0.2 + index * 0.09,
                    transform: `translate(-50%, -50%) rotate(${index * 45}deg) translateY(-23px) scale(${0.72 + index * 0.04})`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-3 text-sm text-slate-300 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">Image intake</div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">Model inference</div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">Workspace assembly</div>
        </div>
      </div>
    </div>
  );
}

export function NewCaseForm({
  action,
}: {
  action: (state: CreateCaseState, formData: FormData) => Promise<CreateCaseState>;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [draft, setDraft] = useState<NewCaseDraftState>(createEmptyDraftState);
  const [isImagePrepared, setIsImagePrepared] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const warmupStateRef = useRef<{
    inFlight: Promise<void> | null;
    lastAttemptAt: number;
  }>({
    inFlight: null,
    lastAttemptAt: 0,
  });

  function updateDraft(nextDraft: NewCaseDraftState | ((current: NewCaseDraftState) => NewCaseDraftState)) {
    setDraft((current) => {
      const resolved = typeof nextDraft === "function" ? nextDraft(current) : nextDraft;
      persistDraftState(resolved);
      return resolved;
    });
  }

  useEffect(() => {
    try {
      const restoredDraft = restoreDraftState();
      setDraft(restoredDraft);
      persistDraftState(restoredDraft);
    } catch {
      const emptyDraft = createEmptyDraftState();
      setDraft(emptyDraft);
      persistDraftState(emptyDraft);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  const hiddenStorageKey = useMemo(
    () => getPreparedImageStorageKey(draft.clientCaseId),
    [draft.clientCaseId],
  );

  function warmInferenceService(force = false) {
    if (!isHydrated) {
      return Promise.resolve();
    }

    const now = Date.now();
    if (
      !force &&
      warmupStateRef.current.lastAttemptAt &&
      now - warmupStateRef.current.lastAttemptAt < INFERENCE_WARMUP_INTERVAL_MS
    ) {
      return warmupStateRef.current.inFlight ?? Promise.resolve();
    }

    if (warmupStateRef.current.inFlight) {
      return warmupStateRef.current.inFlight;
    }

    warmupStateRef.current.lastAttemptAt = now;
    let request: Promise<void> | null = null;
    request = fetch(INFERENCE_WARMUP_URL, {
      cache: "no-store",
      keepalive: true,
    })
      .then(() => undefined)
      .catch(() => {
        // Warmup is opportunistic; submit still handles real failures.
      })
      .finally(() => {
        if (warmupStateRef.current.inFlight === request) {
          warmupStateRef.current.inFlight = null;
        }
      });

    warmupStateRef.current.inFlight = request;
    return request;
  }

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    void warmInferenceService(true);

    const handleFocus = () => {
      void warmInferenceService();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void warmInferenceService();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isHydrated]);

  async function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string" && reader.result) {
          resolve(reader.result);
          return;
        }

        reject(new Error("Unable to read image file."));
      };
      reader.onerror = () => reject(new Error("Unable to read image file."));
      reader.readAsDataURL(file);
    });
  }

  async function decodeImageDataUrl(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new window.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Unable to decode image."));
      nextImage.src = dataUrl;
    });
  }

  async function optimizeSubmittedImage(file: File, fileDataUrl: string): Promise<StoredPreparedImageAsset> {
    const image = await decodeImageDataUrl(fileDataUrl);
    const currentLargestDimension = Math.max(image.width, image.height, 1);

    if (currentLargestDimension <= MAX_PREPARED_IMAGE_DIMENSION) {
      return {
        fileName: file.name,
        mimeType: file.type || "image/jpeg",
        dataUrl: fileDataUrl,
        savedAt: Date.now(),
      };
    }

    const scale = Math.min(1, MAX_PREPARED_IMAGE_DIMENSION / currentLargestDimension);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      return {
        fileName: file.name,
        mimeType: file.type || "image/jpeg",
        dataUrl: fileDataUrl,
        savedAt: Date.now(),
      };
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    return {
      fileName: replaceFileExtension(file.name, ".jpg"),
      mimeType: "image/jpeg",
      dataUrl: canvas.toDataURL("image/jpeg", PREPARED_IMAGE_QUALITY),
      savedAt: Date.now(),
    };
  }

  async function handleImageSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !hiddenStorageKey) {
      setIsImagePrepared(true);
      clearPreparedImageAsset(hiddenStorageKey);
      updateDraft((current) => ({
        ...current,
        preparedImageDataUrl: "",
        preparedImageFileName: "",
        preparedImageMimeType: "",
      }));
      return;
    }

    setIsImagePrepared(false);
    void warmInferenceService(true);
    let restoredAsset: StoredPreparedImageAsset | null = null;

    try {
      const originalDataUrl = await readFileAsDataUrl(file);
      restoredAsset = {
        fileName: file.name,
        mimeType: file.type || "image/jpeg",
        dataUrl: originalDataUrl,
        savedAt: Date.now(),
      };
      writePreparedImageAsset(hiddenStorageKey, restoredAsset);
      updateDraft((current) => ({
        ...current,
        preparedImageDataUrl: restoredAsset?.dataUrl ?? "",
        preparedImageFileName: restoredAsset?.fileName ?? "",
        preparedImageMimeType: restoredAsset?.mimeType ?? "",
      }));

      const optimizedAsset = await optimizeSubmittedImage(file, originalDataUrl);
      restoredAsset = optimizedAsset;
      writePreparedImageAsset(hiddenStorageKey, optimizedAsset);
      updateDraft((current) => ({
        ...current,
        preparedImageDataUrl: optimizedAsset.dataUrl,
        preparedImageFileName: optimizedAsset.fileName,
        preparedImageMimeType: optimizedAsset.mimeType,
      }));
    } catch {
      if (!restoredAsset) {
        clearPreparedImageAsset(hiddenStorageKey);
        updateDraft((current) => ({
          ...current,
          preparedImageDataUrl: "",
          preparedImageFileName: "",
          preparedImageMimeType: "",
        }));
      }
    } finally {
      setIsImagePrepared(Boolean(restoredAsset));
    }
  }

  return (
    <form
      action={formAction}
      className="space-y-6"
      onSubmitCapture={() => {
        void warmInferenceService(true);
      }}
    >
      <AnalysisLaunchOverlay />
      <input type="hidden" name="clientCaseId" value={draft.clientCaseId} />
      <input type="hidden" name="browserImageKey" value={draft.browserImageKey} />
      <input type="hidden" name="preparedImageDataUrl" value={draft.preparedImageDataUrl} />
      <input type="hidden" name="preparedImageFileName" value={draft.preparedImageFileName} />
      <input type="hidden" name="preparedImageMimeType" value={draft.preparedImageMimeType} />
      <div className="grid gap-5 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="rounded-[30px] border border-dashed border-blue-300 bg-[linear-gradient(180deg,#eff6ff,#f8fbff)] p-6 text-center sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-blue-700 shadow-sm">
            <i className="bi bi-cloud-arrow-up-fill text-3xl" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold text-slate-950">Upload microscopy image</h2>
          <p className="mt-3 text-slate-600">
            Upload a microscopy file for analysis, or add a manual image reference when the image is already available on disk.
          </p>
          <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5 text-left shadow-sm">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-images text-base text-blue-700" aria-hidden="true" />
              Microscopy image file
            </label>
            <input
              accept="image/*"
              className="block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 file:mr-4 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
              onChange={handleImageSelection}
              type="file"
            />
            <p className="mt-3 text-xs leading-5 text-slate-500">
              PNG, JPG, or JPEG images are supported. Manual references are useful for previously archived case images.
            </p>
            <label className="mt-5 mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <i className="bi bi-link-45deg text-base text-blue-700" aria-hidden="true" />
              Manual image reference
            </label>
            <input
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
              name="imageReference"
              placeholder="Optional legacy path or storage reference"
              value={draft.imageReference}
              onChange={(event) =>
                updateDraft((current) => ({ ...current, imageReference: event.target.value }))
              }
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="info">Microscopy upload</Badge>
              <Badge variant="neutral">Case-ready intake</Badge>
              {!isImagePrepared ? <Badge variant="warning">Preparing uploaded image</Badge> : null}
              {draft.preparedImageDataUrl ? <Badge variant="success">Prepared upload kept in session</Badge> : null}
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <i className="bi bi-person-vcard text-base text-blue-700" aria-hidden="true" />
                  Patient code
                </label>
                <input
                  name="patientCode"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
                  placeholder="PT-00124"
                  value={draft.patientCode}
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, patientCode: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <i className="bi bi-person-fill text-base text-blue-700" aria-hidden="true" />
                  Patient name
                </label>
                <input
                  name="patientName"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
                  placeholder="Optional patient name"
                  value={draft.patientName}
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, patientName: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <i className="bi bi-file-earmark-medical text-base text-blue-700" aria-hidden="true" />
                  Case title
                </label>
                <input
                  name="caseTitle"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
                  placeholder="Follow-up marrow smear"
                  value={draft.caseTitle}
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, caseTitle: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <i className="bi bi-gender-ambiguous text-base text-blue-700" aria-hidden="true" />
                  Sex
                </label>
                <select
                  name="sex"
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
                  value={draft.sex}
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, sex: event.target.value }))
                  }
                >
                  <option value="">Select</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <i className="bi bi-calendar3 text-base text-blue-700" aria-hidden="true" />
                Date of birth
              </label>
              <input
                name="dateOfBirth"
                type="date"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4"
                value={draft.dateOfBirth}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, dateOfBirth: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                <i className="bi bi-journal-text text-base text-blue-700" aria-hidden="true" />
                Clinical note
              </label>
              <textarea
                name="clinicalNote"
                className="min-h-32 w-full rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3"
                placeholder="Add context for the reviewing doctor..."
                value={draft.clinicalNote}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, clinicalNote: event.target.value }))
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="info">Patient-linked case</Badge>
              <Badge variant="neutral">Clinical note captured</Badge>
            </div>
            {state.error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <i className="bi bi-exclamation-triangle-fill mr-2" aria-hidden="true" />
                {state.error}
              </div>
            ) : null}
            {!isImagePrepared ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <i className="bi bi-hourglass-split mr-2" aria-hidden="true" />
                Please wait a moment while the uploaded image is prepared for the analysis workspace.
              </div>
            ) : null}
            <div className={!isImagePrepared || !isHydrated ? "pointer-events-none opacity-60" : ""}>
              <SubmitButton />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
