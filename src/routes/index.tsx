import { createFileRoute } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  Camera,
  Check,
  Clipboard,
  Download,
  FileText,
  Info,
  LoaderCircle,
  LockKeyhole,
  Printer,
  Scale,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DocketShieldApiError,
  emptyCase,
  extractPapers,
  fieldNames,
  getDeadline,
  getDraft,
  getTriage,
  prepareUpload,
  sampleCase,
  sampleFields,
  type CaseValues,
  type DeadlineResponse,
  type DraftResponse,
  type ExtractedFields,
  type Facts,
  type FieldName,
  type TriageResponse,
} from "@/lib/docketshield";

import { isFultonCounty, fieldsRequiringReview } from "@/lib/review";

const SITE_URL = "https://docketshield-app.vercel.app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DocketShield — Georgia eviction answer guidance" },
      { name: "description", content: "Calculate your Georgia eviction Answer deadline, review your options, and prepare a draft Answer." },
      { property: "og:title", content: "DocketShield — Georgia eviction answer guidance" },
      { property: "og:description", content: "Clear, step-by-step help after you are served eviction papers in Georgia." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: `${SITE_URL}/og-image.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "DocketShield: Served eviction papers in Georgia? You have 7 days." },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "DocketShield — Georgia eviction answer guidance" },
      { name: "twitter:description", content: "Your exact 7-day Answer deadline, your real options, and a court-form Answer draft." },
      { name: "twitter:image", content: `${SITE_URL}/og-image.png` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
  }),
  component: DocketShield,
});

const STEPS = ["Start", "Scan", "Details", "Deadline", "Situation", "Options", "Answer", "File"] as const;
type Step = (typeof STEPS)[number];
type AnswerValue = "yes" | "no" | "unsure";

const FIELD_LABELS: Record<FieldName, string> = {
  county: "County",
  caseNumber: "Case number",
  plaintiff: "Landlord or plaintiff",
  defendant: "Your name (defendant)",
  propertyAddress: "Rental property address",
  serviceDate: "Date you were served",
  serviceMethod: "How the papers were served",
  claimReason: "Reason listed on the papers",
  amountClaimed: "Amount claimed",
  printedAnswerDeadline: "Answer deadline printed on the papers",
};

const QUESTION_GROUPS = [
  {
    title: "Money",
    intro: "Tell us what happened with rent and payment.",
    questions: [
      ["firstFilingIn12Months", "Is this the first eviction case your landlord filed against you in the last 12 months?"],
      ["canPayAllOwedPlusCosts", "Can you pay all rent claimed plus court costs before the deadline?"],
      ["landlordRefusedPayment", "Did your landlord refuse a payment you offered?"],
      ["noMoneyOwed", "Do you believe you owe no rent?"],
      ["offeredRentOnTimeRefused", "Did you offer the full rent on time and the landlord refused it?"],
      ["rentClaimedIncorrect", "Is the amount of rent claimed incorrect?"],
    ],
  },
  {
    title: "Notices",
    intro: "These questions are about notices you received before the case.",
    questions: [
      ["threeDayNoticeReceived", "Before the case was filed, did your landlord give you a written notice that you had 3 days to pay in full or move out?"],
      ["terminationNoticeReceived", "Did you receive a written notice ending your tenancy?"],
      ["threatened", "Has your landlord threatened or pressured you because you asserted your rights?"],
      ["terminatedWithoutValidReason", "Do you believe your tenancy was ended without a valid reason?"],
    ],
  },
  {
    title: "Repairs",
    intro: "Tell us about repair problems and records you kept.",
    questions: [
      ["repairRequestedInWriting", "Did you ask for needed repairs in writing?"],
      ["repairIgnored", "Did the landlord fail to make the requested repairs?"],
      ["keptRepairReceipts", "Did you keep receipts for repairs you paid for?"],
    ],
  },
  {
    title: "Your home",
    intro: "A few final questions about the property and your tenancy.",
    questions: [
      ["lockedOut", "Has the landlord changed the locks or blocked your access?"],
      ["utilitiesShutOff", "Has the landlord shut off your utilities?"],
      ["plaintiffNotLandlord", "Is the plaintiff someone other than your landlord or property owner?"],
      ["hasSection8Voucher", "Do you have a Section 8 or housing choice voucher?"],
      ["livesInForeclosedProperty", "Is the property in foreclosure?"],
    ],
  },
] as const;

function DocketShield() {
  const [step, setStep] = useState<Step>("Start");
  const [furthest, setFurthest] = useState(0);
  const [sample, setSample] = useState(false);
  const [caseValues, setCaseValues] = useState<CaseValues>(emptyCase);
  const [extracted, setExtracted] = useState<ExtractedFields>({});
  const [needsConfirmation, setNeedsConfirmation] = useState<string[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [checks, setChecks] = useState<Array<{ kind: string; message: string }>>([]);
  const [facts, setFacts] = useState<Record<string, AnswerValue | string>>({});
  const [questionGroup, setQuestionGroup] = useState(0);
  const [deadline, setDeadline] = useState<DeadlineResponse | null>(null);
  const [triage, setTriage] = useState<TriageResponse | null>(null);
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const currentIndex = STEPS.indexOf(step);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const next = typeof event.state?.step === "string" && STEPS.includes(event.state.step) ? event.state.step as Step : "Start";
      setStep(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    if (!history.state?.step) history.replaceState({ step: "Start" }, "");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (next: Step) => {
    setError("");
    setStep(next);
    setFurthest((value) => Math.max(value, STEPS.indexOf(next)));
    history.pushState({ step: next }, "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const back = () => {
    if (step === "Situation" && questionGroup > 0) {
      setQuestionGroup((value) => value - 1);
      return;
    }
    if (currentIndex > 0) history.back();
  };

  const friendlyError = (caught: unknown) => {
    if (caught instanceof DocketShieldApiError) {
      if (caught.status === 429) return "The paper reader is busy right now. Please wait a moment or enter your details by hand.";
      if (caught.status === 413) return "That file is too large. Please choose a smaller file or enter your details by hand.";
      if (caught.status === 415) return "That file type is not supported. Please use a photo or PDF, or enter your details by hand.";
      if (caught.status === 503) return "The paper reader is temporarily unavailable. Please enter your details by hand.";
      return caught.message;
    }
    return caught instanceof Error ? caught.message : "Something went wrong. Please try again.";
  };

  const handleUpload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await prepareUpload(file);
      const result = await extractPapers(prepared.mimeType, prepared.image);
      const nextValues = { ...emptyCase };
      for (const key of fieldNames) nextValues[key] = String(result.fields[key]?.value ?? "");
      setCaseValues(nextValues);
      setExtracted(result.fields);
      setNeedsConfirmation([...fieldNames]);
      setTouched(new Set());
      setChecks(result.checks);
      go("Details");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  const calculateDeadline = async () => {
    if (!caseValues.county.trim() || !caseValues.serviceDate || !caseValues.serviceMethod) {
      setError("Enter the county, service date, and how the papers were served before continuing.");
      return;
    }
    const untouched = fieldsRequiringReview(needsConfirmation, touched);
    if (untouched.length) {
      setError("Please confirm each field against your papers before continuing.");
      if (untouched[0]) document.getElementById(untouched[0])?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      setDeadline(await getDeadline(caseValues.serviceDate, caseValues.serviceMethod, caseValues.printedAnswerDeadline));
      setChecks([]);
      go("Deadline");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  const apiFacts = useMemo(() => {
    const result: Facts = { reason: caseValues.claimReason };
    for (const [key, value] of Object.entries(facts)) {
      if (value === "yes") result[key] = true;
      else if (value === "no") result[key] = false;
      else if (value !== "unsure" && value !== "") result[key] = value;
    }
    if (!result["reason"]) delete result["reason"];
    return result;
  }, [caseValues.claimReason, facts]);

  const submitTriage = async () => {
    setBusy(true);
    setError("");
    try {
      setTriage(await getTriage(apiFacts));
      go("Options");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  const makeDraft = async () => {
    setBusy(true);
    setError("");
    try {
      setDraft(await getDraft(caseValues, apiFacts));
      go("Answer");
    } catch (caught) {
      setError(friendlyError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Header sample={sample} step={step} currentIndex={currentIndex} furthest={furthest} onBack={back} />
      <main className="mx-auto w-full max-w-3xl px-5 pb-32 pt-10 sm:px-8 sm:pt-14">
        {error && <Notice kind="error">{error}</Notice>}
        {step === "Start" && <StartScreen onScan={() => go("Scan")} onManual={() => go("Details")} onSample={() => { setSample(true); setCaseValues(sampleCase); setExtracted(sampleFields); setNeedsConfirmation([...fieldNames]); setTouched(new Set()); go("Details"); }} />}
        {step === "Scan" && <ScanScreen busy={busy} inputRef={fileInput} onFile={handleUpload} onManual={() => go("Details")} />}
        {step === "Details" && <DetailsScreen values={caseValues} fields={extracted} needsConfirmation={needsConfirmation} touched={touched} checks={checks} busy={busy} onChange={(key, value) => { setCaseValues((current) => ({ ...current, [key]: value })); setTouched((current) => { const next = new Set(current); next.delete(key); return next; }); setChecks([]); setDeadline(null); setTriage(null); setDraft(null); }} onConfirm={(key, confirmed) => setTouched((current) => { const next = new Set(current); if (confirmed) next.add(key); else next.delete(key); return next; })} onContinue={calculateDeadline} />}
        {step === "Deadline" && deadline && <DeadlineScreen result={deadline} values={caseValues} onContinue={() => go("Situation")} />}
        {step === "Situation" && <SituationScreen group={questionGroup} values={facts} caseValues={caseValues} busy={busy} onChange={(key, value) => setFacts((current) => ({ ...current, [key]: value }))} onBackGroup={() => setQuestionGroup((value) => value - 1)} onNext={() => questionGroup < 3 ? setQuestionGroup((value) => value + 1) : submitTriage()} />}
        {step === "Options" && triage && <OptionsScreen result={triage} busy={busy} onContinue={makeDraft} />}
        {step === "Answer" && draft && <DraftScreen result={draft} onContinue={() => go("File")} />}
        {step === "File" && deadline && <FileScreen deadline={deadline} county={caseValues.county} />}
      </main>
      <TrustFooter />
    </div>
  );
}

function Header({ sample, step, currentIndex, furthest, onBack }: { sample: boolean; step: Step; currentIndex: number; furthest: number; onBack: () => void }) {
  return <header className="border-b border-border bg-surface">
    <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
      <div className="flex items-center gap-3"><ShieldCheck aria-hidden="true" className="text-primary" /><span className="font-serif text-xl font-bold">DocketShield</span>{sample && <span className="sample-badge">SAMPLE</span>}</div>
      {currentIndex > 0 && <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft /> Back</Button>}
    </div>
    {currentIndex > 0 && <div className="mx-auto max-w-6xl px-5 pb-4 sm:px-8" aria-label={`Step ${currentIndex + 1} of ${STEPS.length}: ${step}`}>
      <div className="mb-2 flex items-center justify-between text-sm"><span className="font-semibold">{step}</span><span className="text-muted-foreground">Step {currentIndex + 1} of {STEPS.length}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((Math.max(currentIndex, furthest) + 1) / STEPS.length) * 100}%` }} /></div>
    </div>}
  </header>;
}

