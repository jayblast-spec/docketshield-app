import { z } from "zod";

export const API_BASE = "https://docketshield.vercel.app";

const extractedFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.null()]).transform((value) =>
    value === null ? "" : String(value),
  ),
  confidence: z.number().min(0).max(1),
  evidence: z.string().optional().default(""),
});

export const fieldNames = [
  "county",
  "caseNumber",
  "plaintiff",
  "defendant",
  "propertyAddress",
  "serviceDate",
  "serviceMethod",
  "claimReason",
  "amountClaimed",
  "printedAnswerDeadline",
] as const;

export type FieldName = (typeof fieldNames)[number];
export type CaseValues = Record<FieldName, string>;
export type ExtractedField = z.infer<typeof extractedFieldSchema>;
export type ExtractedFields = Partial<Record<FieldName, ExtractedField>>;

const extractionSchema = z.object({
  fields: z.record(z.string(), extractedFieldSchema),
  needsConfirmation: z.array(z.string()),
  checks: z.array(z.object({ kind: z.string(), message: z.string() })),
  model: z.string(),
});

const deadlineSchema = z.object({
  deadline: z.string(),
  deadlineWeekday: z.string(),
  cutoff: z.string(),
  seventhDay: z.string(),
  rolledForward: z.boolean(),
  trace: z.array(z.object({ date: z.string(), note: z.string(), kind: z.enum(["served", "window", "skipped", "deadline"]).optional() })),
  warnings: z.array(z.string()),
  daysRemaining: z.number().int(),
});

const optionSchema = z.object({
  id: z.string(),
  title: z.string(),
  explanation: z.string(),
  action: z.string(),
  kind: z.enum(["cure", "defense", "counterclaim", "check"]),
  sources: z.array(z.string()),
});

const triageSchema = z.object({
  sourceDetails: z.record(z.string(), z.object({ title: z.string(), url: z.string() })).optional(),
  options: z.array(optionSchema),
  cautions: z.array(z.string()),
  disclaimer: z.string(),
});

const draftSchema = z.object({
  draft: z.object({
    grounds: z.array(z.object({ id: z.string(), text: z.string(), because: z.string() })),
    counterclaims: z.array(z.object({ id: z.string(), text: z.string() })),
    missing: z.array(z.string()),
    reviewNotice: z.string(),
  }).passthrough(),
  text: z.string(),
});

export type ExtractionResponse = z.infer<typeof extractionSchema>;
export type DeadlineResponse = z.infer<typeof deadlineSchema>;
export type TriageResponse = z.infer<typeof triageSchema>;
export type DraftResponse = z.infer<typeof draftSchema>;
export type Facts = Record<string, string | boolean | number>;

export class DocketShieldApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const safeMessage =
      typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "The service could not complete this request.";
    throw new DocketShieldApiError(safeMessage, response.status);
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new DocketShieldApiError("The service returned an unexpected response.", 502);
  return parsed.data;
}

export const extractPapers = (mimeType: string, image: string) =>
  post("/api/extract", { mimeType, image }, extractionSchema);

export const getDeadline = (serviceDate: string, serviceMethod: string) =>
  post("/api/deadline", { serviceDate, serviceMethod }, deadlineSchema);

export const getTriage = (facts: Facts) => post("/api/triage", { facts }, triageSchema);

export const getDraft = (caption: Pick<CaseValues, "county" | "caseNumber" | "plaintiff" | "defendant">, facts: Facts) =>
  post("/api/draft", { caption, facts }, draftSchema);

export const emptyCase: CaseValues = Object.fromEntries(fieldNames.map((key) => [key, ""])) as CaseValues;

export const sampleCase: CaseValues = {
  county: "Fulton",
  caseNumber: "26ED004217",
  plaintiff: "Peachtree Sample Holdings LLC",
  defendant: "Alex Q. Example",
  propertyAddress: "482 Demo Avenue SW, Apt 3B, Atlanta, GA 30310",
  serviceDate: "2026-10-03",
  serviceMethod: "personal",
  claimReason: "nonpayment",
  amountClaimed: "$1,875.00",
  printedAnswerDeadline: "2026-10-13",
};

// Verbatim lines from the synthetic sample warrant (fixtures/sample-warrant.html in the engine repo).
const SAMPLE_EVIDENCE: Record<(typeof fieldNames)[number], string> = {
  county: "IN THE MAGISTRATE COURT OF FULTON COUNTY",
  caseNumber: "Case No.: 26ED004217",
  plaintiff: "Plaintiff: Peachtree Sample Holdings LLC",
  defendant: "Defendant: Alex Q. Example and all other occupants",
  propertyAddress: "Property: 482 Demo Avenue SW, Apt 3B, Atlanta, GA 30310",
  serviceDate: "Served personally upon the Defendant named above on October 3, 2026",
  serviceMethod: "Served personally upon the Defendant",
  claimReason: "has FAILED TO PAY RENT which is now past due",
  amountClaimed: "a money judgment for past due rent of $1,875.00",
  printedAnswerDeadline: "Last day to answer: October 13, 2026 by 5:00 PM.",
};

export const sampleFields: ExtractedFields = Object.fromEntries(
  fieldNames.map((key) => [key, { value: sampleCase[key], confidence: 1, evidence: SAMPLE_EVIDENCE[key] }]),
) as ExtractedFields;

export async function prepareUpload(file: File) {
  if (file.size > 20 * 1024 * 1024) throw new Error("Please choose a file smaller than 20 MB.");
  if (file.type === "application/pdf") return { mimeType: file.type, image: await toBase64(file) };
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image or PDF file.");

  const image = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("We could not prepare this photo. Please enter the details by hand.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("We could not prepare this photo. Please enter the details by hand.");
  return { mimeType: "image/jpeg", image: await toBase64(blob) };
}

async function toBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}