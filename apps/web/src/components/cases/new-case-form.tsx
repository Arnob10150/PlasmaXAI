"use client";

import { useActionState, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import type { CreateCaseState } from "@/app/(workspace)/new-case/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const initialState: CreateCaseState = {
  error: null,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" type="submit" disabled={pending}>
      <i className={`bi ${pending ? "bi-arrow-repeat" : "bi-play-circle-fill"} text-base`} aria-hidden="true" />
      {pending ? "Creating case..." : "Start analysis workspace"}
    </Button>
  );
}

export function NewCaseForm({
  action,
}: {
  action: (state: CreateCaseState, formData: FormData) => Promise<CreateCaseState>;
}) {
  const [state, formAction] = useActionState(action, initialState);
  const [clientCaseId, setClientCaseId] = useState("");
  const [browserImageKey, setBrowserImageKey] = useState("");
  const [isImagePrepared, setIsImagePrepared] = useState(true);
  const [preparedImageDataUrl, setPreparedImageDataUrl] = useState("");
  const [preparedImageFileName, setPreparedImageFileName] = useState("");
  const [preparedImageMimeType, setPreparedImageMimeType] = useState("");

  useEffect(() => {
    const nextId = `case-${Math.random().toString(36).slice(2, 10)}`;
    setClientCaseId(nextId);
    setBrowserImageKey(`browser-storage://${nextId}`);
  }, []);

  const hiddenStorageKey = useMemo(
    () => (clientCaseId ? `plasmaxai-upload:${clientCaseId}` : ""),
    [clientCaseId],
  );

  async function buildPreparedImageDataUrl(file: File) {
    const fileDataUrl = await new Promise<string>((resolve, reject) => {
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

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new window.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Unable to decode image."));
      nextImage.src = fileDataUrl;
    });

    const maxDimension = 512;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height, 1));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      return fileDataUrl;
    }

    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.9);
  }

  async function handleImageSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file || !hiddenStorageKey) {
      setIsImagePrepared(true);
      setPreparedImageDataUrl("");
      setPreparedImageFileName("");
      setPreparedImageMimeType("");
      return;
    }

    setIsImagePrepared(false);

    try {
      const result = await buildPreparedImageDataUrl(file);
      window.localStorage.setItem(
        hiddenStorageKey,
        JSON.stringify({
          fileName: file.name,
          mimeType: "image/jpeg",
          dataUrl: result,
          savedAt: Date.now(),
        }),
      );
      setPreparedImageDataUrl(result);
      setPreparedImageFileName(file.name);
      setPreparedImageMimeType("image/jpeg");
      setIsImagePrepared(true);
    } catch {
      setIsImagePrepared(false);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="clientCaseId" value={clientCaseId} />
      <input type="hidden" name="browserImageKey" value={browserImageKey} />
      <input type="hidden" name="preparedImageDataUrl" value={preparedImageDataUrl} />
      <input type="hidden" name="preparedImageFileName" value={preparedImageFileName} />
      <input type="hidden" name="preparedImageMimeType" value={preparedImageMimeType} />
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
              name="imageFile"
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
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge variant="info">Microscopy upload</Badge>
              <Badge variant="neutral">Case-ready intake</Badge>
              {!isImagePrepared ? <Badge variant="warning">Preparing uploaded image</Badge> : null}
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
                <input name="patientCode" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4" placeholder="PT-00124" />
              </div>
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <i className="bi bi-person-fill text-base text-blue-700" aria-hidden="true" />
                  Patient name
                </label>
                <input name="patientName" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4" placeholder="Optional patient name" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <i className="bi bi-file-earmark-medical text-base text-blue-700" aria-hidden="true" />
                  Case title
                </label>
                <input name="caseTitle" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4" placeholder="Follow-up marrow smear" />
              </div>
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <i className="bi bi-gender-ambiguous text-base text-blue-700" aria-hidden="true" />
                  Sex
                </label>
                <select name="sex" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4">
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
              <input name="dateOfBirth" type="date" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4" />
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
            <div className={!isImagePrepared ? "pointer-events-none opacity-60" : ""}>
              <SubmitButton />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