function StartScreen({ onScan, onManual, onSample }: { onScan: () => void; onManual: () => void; onSample: () => void }) {
  return <section className="animate-enter">
    <p className="mb-5 flex items-center gap-2 font-semibold text-primary"><Scale aria-hidden="true" /> Georgia eviction Answer</p>
    <h1 className="max-w-2xl font-serif text-5xl font-semibold leading-[1.06] sm:text-6xl">Served eviction papers? Check your deadline and prepare your response.</h1>
    <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">Georgia generally gives you 7 days after service to answer. Check the date on your summons and confirm any uncertainty with the court clerk.</p>
    <div className="mt-10 grid gap-3 sm:max-w-md"><Button size="lg" onClick={onScan}><Camera /> Scan my papers</Button><Button size="lg" variant="outline" onClick={onManual}>Enter details by hand <ArrowRight /></Button></div>
    <Button variant="link" onClick={onSample} className="mt-5">Try with a sample case</Button>
    <p className="mt-14 text-sm text-muted-foreground">Legal information, not legal advice.</p>
  </section>;
}

function ScanScreen({ busy, inputRef, onFile, onManual }: { busy: boolean; inputRef: React.RefObject<HTMLInputElement | null>; onFile: (file?: File) => void; onManual: () => void }) {
  return <section className="animate-enter">
    <StepTitle icon={<Camera />} title="Scan your papers" copy="Take a clear photo or choose a PDF. Make sure the court heading, case number, and service date are visible." />
    <input ref={inputRef} type="file" accept="image/*,application/pdf" className="sr-only" aria-label="Choose eviction papers" onChange={(event) => onFile(event.target.files?.[0])} />
    {busy ? <div className="scan-zone" role="status" aria-live="polite"><LoaderCircle className="animate-spin text-primary" aria-hidden="true" /><h2 className="font-serif text-2xl font-semibold">Reading your papers…</h2><p className="text-muted-foreground">This may take a moment. Please keep this page open.</p></div> : <button type="button" className="scan-zone" onClick={() => inputRef.current?.click()}><FileText className="text-primary" aria-hidden="true" /><span className="font-serif text-2xl font-semibold">Choose a photo or PDF</span><span className="text-muted-foreground">Up to 20 MB</span></button>}
    <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole aria-hidden="true" className="size-4" /> Your document is sent to Google Gemini for extraction. Review its data-use terms before uploading personal information.</p>
    <Button variant="link" onClick={onManual} className="mt-6">Enter details by hand instead</Button>
  </section>;
}

function DetailsScreen({ values, fields, needsConfirmation, touched, checks, busy, onChange, onConfirm, onContinue }: { values: CaseValues; fields: ExtractedFields; needsConfirmation: string[]; touched: Set<string>; checks: Array<{ kind: string; message: string }>; busy: boolean; onChange: (key: FieldName, value: string) => void; onConfirm: (key: FieldName, confirmed: boolean) => void; onContinue: () => void }) {
  return <section className="animate-enter"><StepTitle icon={<FileText />} title="Confirm the details" copy="Check each field against your papers, correct any errors, and tick its confirmation box. If an optional field is not stated, leave it blank and confirm that." />
    <div className="space-y-3">{checks.map((check, index) => <Notice key={`${check.kind}-${index}`} kind={check.kind === "deadline-mismatch" || check.kind === "deadline-unverified" ? "warning" : "info"}>{check.message}</Notice>)}</div>
    <div className="mt-8 space-y-6">{fieldNames.map((key) => {
      const field = fields[key]; const required = needsConfirmation.includes(key) && !touched.has(key);
      return <div key={key} className={required ? "field-wrap field-check" : "field-wrap"}>
        <div className="mb-2 flex items-center justify-between gap-3"><label htmlFor={key} className="font-semibold">{FIELD_LABELS[key]}</label>{field && <span className={field.confidence >= .85 ? "confidence-high" : "confidence-check"}>{field.confidence >= .85 ? "High" : "Check"}</span>}</div>
        {key === "serviceMethod" || key === "claimReason" ? <select id={key} value={values[key]} onChange={(event) => onChange(key, event.target.value)} className="form-control"><option value="">Select one</option>{(key === "serviceMethod" ? [["personal","Handed to me"],["left-with-adult","Left with an adult"],["tack-and-mail","Posted and mailed"],["unknown","Not sure"]] : [["nonpayment","Nonpayment of rent"],["lease-breach","Lease breach"],["holdover","Stayed after tenancy ended"],["other","Other"]]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <input id={key} type={key === "serviceDate" || key === "printedAnswerDeadline" ? "date" : "text"} value={values[key]} onChange={(event) => onChange(key, event.target.value)} className="form-control" />}
        {field?.evidence && <p className="mt-2 text-sm italic text-muted-foreground">Read from your papers: “{field.evidence}”</p>}
        {needsConfirmation.includes(key) && <label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" checked={touched.has(key)} onChange={(event) => onConfirm(key, event.target.checked)} className="mt-1" /> I checked this field against my papers, or confirmed it is not stated.</label>}
        {required && <p className="mt-2 text-sm font-semibold text-warning">Confirmation required.</p>}
      </div>;
    })}</div>
    <Button size="lg" className="mt-10 w-full sm:w-auto" onClick={onContinue} disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : null} Get my deadline <ArrowRight /></Button>
  </section>;
}

function DeadlineScreen({ result, values, onContinue }: { result: DeadlineResponse; values: CaseValues; onContinue: () => void }) {
  const date = formatLongDate(result.deadline);
  const countdown = result.daysRemaining < 0 ? "The deadline has passed. Call the clerk and legal aid now" : result.daysRemaining === 0 ? "Today is your last day" : `${result.daysRemaining} days left`;
  return <section className="animate-enter"><div className="deadline-hero"><p className="text-sm font-bold uppercase text-primary">Your Answer is due</p><h1 className="mt-3 font-serif text-5xl font-semibold leading-none sm:text-7xl">{date}</h1><p className="mt-4 text-2xl font-semibold">by {result.cutoff}</p><p className={result.daysRemaining < 0 ? "countdown-expired" : "countdown"}>{countdown}</p></div>
    {result.warnings.map((warning, index) => <Notice key={index} kind="warning">{warning}</Notice>)}
    <Button variant="outline" className="mt-6" onClick={() => downloadCalendar(result, values)}><CalendarPlus /> Add to calendar</Button>
    <div className="mt-12"><h2 className="font-serif text-3xl font-semibold">How we calculated this</h2><ol className="timeline mt-7">{result.trace.map((item, index) => { const kind = item.kind ?? (item.note.startsWith("Skipped") ? "skipped" : "window"); return <li key={`${item.date}-${index}`} className={`timeline-item timeline-${kind}`}><time>{formatShortDate(item.date)}</time><p>{item.note}</p></li>; })}</ol></div>
    <Button size="lg" className="mt-10 w-full sm:w-auto" onClick={onContinue}>Tell us what happened <ArrowRight /></Button>
  </section>;
}

function SituationScreen({ group, values, caseValues, busy, onChange, onBackGroup, onNext }: { group: number; values: Record<string, AnswerValue | string>; caseValues: CaseValues; busy: boolean; onChange: (key: string, value: string) => void; onBackGroup: () => void; onNext: () => void }) {
  const section = QUESTION_GROUPS[group] ?? QUESTION_GROUPS[0]!;
  return <section className="animate-enter"><p className="mb-3 font-semibold text-primary">{group + 1} of 4</p><h1 className="font-serif text-4xl font-semibold">{section.title}</h1><p className="mt-3 text-lg text-muted-foreground">{section.intro}</p>
    {group === 0 && <div className="mt-8 grid gap-5 sm:grid-cols-2"><LabeledInput label="Reason on the papers"><select value={caseValues.claimReason} disabled className="form-control"><option>{caseValues.claimReason || "Not provided"}</option></select></LabeledInput><LabeledInput label="Correct monthly rent amount"><input inputMode="decimal" className="form-control" value={values["correctRentAmount"] ?? ""} onChange={(event) => onChange("correctRentAmount", event.target.value)} /></LabeledInput></div>}
    {group === 1 && <div className="mt-8"><LabeledInput label="Lease start date"><input type="date" className="form-control" value={values["leaseStartDate"] ?? ""} onChange={(event) => onChange("leaseStartDate", event.target.value)} /></LabeledInput></div>}
    <div className="mt-9 space-y-8">{section.questions.map(([key, label]) => <fieldset key={key}><legend className="max-w-2xl text-lg font-semibold leading-7">{label}</legend><div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={label}>{(["yes","no","unsure"] as const).map((choice) => <button type="button" key={choice} aria-pressed={values[key] === choice} className="segment" onClick={() => onChange(key, choice)}>{choice === "unsure" ? "Not sure" : choice.charAt(0).toUpperCase() + choice.slice(1)}</button>)}</div></fieldset>)}</div>
    <div className="mt-12 flex gap-3">{group > 0 && <Button variant="outline" onClick={onBackGroup}><ArrowLeft /> Previous</Button>}<Button size="lg" className="flex-1 sm:flex-none" disabled={busy} onClick={onNext}>{busy ? <LoaderCircle className="animate-spin" /> : null}{group < 3 ? "Continue" : "See my options"} <ArrowRight /></Button></div>
  </section>;
}

function OptionsScreen({ result, busy, onContinue }: { result: TriageResponse; busy: boolean; onContinue: () => void }) {
  const groups = [["cure","Ways to resolve the claim"],["defense","Possible defenses"],["counterclaim","Possible counterclaims"],["check","Things to check"]] as const;
  return <section className="animate-enter"><StepTitle icon={<Scale />} title="Your options" copy="These are based on the facts you shared. Read each one before preparing your draft." />
    {result.cautions.length > 0 && <div className="info-panel"><Info aria-hidden="true" /><div><h2 className="font-semibold">Important to know</h2>{result.cautions.map((caution, index) => <p key={index}>{caution}</p>)}</div></div>}
    {result.options.length === 0 ? <div className="empty-state"><h2 className="font-serif text-2xl font-semibold">No specific options were identified.</h2><p>Please contact free legal help as soon as possible. They can review facts this tool may not have captured.</p></div> : groups.map(([kind, title]) => { const options = result.options.filter((option) => option.kind === kind); if (!options.length) return null; return <section key={kind} className="mt-10"><h2 className="font-serif text-3xl font-semibold">{title}</h2><div className="mt-5 space-y-4">{options.map((option) => <article key={option.id} className="option-card"><h3 className="font-serif text-2xl font-semibold">{option.title}</h3><p>{option.explanation}</p><p className="action-line"><strong>What to do before your deadline:</strong> {option.action}</p><div className="mt-4 flex flex-wrap gap-2">{option.sources.map((source) => { const detail = result.sourceDetails?.[source]; return detail ? <a className="source-tag" key={source} href={detail.url} target="_blank" rel="noopener noreferrer">{detail.title}</a> : <span className="source-tag" key={source}>{source}</span>; })}</div></article>)}</div></section>; })}
    <p className="mt-8 text-sm text-muted-foreground">{result.disclaimer}</p><Button size="lg" className="mt-10 w-full sm:w-auto" onClick={onContinue} disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : null} Prepare my draft Answer <ArrowRight /></Button>
  </section>;
}

function DraftScreen({ result, onContinue }: { result: DraftResponse; onContinue: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(result.text); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  return <section className="animate-enter"><StepTitle icon={<FileText />} title="Your Answer draft" copy="Review every line carefully. This is a draft to help you prepare, not a filed court document." />
    <Notice kind="warning">{result.draft.reviewNotice}</Notice>
    {result.draft.missing.length > 0 && <div className="missing-list"><h2 className="font-serif text-2xl font-semibold">Still needed before filing</h2><ul>{result.draft.missing.map((item) => <li key={item}><span className="empty-check" aria-hidden="true" /> {item}</li>)}</ul></div>}
    <div className="action-bar no-print"><Button variant="outline" onClick={copy}>{copied ? <Check /> : <Clipboard />}{copied ? "Copied" : "Copy text"}</Button><Button variant="outline" onClick={() => downloadText(result.text)}><Download /> Download as .txt</Button><Button variant="outline" onClick={() => window.print()}><Printer /> Print</Button></div>
    <article className="court-paper" id="court-paper"><pre>{result.text}</pre>{result.draft.grounds.filter((ground) => ground.because).map((ground) => <aside key={ground.id}><strong>Why this is checked:</strong> {ground.because}</aside>)}</article>
    <Button size="lg" className="mt-10 w-full sm:w-auto no-print" onClick={onContinue}>How to file it <ArrowRight /></Button>
  </section>;
}

function FileScreen({ deadline, county }: { deadline: DeadlineResponse; county: string }) {
  return <section className="animate-enter"><StepTitle icon={<Check />} title="File it and get help" copy={`File your Answer by ${formatLongDate(deadline.deadline)} at ${deadline.cutoff}. Keep a copy for yourself.`} />
    <ol className="filing-list"><li><span>1</span><div><h2>Review and sign your Answer</h2><p>Fill in anything marked as missing and make sure every statement is true.</p></div></li><li><span>2</span><div><h2>File before your deadline</h2><p>Confirm the filing method with the court named on your summons. Ask whether your case accepts <a href="https://www.odysseyefilega.com" target="_blank" rel="noreferrer">Odyssey eFileGA</a> before using it.</p></div></li><li><span>3</span><div><h2>Get free legal help now</h2><p>Ask a lawyer to review your situation before the hearing if possible.</p></div></li></ol>
    {isFultonCounty(county) ? <div className="office-panel"><h2 className="font-serif text-2xl font-semibold">Fulton County Magistrate Court Clerk</h2><address className="mt-3 not-italic">Suite TG-100, Justice Center Tower<br />185 Central Avenue SW, Atlanta</address><p className="mt-2"><a href="tel:+14046135360">404-613-5360</a><br />Monday–Friday, 8:30 AM–5:00 PM</p><p className="mt-4 text-sm">Free public e-filing terminals and the Housing Court Assistance Center are available in Suite TG-100.</p></div> : <Notice kind="warning">Your case is in {county || "an unspecified county"}. DocketShield currently provides local filing details only for Fulton County. Use the court and clerk contact information on your summons to confirm the correct location, accepted filing method, hours, and required form. Do not travel to the Fulton office for a case in another county.</Notice>}
    <h2 className="mt-10 font-serif text-3xl font-semibold">Free legal help</h2><ul className="help-links"><li><a href="https://atlantalegalaid.org" target="_blank" rel="noreferrer">Atlanta Legal Aid Society</a></li><li><a href="https://glsp.org" target="_blank" rel="noreferrer">Georgia Legal Services Program</a></li><li><a href="https://avlf.org" target="_blank" rel="noreferrer">Atlanta Volunteer Lawyers Foundation</a></li></ul>
    <Notice kind="warning">If you lose at the hearing, you have 7 days to appeal; to stay in your home during an appeal you must pay the judgment and future rent into the court registry.</Notice>
  </section>;
}

function StepTitle({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) { return <div className="mb-9"><div className="mb-4 text-primary" aria-hidden="true">{icon}</div><h1 className="font-serif text-4xl font-semibold sm:text-5xl">{title}</h1><p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">{copy}</p></div>; }
function Notice({ kind, children }: { kind: "warning" | "error" | "info"; children: ReactNode }) { return <div className={`notice notice-${kind}`} role={kind === "error" ? "alert" : "status"}>{kind === "info" ? <Info /> : <AlertTriangle />}<p>{children}</p></div>; }
function LabeledInput({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2 font-semibold">{label}{children}</label>; }

function TrustFooter() {
  return <footer className="border-t border-border bg-surface px-5 py-7 no-print"><div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p>DocketShield gives legal information, not legal advice. Every rule cites its source.</p><div className="flex flex-wrap items-center gap-x-5 gap-y-2"><SourcesDialog /><a href="https://github.com/jayblast-spec/docketshield" target="_blank" rel="noreferrer">About</a><span>Built by ArkNet Digital</span></div></div></footer>;
}

function SourcesDialog() {
  return <Dialog.Root><Dialog.Trigger asChild><button type="button" className="footer-link">Sources</button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-7 shadow-xl"><Dialog.Title className="font-serif text-3xl font-semibold">Sources</Dialog.Title><Dialog.Description className="mt-2 text-muted-foreground">The official materials used by DocketShield.</Dialog.Description><ul className="mt-6 list-disc space-y-3 pl-5"><li><a href="https://www.fultoncountyga.gov/-/media/Departments/Magistrate-Court/Court-Resources/Tenant-Pamphlet.pdf" target="_blank" rel="noreferrer">Fulton County Magistrate Court Tenant Pamphlet</a></li><li><a href="https://dekalbgastatecourt.gov/wp-content/uploads/2025/10/DISPOSSESSORY-ANSWER-CHECK-BOX-fillable.pdf" target="_blank" rel="noreferrer">DeKalb County official Dispossessory Answer form</a></li><li><a href="https://georgia.gov/georgia-state-holidays-2026" target="_blank" rel="noreferrer">Georgia.gov 2026 State Holidays</a></li></ul><Dialog.Close className="dialog-close" aria-label="Close sources"><X /></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

function formatLongDate(value: string) { const [year = 1970, month = 1, day = 1] = value.split("-").map(Number); return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day))); }
function formatShortDate(value: string) { const [year = 1970, month = 1, day = 1] = value.split("-").map(Number); return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day))); }
function downloadText(text: string) { downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), "docketshield-answer-draft.txt"); }
function downloadCalendar(result: DeadlineResponse, values: CaseValues) { const date = result.deadline.replaceAll("-", ""); const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//DocketShield//EN","BEGIN:VEVENT",`DTSTART:${date}T090000`,`DTEND:${date}T093000`,`SUMMARY:File eviction Answer — ${values.caseNumber || "DocketShield"}`,"DESCRIPTION:File your eviction Answer by 5:00 PM. Confirm details with the court clerk.","BEGIN:VALARM","TRIGGER:-PT24H","ACTION:DISPLAY","DESCRIPTION:Your eviction Answer is due tomorrow.","END:VALARM","END:VEVENT","END:VCALENDAR"].join("\r\n"); downloadBlob(new Blob([ics], { type: "text/calendar;charset=utf-8" }), "docketshield-deadline.ics"); }
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); }