"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TurnstileWidget = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileWidget;
  }
}

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_ADMISSIONS_TURNSTILE_SITE_KEY;

type Ref = {
  id: string;
  name: string;
  code?: string | null;
  category?: string | null;
  iso2?: string | null;
  iso3?: string | null;
  type?: string;
  level?: number;
  parentId?: string | null;
};
type Cycle = {
  id: string;
  academicYear: string;
  cycleName: string;
  admissionType: string;
  openDate: string;
  closeDate: string;
  utmeMinScore: number | null;
  applicationFeeRequired: boolean;
  applicationFeeAmount: string | number | null;
  applicationFeeCurrency: string;
};
type Programme = {
  id: string;
  name: string;
  code: string;
  degreeType: string;
  durationYears: number;
  department: { name: string; faculty: { name: string } };
};
type ExamAuthority = { id: string; code: string; name: string };
type ExamType = {
  id: string;
  authorityId: string;
  code: string;
  name: string;
  candidateLabel?: string | null;
};
type AdmissionDetails = {
  highestQualification: string;
  awardingInstitution: string;
  graduationYear: string;
  previousInstitution: string;
  previousProgramme: string;
  transferReason: string;
  travelDocumentStatus: string;
  englishProficiencyStatus: string;
  researchInterest: string;
  studyPreference: string;
};
type PublicRequirement = {
  minUtmeScore: number | null;
  minOLevelCredits: number | null;
  maxOLevelSittings: number | null;
  requireEnglish: boolean;
  requireMathematics: boolean;
  minAge: number | null;
  maxAge: number | null;
  requiredDocuments: string[] | null;
  subjectRequirements: {
    subject: string;
    required: boolean;
    alternatives: string[] | null;
  }[];
};

type FormState = {
  firstName: string;
  lastName: string;
  middleName: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  countryOfOriginId: string;
  stateOfOriginId: string;
  lgaOfOriginId: string;
  stateOfOrigin: string;
  lga: string;
  phone: string;
  email: string;
  admissionCycleId: string;
  programmeChoice1Id: string;
  programmeChoice2Id: string;
  programmeChoice3Id: string;
  admissionDetails: AdmissionDetails;
  jambRegNo: string;
  jambScore: string;
  nin: string;
  ninConsentAccepted: boolean;
  privacyNoticeAccepted: boolean;
  declarationAccepted: boolean;
  supportRequested: boolean;
  supportAreas: string[];
  requestedAdjustments: string[];
  supportDescription: string;
  preferredContactMethod: string;
  preferredFormat: string;
  supportConsentAccepted: boolean;
};
const initial: FormState = {
  firstName: "",
  lastName: "",
  middleName: "",
  dateOfBirth: "",
  gender: "",
  nationality: "",
  countryOfOriginId: "",
  stateOfOriginId: "",
  lgaOfOriginId: "",
  stateOfOrigin: "",
  lga: "",
  phone: "",
  email: "",
  admissionCycleId: "",
  programmeChoice1Id: "",
  programmeChoice2Id: "",
  programmeChoice3Id: "",
  admissionDetails: {
    highestQualification: "",
    awardingInstitution: "",
    graduationYear: "",
    previousInstitution: "",
    previousProgramme: "",
    transferReason: "",
    travelDocumentStatus: "",
    englishProficiencyStatus: "",
    researchInterest: "",
    studyPreference: "",
  },
  jambRegNo: "",
  jambScore: "",
  nin: "",
  ninConsentAccepted: false,
  privacyNoticeAccepted: false,
  declarationAccepted: false,
  supportRequested: false,
  supportAreas: [],
  requestedAdjustments: [],
  supportDescription: "",
  preferredContactMethod: "",
  preferredFormat: "",
  supportConsentAccepted: false,
};
const grades = ["A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9"];
type SittingMeta = {
  authorityId: string;
  examTypeId: string;
  examYear: number;
  candidateCategory: string;
  candidateNumber: string;
  examinationNumber: string;
  centreNumber: string;
};
type SponsorForm = {
  sponsorType: string;
  sameAsGuardian: boolean;
  fullName: string;
  relationship: string;
  phone: string;
  email: string;
  organization: string;
  address: string;
  sponsorshipReference: string;
};
const emptySittingMeta = (): Record<1 | 2, SittingMeta> => ({
  1: {
    authorityId: "",
    examTypeId: "",
    examYear: new Date().getFullYear(),
    candidateCategory: "",
    candidateNumber: "",
    examinationNumber: "",
    centreNumber: "",
  },
  2: {
    authorityId: "",
    examTypeId: "",
    examYear: new Date().getFullYear(),
    candidateCategory: "",
    candidateNumber: "",
    examinationNumber: "",
    centreNumber: "",
  },
});

export default function ApplyPage() {
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [countries, setCountries] = useState<Ref[]>([]);
  const [originStates, setOriginStates] = useState<Ref[]>([]);
  const [originLgas, setOriginLgas] = useState<Ref[]>([]);
  const [originLgaLoading, setOriginLgaLoading] = useState(false);
  const [addressCountries, setAddressCountries] = useState<Ref[]>([]);
  const [addressRegions, setAddressRegions] = useState<Ref[]>([]);
  const [addressLgas, setAddressLgas] = useState<Ref[]>([]);
  const [addressLgaLoading, setAddressLgaLoading] = useState(false);
  const [authorities, setAuthorities] = useState<ExamAuthority[]>([]);
  const [examTypesByAuthority, setExamTypesByAuthority] = useState<
    Record<string, ExamType[]>
  >({});
  const [subjects, setSubjects] = useState<Ref[]>([]);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [form, setForm] = useState<FormState>(initial);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState("");
  const [requirement, setRequirement] = useState<PublicRequirement | null>(
    null,
  );
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [success, setSuccess] = useState<{
    applicationNo: string;
    completionPercent: number;
    trackingToken: string;
    paymentStatus: string;
    applicationFee: {
      required: boolean;
      amount: string | number | null;
      currency: string;
    };
  } | null>(null);
  const [passportPhoto, setPassportPhoto] = useState<File | null>(null);
  const [passportPhotoPreview, setPassportPhotoPreview] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoProof, setPhotoProof] = useState("");
  const [submissionKey, setSubmissionKey] = useState(() => crypto.randomUUID());
  const [humanVerificationToken, setHumanVerificationToken] = useState("");
  const [website, setWebsite] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [changeType, setChangeType] = useState<"CORRECTION" | "WITHDRAWAL">(
    "CORRECTION",
  );
  const [changeReason, setChangeReason] = useState("");
  const [changeStatus, setChangeStatus] = useState("");
  const [changeBusy, setChangeBusy] = useState(false);
  const [olevel, setOlevel] = useState([
    {
      subjectId: "",
      grade: "",
      authorityId: "",
      examTypeId: "",
      examYear: new Date().getFullYear(),
      sittingNumber: 1,
      candidateCategory: "",
      candidateNumber: "",
      examinationNumber: "",
      centreNumber: "",
    },
  ]);
  const [sittingMeta, setSittingMeta] = useState(emptySittingMeta);
  const [secondSitting, setSecondSitting] = useState(false);
  const [address, setAddress] = useState({
    line1: "",
    city: "",
    countryId: "",
    regionId: "",
    localAreaId: "",
    regionName: "",
    localAreaName: "",
  });
  const [guardian, setGuardian] = useState({
    fullName: "",
    relationship: "",
    phone: "",
    email: "",
    occupation: "",
    address: "",
  });
  const [emergencyContact, setEmergencyContact] = useState({
    fullName: "",
    relationship: "",
    phone: "",
    email: "",
    occupation: "",
    address: "",
  });
  const [sponsor, setSponsor] = useState<SponsorForm>({
    sponsorType: "SELF_FUNDED",
    sameAsGuardian: false,
    fullName: "",
    relationship: "",
    phone: "",
    email: "",
    organization: "",
    address: "",
    sponsorshipReference: "",
  });
  const [previousEducation, setPreviousEducation] = useState([
    {
      institution: "",
      qualification: "",
      programme: "",
      startYear: "",
      endYear: "",
      gradeOrCgpa: "",
      certificateNo: "",
    },
  ]);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    Promise.all([
      apiClient.get<Cycle[]>("/admissions/public/cycles"),
      apiClient.get<Programme[]>("/admissions/public/programmes"),
      apiClient.get<Ref[]>("/admissions/public/reference/countries"),
      apiClient.get<ExamAuthority[]>(
        "/admissions/public/reference/examination-authorities",
      ),
      apiClient.get<Ref[]>("/admissions/public/reference/subjects"),
    ])
      .then(([c, p, co, a, s]) => {
        setCycles(c);
        setProgrammes(p);
        setCountries(co);
        setAddressCountries(co);
        setAuthorities(a);
        setSubjects(s);
        const ng = co.find((x) => x.iso2 === "NG");
        if (ng)
          setForm((f) => ({
            ...f,
            countryOfOriginId: ng.id,
            nationality: "Nigerian",
          }));
        setAddress((x) => ({ ...x, countryId: ng?.id ?? "" }));
        setLoading(false);
      })
      .catch(() => {
        setLoadError(
          "Application services are temporarily unavailable. Please retry in a moment or contact the Admissions Office if the problem continues.",
        );
        setLoading(false);
      });
  }, [loadAttempt]);

  const selectedCycle = useMemo(
    () => cycles.find((c) => c.id === form.admissionCycleId),
    [cycles, form.admissionCycleId],
  );
  useEffect(() => {
    if (!form.programmeChoice1Id || !selectedCycle) {
      setRequirement(null);
      return;
    }
    apiClient
      .get<PublicRequirement | null>(
        `/admissions/public/requirements?programmeId=${encodeURIComponent(form.programmeChoice1Id)}&admissionType=${encodeURIComponent(selectedCycle.admissionType)}&academicYear=${encodeURIComponent(selectedCycle.academicYear)}`,
      )
      .then(setRequirement)
      .catch(() => setRequirement(null));
  }, [form.programmeChoice1Id, selectedCycle]);
  const originCountry = useMemo(
    () => countries.find((c) => c.id === form.countryOfOriginId),
    [countries, form.countryOfOriginId],
  );
  const addressCountry = useMemo(
    () => countries.find((c) => c.id === address.countryId),
    [countries, address.countryId],
  );
  const filteredSubjects = useMemo(() => {
    const q = subjectSearch.trim().toLowerCase();
    return q
      ? subjects.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.code ?? "").toLowerCase().includes(q) ||
            (s.category ?? "").toLowerCase().includes(q),
        )
      : subjects;
  }, [subjects, subjectSearch]);
  const groupedSubjects = useMemo(
    () =>
      Object.entries(
        filteredSubjects.reduce<Record<string, Ref[]>>((groups, s) => {
          const key = s.category || "Other subjects";
          (groups[key] ??= []).push(s);
          return groups;
        }, {}),
      ).sort(([a], [b]) => a.localeCompare(b)),
    [filteredSubjects],
  );
  const set = (key: keyof FormState, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));
  function updateSittingMeta(
    sittingNumber: 1 | 2,
    patch: Partial<SittingMeta>,
  ) {
    setSittingMeta((current) => ({
      ...current,
      [sittingNumber]: { ...current[sittingNumber], ...patch },
    }));
    setOlevel((rows) =>
      rows.map((row) =>
        row.sittingNumber === sittingNumber ? { ...row, ...patch } : row,
      ),
    );
  }
  function restoreOLevelDraft(value: unknown) {
    if (!Array.isArray(value)) return;
    const rows = value as typeof olevel;
    setOlevel(rows);
    setSittingMeta((current) => {
      const next = { ...current };
      ([1, 2] as const).forEach((sittingNumber) => {
        const row = rows.find((item) => item.sittingNumber === sittingNumber);
        if (row) {
          next[sittingNumber] = {
            ...next[sittingNumber],
            authorityId: row.authorityId ?? "",
            examTypeId: row.examTypeId ?? "",
            examYear: row.examYear || new Date().getFullYear(),
            candidateCategory: row.candidateCategory ?? "",
            candidateNumber: row.candidateNumber ?? "",
            examinationNumber: row.examinationNumber ?? "",
            centreNumber: row.centreNumber ?? "",
          };
        }
      });
      return next;
    });
  }
  const subjectCountBySitting = useMemo(
    () => ({
      1: olevel.filter((row) => row.sittingNumber === 1 && row.subjectId)
        .length,
      2: olevel.filter((row) => row.sittingNumber === 2 && row.subjectId)
        .length,
    }),
    [olevel],
  );
  function loadExamTypes(authorityId: string) {
    if (!authorityId || examTypesByAuthority[authorityId]) return;
    apiClient
      .get<ExamType[]>(
        `/admissions/public/reference/examination-types?authorityId=${encodeURIComponent(authorityId)}`,
      )
      .then((items) =>
        setExamTypesByAuthority((current) => ({
          ...current,
          [authorityId]: items,
        })),
      )
      .catch(() => undefined);
  }
  function quickAddCommonSubjects() {
    const commonNames = [
      "English Language",
      "Mathematics",
      "Physics",
      "Chemistry",
      "Biology",
      "Economics",
      "Government",
      "Literature in English",
    ];
    const existing = new Set(
      olevel.map((row) => row.subjectId).filter(Boolean),
    );
    const available = commonNames.flatMap((name) => {
      const subject = subjects.find(
        (item) => item.name.toLowerCase() === name.toLowerCase(),
      );
      return subject && !existing.has(subject.id) ? [subject] : [];
    });
    if (!available.length) return;
    setOlevel((rows) => [
      ...rows,
      ...available.map((subject) => ({
        subjectId: subject.id,
        grade: "",
        authorityId: sittingMeta[secondSitting ? 2 : 1].authorityId,
        examTypeId: sittingMeta[secondSitting ? 2 : 1].examTypeId,
        examYear: sittingMeta[secondSitting ? 2 : 1].examYear,
        sittingNumber: secondSitting ? 2 : 1,
        candidateCategory: sittingMeta[secondSitting ? 2 : 1].candidateCategory,
        candidateNumber: sittingMeta[secondSitting ? 2 : 1].candidateNumber,
        examinationNumber: sittingMeta[secondSitting ? 2 : 1].examinationNumber,
        centreNumber: sittingMeta[secondSitting ? 2 : 1].centreNumber,
      })),
    ]);
  }

  useEffect(() => {
    if (!form.countryOfOriginId) {
      setOriginStates([]);
      return;
    }
    apiClient
      .get<Ref[]>(
        `/admissions/public/reference/divisions?countryId=${form.countryOfOriginId}`,
      )
      .then(setOriginStates)
      .catch(() => setOriginStates([]));
    setForm((f) => ({ ...f, stateOfOriginId: "", lgaOfOriginId: "" }));
  }, [form.countryOfOriginId]);
  useEffect(() => {
    let active = true;
    if (!form.stateOfOriginId) {
      setOriginLgas([]);
      setOriginLgaLoading(false);
      return () => {
        active = false;
      };
    }
    setOriginLgas([]);
    setOriginLgaLoading(true);
    apiClient
      .get<Ref[]>(
        `/admissions/public/reference/divisions?countryId=${encodeURIComponent(form.countryOfOriginId)}&parentId=${encodeURIComponent(form.stateOfOriginId)}`,
      )
      .then((v) => {
        if (active) setOriginLgas(v);
      })
      .catch(() => {
        if (active) setOriginLgas([]);
      })
      .finally(() => {
        if (active) setOriginLgaLoading(false);
      });
    setForm((f) => ({ ...f, lgaOfOriginId: "" }));
    return () => {
      active = false;
    };
  }, [form.countryOfOriginId, form.stateOfOriginId]);
  useEffect(() => {
    if (!address.countryId) {
      setAddressRegions([]);
      return;
    }
    apiClient
      .get<Ref[]>(
        `/admissions/public/reference/divisions?countryId=${address.countryId}`,
      )
      .then(setAddressRegions)
      .catch(() => setAddressRegions([]));
    setAddress((a) => ({ ...a, regionId: "", localAreaId: "" }));
  }, [address.countryId]);
  useEffect(() => {
    if (!passportPhoto) {
      setPassportPhotoPreview("");
      return;
    }
    const url = URL.createObjectURL(passportPhoto);
    setPassportPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [passportPhoto]);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || typeof window === "undefined") return;
    let widgetId: string | undefined;
    const render = () => {
      const host = document.getElementById("admissions-turnstile");
      if (!host || !window.turnstile || widgetId) return;
      widgetId = window.turnstile.render(host, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: setHumanVerificationToken,
        "expired-callback": () => setHumanVerificationToken(""),
        "error-callback": () => setHumanVerificationToken(""),
      });
      window.clearInterval(intervalId);
    };
    const intervalId = window.setInterval(render, 250);
    const existing = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]',
    );
    if (existing) render();
    else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      script.onload = render;
      document.head.appendChild(script);
    }
    return () => {
      window.clearInterval(intervalId);
      if (widgetId && window.turnstile) window.turnstile.reset(widgetId);
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (!address.regionId) {
      setAddressLgas([]);
      setAddressLgaLoading(false);
      return () => {
        active = false;
      };
    }
    setAddressLgas([]);
    setAddressLgaLoading(true);
    apiClient
      .get<Ref[]>(
        `/admissions/public/reference/divisions?countryId=${encodeURIComponent(address.countryId)}&parentId=${encodeURIComponent(address.regionId)}`,
      )
      .then((v) => {
        if (active) setAddressLgas(v);
      })
      .catch(() => {
        if (active) setAddressLgas([]);
      })
      .finally(() => {
        if (active) setAddressLgaLoading(false);
      });
    setAddress((a) => ({ ...a, localAreaId: "" }));
    return () => {
      active = false;
    };
  }, [address.countryId, address.regionId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(
      "uniportal.admissions.draftToken",
    );
    if (!stored) return;
    setDraftToken(stored);
    apiClient
      .post<{
        draftToken: string;
        payload: Record<string, unknown>;
        expiresAt: string;
      }>("/admissions/public/draft/load", { draftToken: stored })
      .then((d) => {
        const p = d.payload;
        setForm(
          (f) =>
            ({
              ...f,
              ...Object.fromEntries(Object.entries(p).filter(([k]) => k in f)),
            }) as FormState,
        );
        if (p.address) setAddress(p.address as typeof address);
        if (p.guardian) setGuardian(p.guardian as typeof guardian);
        if (p.emergencyContact)
          setEmergencyContact(p.emergencyContact as typeof emergencyContact);
        if (Array.isArray(p.previousEducation))
          setPreviousEducation(p.previousEducation as typeof previousEducation);
        if (p.sponsor) setSponsor(p.sponsor as SponsorForm);
        if (Array.isArray(p.olevel)) restoreOLevelDraft(p.olevel);
        if (typeof p.sittingMeta === "object" && p.sittingMeta)
          setSittingMeta(p.sittingMeta as Record<1 | 2, SittingMeta>);
        if (typeof p.secondSitting === "boolean")
          setSecondSitting(p.secondSitting);
        setDraftStatus(
          "A saved draft was restored on this device. Sensitive fields such as NIN and support details were not stored in the draft.",
        );
      })
      .catch(() =>
        window.localStorage.removeItem("uniportal.admissions.draftToken"),
      );
  }, []);

  type ApplicationReceipt = {
    applicationNo: string;
    completionPercent: number;
    trackingToken: string;
    paymentStatus: string;
    applicationFee: {
      required: boolean;
      amount: string | number | null;
      currency: string;
    };
  };
  type PhotoPresign = {
    key: string;
    url: string;
    method: "POST";
    fields: Record<string, string>;
    maxSizeBytes: number;
  };
  async function saveDraft() {
    setDraftBusy(true);
    setDraftStatus("Saving a secure draft…");
    try {
      const snapshot = {
        ...form,
        nin: undefined,
        ninConsentAccepted: undefined,
        privacyNoticeAccepted: undefined,
        declarationAccepted: undefined,
        supportRequested: undefined,
        supportAreas: undefined,
        requestedAdjustments: undefined,
        supportDescription: undefined,
        preferredContactMethod: undefined,
        preferredFormat: undefined,
        supportConsentAccepted: undefined,
        address,
        guardian,
        emergencyContact,
        sponsor,
        previousEducation,
        olevel,
        sittingMeta,
        secondSitting,
      };
      const saved = await apiClient.post<{
        draftToken: string;
        expiresAt: string;
      }>("/admissions/public/draft/save", {
        draftToken: draftToken || undefined,
        payload: snapshot,
      });
      setDraftToken(saved.draftToken);
      window.localStorage.setItem(
        "uniportal.admissions.draftToken",
        saved.draftToken,
      );
      setDraftStatus(
        `Draft saved. It can be resumed for 7 days with the private draft credential.`,
      );
    } catch (e) {
      setDraftStatus(
        e instanceof ApiClientError
          ? e.message
          : "Draft could not be saved. Your current form remains on this device.",
      );
    } finally {
      setDraftBusy(false);
    }
  }
  async function resumeDraft() {
    if (!draftToken.trim()) {
      setDraftStatus("Enter a draft credential first.");
      return;
    }
    setDraftBusy(true);
    try {
      const d = await apiClient.post<{
        draftToken: string;
        payload: Record<string, unknown>;
        expiresAt: string;
      }>("/admissions/public/draft/load", { draftToken: draftToken.trim() });
      const p = d.payload;
      setForm(
        (f) =>
          ({
            ...f,
            ...Object.fromEntries(Object.entries(p).filter(([k]) => k in f)),
          }) as FormState,
      );
      if (p.address) setAddress(p.address as typeof address);
      if (p.guardian) setGuardian(p.guardian as typeof guardian);
      if (p.emergencyContact)
        setEmergencyContact(p.emergencyContact as typeof emergencyContact);
      if (Array.isArray(p.previousEducation))
        setPreviousEducation(p.previousEducation as typeof previousEducation);
      if (p.sponsor) setSponsor(p.sponsor as SponsorForm);
      if (Array.isArray(p.olevel)) restoreOLevelDraft(p.olevel);
      if (typeof p.sittingMeta === "object" && p.sittingMeta)
        setSittingMeta(p.sittingMeta as Record<1 | 2, SittingMeta>);
      if (typeof p.secondSitting === "boolean")
        setSecondSitting(p.secondSitting);
      window.localStorage.setItem(
        "uniportal.admissions.draftToken",
        d.draftToken,
      );
      setDraftStatus(
        "Draft restored. Please re-enter any sensitive information and choose a new passport photograph.",
      );
    } catch (e) {
      setDraftStatus(
        e instanceof ApiClientError
          ? e.message
          : "Draft could not be restored. Check the credential and try again.",
      );
    } finally {
      setDraftBusy(false);
    }
  }
  function selectPassportPhoto(file: File | null, preSubmit = true) {
    setPhotoMessage("");
    setPhotoProof("");
    if (!file) {
      setPassportPhoto(null);
      return;
    }
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setPassportPhoto(null);
      setPhotoMessage("Choose a JPEG or PNG passport photograph.");
      return;
    }
    if (file.size < 1 || file.size > 2 * 1024 * 1024) {
      setPassportPhoto(null);
      setPhotoMessage("The passport photograph must be smaller than 2 MiB.");
      return;
    }
    setPassportPhoto(file);
    if (preSubmit) void prepareApplicantPhoto(file);
  }
  async function prepareApplicantPhoto(file: File) {
    setPhotoUploading(true);
    setPhotoMessage("Preparing secure photograph upload…");
    const key = crypto.randomUUID();
    setSubmissionKey(key);
    try {
      const presign = await apiClient.post<PhotoPresign>(
        "/admissions/public/photo/pre-submit/presign",
        { idempotencyKey: key, contentType: file.type, sizeBytes: file.size },
      );
      const body = new FormData();
      Object.entries(presign.fields).forEach(([field, value]) =>
        body.append(field, value),
      );
      body.append("file", file);
      const upload = await fetch(presign.url, { method: "POST", body });
      if (!upload.ok)
        throw new Error("Private photograph storage rejected the upload.");
      const verified = await apiClient.post<{ proof: string }>(
        "/admissions/public/photo/pre-submit/complete",
        {
          idempotencyKey: key,
          key: presign.key,
          contentType: file.type,
          sizeBytes: file.size,
        },
      );
      setPhotoProof(verified.proof);
      setPhotoMessage("Photograph verified and ready for submission.");
    } catch (e) {
      setPhotoProof("");
      setPhotoMessage(
        e instanceof ApiClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Photograph upload could not be completed. Please choose the file again or retry.",
      );
    } finally {
      setPhotoUploading(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (TURNSTILE_SITE_KEY && !humanVerificationToken) {
      setError("Complete the human verification challenge before submitting.");
      return;
    }
    if (!passportPhoto || !photoProof) {
      setError(
        "Choose a valid passport photograph and wait until it is verified before submitting.",
      );
      return;
    }
    if (photoUploading) {
      setError("Please wait for the passport photograph to finish verifying.");
      return;
    }
    if (!form.declarationAccepted) {
      setError(
        "Please agree to the candidate terms and conditions before submitting.",
      );
      return;
    }
    if (!form.privacyNoticeAccepted) {
      setError(
        "Please acknowledge the institutional privacy notice before submitting.",
      );
      return;
    }
    if (form.nin && !form.ninConsentAccepted) {
      setError(
        "Please acknowledge the NIN privacy notice or leave the NIN blank.",
      );
      return;
    }
    if (!form.countryOfOriginId) {
      setError("Select your country of origin.");
      return;
    }
    if (
      sponsor.sponsorType !== "SELF_FUNDED" &&
      !sponsor.sameAsGuardian &&
      !sponsor.fullName.trim() &&
      !sponsor.organization.trim()
    ) {
      setError("Provide the sponsor's name or sponsoring organisation.");
      return;
    }
    if (
      sponsor.sponsorType !== "SELF_FUNDED" &&
      sponsor.sameAsGuardian &&
      !guardian.fullName.trim()
    ) {
      setError(
        "Enter the parent/guardian details before reusing them as sponsor.",
      );
      return;
    }
    if (
      originCountry?.iso2 === "NG" &&
      (!form.stateOfOriginId || !form.lgaOfOriginId)
    ) {
      setError("Select your Nigerian state and LGA of origin.");
      return;
    }
    if (!reviewing) {
      setReviewing(true);
      setError(
        "Review your application below, then select “Confirm and submit” when everything is correct.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiClient.post<ApplicationReceipt>(
        "/admissions/apply",
        {
          ...form,
          website: website || undefined,
          humanVerificationToken: humanVerificationToken || undefined,
          nin: form.nin || undefined,
          ninConsentAccepted: form.nin ? form.ninConsentAccepted : undefined,
          privacyNoticeAccepted: true,
          passportPhotoProof: photoProof,
          admissionDetails: form.admissionDetails,
          supportRequested: form.supportRequested || undefined,
          supportAreas: form.supportRequested ? form.supportAreas : undefined,
          requestedAdjustments: form.supportRequested
            ? form.requestedAdjustments
            : undefined,
          supportDescription: form.supportRequested
            ? form.supportDescription || undefined
            : undefined,
          preferredContactMethod: form.supportRequested
            ? form.preferredContactMethod || undefined
            : undefined,
          preferredFormat: form.supportRequested
            ? form.preferredFormat || undefined
            : undefined,
          supportConsentAccepted: form.supportRequested
            ? form.supportConsentAccepted
            : undefined,
          middleName: form.middleName || undefined,
          stateOfOrigin: form.stateOfOrigin || undefined,
          lga: form.lga || undefined,
          programmeChoice2Id: form.programmeChoice2Id || undefined,
          programmeChoice3Id: form.programmeChoice3Id || undefined,
          jambRegNo: form.jambRegNo || undefined,
          jambScore: form.jambScore ? Number(form.jambScore) : undefined,
          residentialAddress: address.line1
            ? {
                line1: address.line1,
                city: address.city,
                countryId: address.countryId,
                regionId: address.regionId || undefined,
                localAreaId: address.localAreaId || undefined,
                state: address.regionName || undefined,
                lga: address.localAreaName || undefined,
              }
            : undefined,
          guardian: guardian.fullName ? guardian : undefined,
          emergencyContact: emergencyContact.fullName
            ? emergencyContact
            : undefined,
          sponsor:
            sponsor.sponsorType === "SELF_FUNDED"
              ? { sponsorType: "SELF_FUNDED" }
              : {
                  sponsorType: sponsor.sponsorType,
                  sameAsGuardian: sponsor.sameAsGuardian,
                  fullName: sponsor.sameAsGuardian
                    ? undefined
                    : sponsor.fullName || undefined,
                  relationship: sponsor.sameAsGuardian
                    ? undefined
                    : sponsor.relationship || undefined,
                  phone: sponsor.sameAsGuardian
                    ? undefined
                    : sponsor.phone || undefined,
                  email: sponsor.sameAsGuardian
                    ? undefined
                    : sponsor.email || undefined,
                  organization: sponsor.organization || undefined,
                  address: sponsor.address || undefined,
                  sponsorshipReference:
                    sponsor.sponsorshipReference || undefined,
                },
          previousEducation: previousEducation
            .filter((e) => e.institution.trim() && e.qualification.trim())
            .map((e) => ({
              ...e,
              startYear: e.startYear ? Number(e.startYear) : undefined,
              endYear: e.endYear ? Number(e.endYear) : undefined,
            })),
          oLevelResults: olevel
            .map((r) => {
              const meta = sittingMeta[r.sittingNumber as 1 | 2];
              const authorityCode = authorities.find(
                (a) => a.id === meta?.authorityId,
              )?.code;
              return {
                subjectId: r.subjectId,
                grade: r.grade,
                examType:
                  authorityCode === "WAEC"
                    ? "WAEC"
                    : authorityCode === "NECO"
                      ? "NECO"
                      : authorityCode === "NABTEB"
                        ? "NABTEB"
                        : authorityCode === "NBAIS"
                          ? "NBAIS"
                          : "GCE",
                examinationAuthorityId: meta?.authorityId || undefined,
                examinationTypeId: meta?.examTypeId || undefined,
                candidateCategory: meta?.candidateCategory || undefined,
                candidateNumber: meta?.candidateNumber || undefined,
                examinationNumber: meta?.examinationNumber || undefined,
                centreNumber: meta?.centreNumber || undefined,
                examYear: meta?.examYear || r.examYear,
                sittingNumber: r.sittingNumber,
                subject: subjects.find((s) => s.id === r.subjectId)?.name || "",
              };
            })
            .filter(
              (r) =>
                r.subjectId &&
                r.grade &&
                r.examinationAuthorityId &&
                r.examinationTypeId,
            ),
        },
        { idempotencyKey: submissionKey },
      );
      setSuccess(result);
    } catch (e) {
      setError(
        e instanceof ApiClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Application could not be submitted. Your data was not confirmed as saved; please retry safely.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitChangeRequest() {
    if (!success || changeReason.trim().length < 5) {
      setChangeStatus(
        "Enter at least five characters explaining the correction or withdrawal request.",
      );
      return;
    }
    setChangeBusy(true);
    setChangeStatus("");
    try {
      const result = await apiClient.post<{ message: string }>(
        "/admissions/public/change-request",
        {
          applicationNo: success.applicationNo,
          trackingToken: success.trackingToken,
          requestType: changeType,
          reason: changeReason.trim(),
        },
      );
      setChangeStatus(result.message);
      setChangeReason("");
    } catch (e) {
      setChangeStatus(
        e instanceof ApiClientError
          ? e.message
          : "The request could not be submitted. Please try again.",
      );
    } finally {
      setChangeBusy(false);
    }
  }
  async function uploadApplicantPhoto(file: File, receipt: ApplicationReceipt) {
    setPhotoMessage("");
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setPhotoMessage("Choose a JPEG or PNG passport photograph.");
      return;
    }
    if (file.size < 1 || file.size > 2 * 1024 * 1024) {
      setPhotoMessage("The passport photograph must be smaller than 2 MiB.");
      return;
    }
    setPhotoUploading(true);
    try {
      const presign = await apiClient.post<{
        key: string;
        url: string;
        method: "POST";
        fields: Record<string, string>;
        maxSizeBytes: number;
      }>("/admissions/public/photo/presign", {
        applicationNo: receipt.applicationNo,
        trackingToken: receipt.trackingToken,
        contentType: file.type,
        sizeBytes: file.size,
      });
      const body = new FormData();
      Object.entries(presign.fields).forEach(([key, value]) =>
        body.append(key, value),
      );
      body.append("file", file);
      const upload = await fetch(presign.url, { method: "POST", body });
      if (!upload.ok)
        throw new Error("Private photograph storage rejected the upload.");
      await apiClient.post("/admissions/public/photo/complete", {
        applicationNo: receipt.applicationNo,
        trackingToken: receipt.trackingToken,
        key: presign.key,
        contentType: file.type,
        sizeBytes: file.size,
        originalFileName: file.name,
      });
      setPhotoMessage(
        "Passport photograph uploaded successfully and queued for admissions review.",
      );
    } catch (e) {
      setPhotoMessage(
        e instanceof ApiClientError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Application submitted, but the passport photograph upload could not be completed. Please retry below.",
      );
    } finally {
      setPhotoUploading(false);
    }
  }

  if (success)
    return (
      <main className="min-h-screen bg-background px-4 py-10">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Application submitted successfully</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Your application has been received. Keep your application number
              safe.
            </p>
            <div className="rounded-lg border p-4 text-center">
              <div className="text-xs text-muted-foreground">
                Application number
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold">
                {success.applicationNo}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Completion recorded: {success.completionPercent}%
              </div>
              {success.applicationFee.required ? (
                <div className="mt-2 text-sm text-amber-800">
                  Payment status: <strong>{success.paymentStatus}</strong>.
                  Follow the official Admissions payment instructions.
                </div>
              ) : (
                <div className="mt-2 text-sm text-green-700">
                  No application fee is required for this cycle.
                </div>
              )}
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                Private tracking credential
              </div>
              <div className="mt-2 break-all font-mono text-xs text-amber-950">
                {success.trackingToken}
              </div>
              <p className="mt-2 text-sm text-amber-900">
                Save this credential securely. It will not be shown again and is
                required with your application number to check status.
              </p>
            </div>
            <section className="rounded-lg border p-4">
              <h2 className="font-semibold">Passport photograph</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                The photograph is uploaded privately and reviewed by Admissions.
              </p>
              <label className="mt-3 block text-sm font-medium">
                Replace photograph
                <input
                  className="mt-2 block w-full text-sm"
                  type="file"
                  accept="image/jpeg,image/png"
                  disabled={photoUploading}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0] ?? null;
                    e.currentTarget.value = "";
                    if (file) {
                      selectPassportPhoto(file, false);
                      void uploadApplicantPhoto(file, success);
                    }
                  }}
                />
              </label>
              {passportPhotoPreview && (
                <img
                  src={passportPhotoPreview}
                  alt="Selected passport photograph"
                  className="mt-3 h-32 w-28 rounded-md border object-cover"
                />
              )}
              {photoUploading && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Uploading securely…
                </p>
              )}
              {photoMessage && (
                <p className="mt-2 text-sm" role="status">
                  {photoMessage}
                </p>
              )}
            </section>
            <section className="rounded-lg border p-4">
              <h2 className="font-semibold">Need to correct or withdraw?</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Use your application number and private tracking credential
                above. Admissions will review the request; do not include NIN,
                passwords, or payment-card details.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
                <select
                  value={changeType}
                  onChange={(e) =>
                    setChangeType(e.target.value as "CORRECTION" | "WITHDRAWAL")
                  }
                  className="flex h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="CORRECTION">Request correction</option>
                  <option value="WITHDRAWAL">Request withdrawal</option>
                </select>
                <textarea
                  maxLength={500}
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Explain what needs attention"
                  className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <Button
                type="button"
                className="mt-3"
                variant="outline"
                disabled={changeBusy}
                onClick={() => void submitChangeRequest()}
              >
                Send request
              </Button>
              {changeStatus && (
                <p className="mt-2 text-sm" role="status" aria-live="polite">
                  {changeStatus}
                </p>
              )}
            </section>
          </CardContent>
        </Card>
      </main>
    );
  const selectClass =
    "mt-1 flex h-10 w-full rounded-md border bg-background px-3 text-sm";
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="enterprise-eyebrow">UniPortal Admissions</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                University Admission Application
              </h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                Complete the guided application at your own pace. Use
                standardized information where available and save a private
                draft if you need to return later.
              </p>
            </div>
            <div className="rounded-xl border bg-card px-3 py-2 text-right text-xs text-muted-foreground">
              <strong className="block text-foreground">
                Secure application
              </strong>
              <span>Private · resumable · review before submission</span>
            </div>
          </div>
        </header>
        <nav
          className="glass-accent sticky top-4 z-20 rounded-xl p-3"
          aria-label="Application progress"
        >
          <ol className="grid gap-3 sm:grid-cols-4">
            {[
              ["1", "Plan", "Cycle & choices"],
              ["2", "Tell us about you", "Identity & contact"],
              ["3", "Add evidence", "Education & results"],
              ["4", "Review", "Consent & submit"],
            ].map(([number, title, description]) => (
              <li key={number} className="flex items-start gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[--color-primary]/10 text-xs font-bold text-[--color-primary]">
                  {number}
                </span>
                <span>
                  <strong className="block text-xs">{title}</strong>
                  <span className="text-[11px] leading-4 text-muted-foreground">
                    {description}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </nav>
        <section
          className="rounded-lg border bg-muted/30 p-4"
          aria-labelledby="draft-heading"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <h2 id="draft-heading" className="font-semibold">
                Save and resume later
              </h2>
              <p className="mt-1 text-sm leading-5 text-foreground/75">
                Save a private seven-day draft credential. NIN, photograph
                proofs, consent checkboxes, and accessibility details are
                deliberately excluded and must be entered again.
              </p>
              <Label htmlFor="draft-token" className="sr-only">
                Draft credential
              </Label>
              <Input
                id="draft-token"
                className="mt-2"
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                placeholder="Paste a saved draft credential to resume"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={draftBusy}
                onClick={() => void saveDraft()}
              >
                Save draft
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={draftBusy || !draftToken.trim()}
                onClick={() => void resumeDraft()}
              >
                Resume draft
              </Button>
            </div>
          </div>
          {draftStatus && (
            <p className="mt-3 text-sm" role="status" aria-live="polite">
              {draftStatus}
            </p>
          )}
        </section>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Application details</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p>Loading application options…</p>
            ) : loadError ? (
              <div className="space-y-3" role="alert">
                <p>{loadError}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLoadAttempt((n) => n + 1)}
                >
                  Retry loading application options
                </Button>
              </div>
            ) : cycles.length === 0 ? (
              <p>
                No admission cycle is currently open. Please check back when the
                next admission window is announced.
              </p>
            ) : (
              <form onSubmit={submit} className="space-y-7">
                <section className="scroll-mt-24 grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Admission cycle</Label>
                    <select
                      required
                      value={form.admissionCycleId}
                      onChange={(e) => set("admissionCycleId", e.target.value)}
                      className={selectClass}
                    >
                      <option value="">Select cycle</option>
                      {cycles.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.cycleName} — {c.academicYear} ({c.admissionType})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Admission type</Label>
                    <Input
                      value={selectedCycle?.admissionType ?? ""}
                      readOnly
                      className="mt-1"
                    />
                  </div>
                </section>
                {selectedCycle?.applicationFeeRequired && (
                  <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <h2 className="font-semibold">Application fee</h2>
                    <p className="mt-1 text-sm">
                      Configured application fee:{" "}
                      <strong>
                        {selectedCycle.applicationFeeCurrency}{" "}
                        {selectedCycle.applicationFeeAmount ??
                          "To be announced"}
                      </strong>
                      .
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Payment is tracked separately from academic eligibility.
                      Follow the official payment instructions supplied by the
                      Admissions Office and keep the receipt reference.
                    </p>
                  </section>
                )}
                <section className="scroll-mt-24">
                  <h2 className="mb-3 font-semibold">Personal information</h2>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <Label>First name</Label>
                      <Input
                        required
                        value={form.firstName}
                        onChange={(e) => set("firstName", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Last name</Label>
                      <Input
                        required
                        value={form.lastName}
                        onChange={(e) => set("lastName", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Middle name</Label>
                      <Input
                        value={form.middleName}
                        onChange={(e) => set("middleName", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Date of birth</Label>
                      <Input
                        required
                        type="date"
                        value={form.dateOfBirth}
                        onChange={(e) => set("dateOfBirth", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Gender</Label>
                      <select
                        required
                        value={form.gender}
                        onChange={(e) => set("gender", e.target.value)}
                        className={selectClass}
                      >
                        <option value="">Select</option>
                        <option>Female</option>
                        <option>Male</option>
                        <option>Prefer not to say</option>
                      </select>
                    </div>
                    <div>
                      <Label>Nationality</Label>
                      <select
                        required
                        value={form.countryOfOriginId}
                        onChange={(e) => {
                          const c = countries.find(
                            (x) => x.id === e.target.value,
                          );
                          set("countryOfOriginId", e.target.value);
                          set("stateOfOriginId", "");
                          set("lgaOfOriginId", "");
                          set("stateOfOrigin", "");
                          set("lga", "");
                          set(
                            "nationality",
                            c?.iso2 === "NG" ? "Nigerian" : (c?.name ?? ""),
                          );
                        }}
                        className={selectClass}
                      >
                        <option value="">Select country</option>
                        {countries.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>State / Province / Region of origin</Label>
                      {originStates.length > 0 ? (
                        <select
                          value={form.stateOfOriginId}
                          onChange={(e) =>
                            set("stateOfOriginId", e.target.value)
                          }
                          className={selectClass}
                        >
                          <option value="">Select region</option>
                          {originStates.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          placeholder="Enter region only when no standardized list exists"
                          value={form.stateOfOrigin}
                          onChange={(e) => set("stateOfOrigin", e.target.value)}
                        />
                      )}
                    </div>
                    {originCountry?.iso2 === "NG" ? (
                      <div>
                        <Label>LGA of origin</Label>
                        <select
                          required
                          disabled={originLgaLoading || !form.stateOfOriginId}
                          value={form.lgaOfOriginId}
                          onChange={(e) => set("lgaOfOriginId", e.target.value)}
                          className={selectClass}
                        >
                          <option value="">
                            {originLgaLoading
                              ? "Loading LGAs…"
                              : originLgas.length
                                ? "Select LGA"
                                : "No LGAs found"}
                          </option>
                          {originLgas.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <Label>Local administrative area (optional)</Label>
                        <Input
                          placeholder="Enter only when required"
                          value={form.lga}
                          onChange={(e) => set("lga", e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </section>
                <section className="rounded-lg border p-4">
                  <h2 className="font-semibold">Identity verification</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Your NIN is optional. If supplied, it is collected under the
                    Nigeria Data Protection Act 2023 for admission identity
                    verification only, encrypted at rest, access-controlled, and
                    not displayed in public tracking responses. Do not enter a
                    NIN belonging to another person.
                  </p>
                  <div className="mt-4 max-w-md">
                    <Label htmlFor="nin">
                      National Identification Number (NIN) — optional
                    </Label>
                    <Input
                      id="nin"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={11}
                      pattern="[0-9]{11}"
                      placeholder="11-digit NIN"
                      value={form.nin}
                      onChange={(e) =>
                        set("nin", e.target.value.replace(/\D/g, ""))
                      }
                    />
                  </div>
                  {form.nin && (
                    <label className="mt-3 flex gap-3 text-sm">
                      <input
                        className="mt-1"
                        type="checkbox"
                        checked={form.ninConsentAccepted}
                        onChange={(e) =>
                          set("ninConsentAccepted", e.target.checked)
                        }
                      />
                      <span>
                        I consent to the collection and encrypted processing of
                        my NIN for admission identity verification only.
                      </span>
                    </label>
                  )}
                </section>
                <section className="scroll-mt-24">
                  <h2 className="mb-3 font-semibold">Contact</h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Mobile number</Label>
                      <Input
                        required
                        type="tel"
                        placeholder={
                          originCountry?.iso2 === "NG"
                            ? "08012345678 or +2348012345678"
                            : "+447911123456"
                        }
                        value={form.phone}
                        onChange={(e) => set("phone", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        required
                        type="email"
                        value={form.email}
                        onChange={(e) => set("email", e.target.value)}
                      />
                    </div>
                  </div>
                </section>
                <section className="scroll-mt-24">
                  <h2 className="mb-3 font-semibold">Programme choices</h2>
                  <div className="grid gap-4 md:grid-cols-3">
                    {(
                      [
                        "programmeChoice1Id",
                        "programmeChoice2Id",
                        "programmeChoice3Id",
                      ] as const
                    ).map((key, i) => (
                      <div key={key}>
                        <Label>
                          {i === 0
                            ? "First choice"
                            : `${i + 1}${i === 1 ? "nd" : "rd"} choice`}{" "}
                          {i === 0 ? "*" : "(optional)"}
                        </Label>
                        <select
                          required={i === 0}
                          value={form[key]}
                          onChange={(e) => set(key, e.target.value)}
                          className={selectClass}
                        >
                          <option value="">Select programme</option>
                          {programmes.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} — {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </section>
                {requirement && (
                  <section className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                    <h2 className="font-semibold">
                      What you may need for this programme
                    </h2>
                    <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                      {requirement.minUtmeScore !== null && (
                        <p>
                          Minimum UTME score:{" "}
                          <strong>{requirement.minUtmeScore}</strong>
                        </p>
                      )}
                      {requirement.minOLevelCredits !== null && (
                        <p>
                          Minimum O’Level credits:{" "}
                          <strong>{requirement.minOLevelCredits}</strong>
                        </p>
                      )}
                      {requirement.maxOLevelSittings !== null && (
                        <p>
                          Maximum O’Level sittings:{" "}
                          <strong>{requirement.maxOLevelSittings}</strong>
                        </p>
                      )}
                      {requirement.requireEnglish && (
                        <p>English Language credit required.</p>
                      )}
                      {requirement.requireMathematics && (
                        <p>Mathematics credit required.</p>
                      )}
                      {requirement.minAge !== null && (
                        <p>
                          Minimum age: <strong>{requirement.minAge}</strong>
                        </p>
                      )}
                      {requirement.requiredDocuments?.map((document) => (
                        <p key={document}>
                          Document: <strong>{document}</strong>
                        </p>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      These are configured programme requirements. The
                      Admissions Office may request verification or additional
                      evidence according to the active policy.
                    </p>
                  </section>
                )}
                {selectedCycle && selectedCycle.admissionType !== "UTME" && (
                  <section className="rounded-lg border p-4">
                    <h2 className="font-semibold">
                      {selectedCycle.admissionType === "DE"
                        ? "Direct Entry details"
                        : selectedCycle.admissionType === "TRANSFER"
                          ? "Transfer details"
                          : selectedCycle.admissionType === "POSTGRADUATE"
                            ? "Postgraduate details"
                            : selectedCycle.admissionType === "INTERNATIONAL"
                              ? "International applicant details"
                              : "Study preference"}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Enter only the information relevant to this admission
                      route. The Admissions Office may request supporting
                      documents later.
                    </p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {["DE", "POSTGRADUATE"].includes(
                        selectedCycle.admissionType,
                      ) && (
                        <>
                          <div>
                            <Label>Highest qualification</Label>
                            <Input
                              required
                              value={form.admissionDetails.highestQualification}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  admissionDetails: {
                                    ...f.admissionDetails,
                                    highestQualification: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label>Awarding institution</Label>
                            <Input
                              required
                              value={form.admissionDetails.awardingInstitution}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  admissionDetails: {
                                    ...f.admissionDetails,
                                    awardingInstitution: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label>Graduation year</Label>
                            <Input
                              type="number"
                              min={1950}
                              max={2100}
                              required={selectedCycle.admissionType === "DE"}
                              value={form.admissionDetails.graduationYear}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  admissionDetails: {
                                    ...f.admissionDetails,
                                    graduationYear: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                        </>
                      )}
                      {selectedCycle.admissionType === "POSTGRADUATE" && (
                        <div className="md:col-span-2">
                          <Label>Research interest (optional)</Label>
                          <textarea
                            maxLength={500}
                            value={form.admissionDetails.researchInterest}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                admissionDetails: {
                                  ...f.admissionDetails,
                                  researchInterest: e.target.value,
                                },
                              }))
                            }
                            className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                          />
                        </div>
                      )}
                      {selectedCycle.admissionType === "TRANSFER" && (
                        <>
                          <div>
                            <Label>Previous institution</Label>
                            <Input
                              required
                              value={form.admissionDetails.previousInstitution}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  admissionDetails: {
                                    ...f.admissionDetails,
                                    previousInstitution: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div>
                            <Label>Previous programme</Label>
                            <Input
                              required
                              value={form.admissionDetails.previousProgramme}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  admissionDetails: {
                                    ...f.admissionDetails,
                                    previousProgramme: e.target.value,
                                  },
                                }))
                              }
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label>Reason for transfer</Label>
                            <textarea
                              required
                              maxLength={1000}
                              value={form.admissionDetails.transferReason}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  admissionDetails: {
                                    ...f.admissionDetails,
                                    transferReason: e.target.value,
                                  },
                                }))
                              }
                              className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            />
                          </div>
                        </>
                      )}
                      {selectedCycle.admissionType === "INTERNATIONAL" && (
                        <>
                          <div>
                            <Label>Travel-document status</Label>
                            <select
                              required
                              value={form.admissionDetails.travelDocumentStatus}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  admissionDetails: {
                                    ...f.admissionDetails,
                                    travelDocumentStatus: e.target.value,
                                  },
                                }))
                              }
                              className={selectClass}
                            >
                              <option value="">Select</option>
                              <option>Available</option>
                              <option>In progress</option>
                              <option>Not yet available</option>
                            </select>
                          </div>
                          <div>
                            <Label>English-proficiency evidence</Label>
                            <select
                              required
                              value={
                                form.admissionDetails.englishProficiencyStatus
                              }
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  admissionDetails: {
                                    ...f.admissionDetails,
                                    englishProficiencyStatus: e.target.value,
                                  },
                                }))
                              }
                              className={selectClass}
                            >
                              <option value="">Select</option>
                              <option>Available</option>
                              <option>Not applicable</option>
                              <option>To be provided</option>
                            </select>
                          </div>
                        </>
                      )}
                      {["SANDWICH", "REMEDIAL"].includes(
                        selectedCycle.admissionType,
                      ) && (
                        <div>
                          <Label>Study preference</Label>
                          <Input
                            required
                            value={form.admissionDetails.studyPreference}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                admissionDetails: {
                                  ...f.admissionDetails,
                                  studyPreference: e.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                      )}
                    </div>
                  </section>
                )}
                {selectedCycle?.admissionType === "UTME" && (
                  <section>
                    <h2 className="mb-3 font-semibold">JAMB / UTME</h2>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>JAMB registration number</Label>
                        <Input
                          required
                          value={form.jambRegNo}
                          onChange={(e) => set("jambRegNo", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label>UTME score</Label>
                        <Input
                          type="number"
                          min={0}
                          max={400}
                          value={form.jambScore}
                          onChange={(e) => set("jambScore", e.target.value)}
                        />
                      </div>
                    </div>
                  </section>
                )}
                <section>
                  <h2 className="mb-3 font-semibold">Residential address</h2>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="md:col-span-2">
                      <Label>Address</Label>
                      <Input
                        required
                        value={address.line1}
                        onChange={(e) =>
                          setAddress((a) => ({ ...a, line1: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>City / town</Label>
                      <Input
                        required
                        value={address.city}
                        onChange={(e) =>
                          setAddress((a) => ({ ...a, city: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Country</Label>
                      <select
                        required
                        value={address.countryId}
                        onChange={(e) =>
                          setAddress((a) => ({
                            ...a,
                            countryId: e.target.value,
                            regionId: "",
                            localAreaId: "",
                            regionName: "",
                            localAreaName: "",
                          }))
                        }
                        className={selectClass}
                      >
                        {addressCountries.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>State / Province / Region</Label>
                      {addressRegions.length > 0 ? (
                        <select
                          value={address.regionId}
                          onChange={(e) =>
                            setAddress((a) => ({
                              ...a,
                              regionId: e.target.value,
                            }))
                          }
                          className={selectClass}
                        >
                          <option value="">Select</option>
                          {addressRegions.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          placeholder="Enter region only when no standardized list exists"
                          value={address.regionName}
                          onChange={(e) =>
                            setAddress((a) => ({
                              ...a,
                              regionName: e.target.value,
                            }))
                          }
                        />
                      )}
                    </div>
                    {addressCountry?.iso2 === "NG" && (
                      <div>
                        <Label>LGA</Label>
                        <select
                          disabled={addressLgaLoading || !address.regionId}
                          value={address.localAreaId}
                          onChange={(e) =>
                            setAddress((a) => ({
                              ...a,
                              localAreaId: e.target.value,
                            }))
                          }
                          className={selectClass}
                        >
                          <option value="">
                            {addressLgaLoading
                              ? "Loading LGAs…"
                              : addressLgas.length
                                ? "Select LGA"
                                : "No LGAs found"}
                          </option>
                          {addressLgas.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </section>
                <section>
                  <h2 className="mb-3 font-semibold">Parent / guardian</h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Full name</Label>
                      <Input
                        value={guardian.fullName}
                        onChange={(e) =>
                          setGuardian((g) => ({
                            ...g,
                            fullName: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Relationship</Label>
                      <Input
                        value={guardian.relationship}
                        onChange={(e) =>
                          setGuardian((g) => ({
                            ...g,
                            relationship: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input
                        value={guardian.phone}
                        onChange={(e) =>
                          setGuardian((g) => ({ ...g, phone: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Email (optional)</Label>
                      <Input
                        type="email"
                        value={guardian.email}
                        onChange={(e) =>
                          setGuardian((g) => ({ ...g, email: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </section>
                <section className="rounded-xl border bg-muted/20 p-4">
                  <h2 className="mb-1 font-semibold">Sponsorship</h2>
                  <p className="mb-4 text-xs leading-5 text-muted-foreground">
                    Tell the University who will fund your studies. Choose
                    self-funded if no external sponsor is involved. Do not enter
                    bank-card or PIN information.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Sponsor type</Label>
                      <select
                        value={sponsor.sponsorType}
                        onChange={(e) =>
                          setSponsor((current) => ({
                            ...current,
                            sponsorType: e.target.value,
                            sameAsGuardian: false,
                          }))
                        }
                        className={selectClass}
                      >
                        <option value="SELF_FUNDED">Self-funded</option>
                        <option value="PARENT_GUARDIAN">
                          Parent or guardian
                        </option>
                        <option value="EMPLOYER">Employer</option>
                        <option value="GOVERNMENT">
                          Government sponsorship
                        </option>
                        <option value="SCHOLARSHIP">Scholarship body</option>
                        <option value="OTHER">Other sponsor</option>
                      </select>
                    </div>
                    {sponsor.sponsorType === "PARENT_GUARDIAN" && (
                      <label className="flex items-center gap-2 self-end pb-2 text-sm">
                        <input
                          type="checkbox"
                          checked={sponsor.sameAsGuardian}
                          onChange={(e) =>
                            setSponsor((current) => ({
                              ...current,
                              sameAsGuardian: e.target.checked,
                            }))
                          }
                        />
                        Use the parent/guardian details entered above
                      </label>
                    )}
                  </div>
                  {sponsor.sponsorType !== "SELF_FUNDED" && (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>
                          Contact name (optional if organisation is provided)
                        </Label>
                        <Input
                          value={sponsor.fullName}
                          disabled={sponsor.sameAsGuardian}
                          onChange={(e) =>
                            setSponsor((current) => ({
                              ...current,
                              fullName: e.target.value,
                            }))
                          }
                          placeholder="Sponsor contact person"
                        />
                      </div>
                      <div>
                        <Label>Relationship or role</Label>
                        <Input
                          value={sponsor.relationship}
                          disabled={sponsor.sameAsGuardian}
                          onChange={(e) =>
                            setSponsor((current) => ({
                              ...current,
                              relationship: e.target.value,
                            }))
                          }
                          placeholder="Parent, employer, scholarship officer…"
                        />
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <Input
                          value={sponsor.phone}
                          disabled={sponsor.sameAsGuardian}
                          onChange={(e) =>
                            setSponsor((current) => ({
                              ...current,
                              phone: e.target.value,
                            }))
                          }
                          placeholder="08012345678 or +234…"
                        />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={sponsor.email}
                          disabled={sponsor.sameAsGuardian}
                          onChange={(e) =>
                            setSponsor((current) => ({
                              ...current,
                              email: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>Organisation</Label>
                        <Input
                          value={sponsor.organization}
                          onChange={(e) =>
                            setSponsor((current) => ({
                              ...current,
                              organization: e.target.value,
                            }))
                          }
                          placeholder="Employer, agency, or scholarship body"
                        />
                      </div>
                      <div>
                        <Label>Reference number (optional)</Label>
                        <Input
                          value={sponsor.sponsorshipReference}
                          onChange={(e) =>
                            setSponsor((current) => ({
                              ...current,
                              sponsorshipReference: e.target.value,
                            }))
                          }
                          placeholder="Award or sponsorship reference"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Address (optional)</Label>
                        <Input
                          value={sponsor.address}
                          onChange={(e) =>
                            setSponsor((current) => ({
                              ...current,
                              address: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}
                </section>
                <section>
                  <h2 className="mb-3 font-semibold">Emergency contact</h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>Full name</Label>
                      <Input
                        value={emergencyContact.fullName}
                        onChange={(e) =>
                          setEmergencyContact((c) => ({
                            ...c,
                            fullName: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Relationship</Label>
                      <Input
                        value={emergencyContact.relationship}
                        onChange={(e) =>
                          setEmergencyContact((c) => ({
                            ...c,
                            relationship: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input
                        value={emergencyContact.phone}
                        onChange={(e) =>
                          setEmergencyContact((c) => ({
                            ...c,
                            phone: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Email (optional)</Label>
                      <Input
                        type="email"
                        value={emergencyContact.email}
                        onChange={(e) =>
                          setEmergencyContact((c) => ({
                            ...c,
                            email: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label>Address (optional)</Label>
                      <Input
                        value={emergencyContact.address}
                        onChange={(e) =>
                          setEmergencyContact((c) => ({
                            ...c,
                            address: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                </section>
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold">Previous education</h2>
                      <p className="text-xs text-muted-foreground">
                        Add completed schools or qualifications relevant to this
                        application.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setPreviousEducation((xs) => [
                          ...xs,
                          {
                            institution: "",
                            qualification: "",
                            programme: "",
                            startYear: "",
                            endYear: "",
                            gradeOrCgpa: "",
                            certificateNo: "",
                          },
                        ])
                      }
                    >
                      Add education
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {previousEducation.map((e, i) => (
                      <div
                        key={i}
                        className="grid gap-2 rounded-lg border p-3 md:grid-cols-2"
                      >
                        <div>
                          <Label>Institution</Label>
                          <Input
                            value={e.institution}
                            onChange={(ev) =>
                              setPreviousEducation((xs) =>
                                xs.map((x, j) =>
                                  j === i
                                    ? { ...x, institution: ev.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Qualification</Label>
                          <Input
                            value={e.qualification}
                            onChange={(ev) =>
                              setPreviousEducation((xs) =>
                                xs.map((x, j) =>
                                  j === i
                                    ? { ...x, qualification: ev.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Programme (optional)</Label>
                          <Input
                            value={e.programme}
                            onChange={(ev) =>
                              setPreviousEducation((xs) =>
                                xs.map((x, j) =>
                                  j === i
                                    ? { ...x, programme: ev.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Grade / CGPA (optional)</Label>
                          <Input
                            value={e.gradeOrCgpa}
                            onChange={(ev) =>
                              setPreviousEducation((xs) =>
                                xs.map((x, j) =>
                                  j === i
                                    ? { ...x, gradeOrCgpa: ev.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Start year (optional)</Label>
                          <Input
                            type="number"
                            min={1950}
                            max={2100}
                            value={e.startYear}
                            onChange={(ev) =>
                              setPreviousEducation((xs) =>
                                xs.map((x, j) =>
                                  j === i
                                    ? { ...x, startYear: ev.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>End year (optional)</Label>
                          <Input
                            type="number"
                            min={1950}
                            max={2100}
                            value={e.endYear}
                            onChange={(ev) =>
                              setPreviousEducation((xs) =>
                                xs.map((x, j) =>
                                  j === i
                                    ? { ...x, endYear: ev.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-lg border p-4">
                  <h2 className="font-semibold">
                    Accessibility and support needs (optional)
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Would you like the University to contact you about
                    accessibility, examination support, or reasonable
                    accommodation? This information is not used to decide
                    academic eligibility. Please describe the support needed,
                    not a diagnosis.
                  </p>
                  <label className="mt-4 flex gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.supportRequested}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          supportRequested: e.target.checked,
                          supportConsentAccepted: e.target.checked
                            ? f.supportConsentAccepted
                            : false,
                        }))
                      }
                    />
                    <span>
                      Yes, please contact me about accessibility or reasonable
                      accommodation.
                    </span>
                  </label>
                  {form.supportRequested && (
                    <div className="mt-4 space-y-4">
                      <fieldset>
                        <legend className="text-sm font-medium">
                          Support needed for
                        </legend>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {[
                            "Application form",
                            "Entrance examination",
                            "Interview",
                            "Campus visit",
                            "Communication",
                            "Other",
                          ].map((item) => (
                            <label key={item} className="flex gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={form.supportAreas.includes(item)}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    supportAreas: e.target.checked
                                      ? [...f.supportAreas, item]
                                      : f.supportAreas.filter(
                                          (x) => x !== item,
                                        ),
                                  }))
                                }
                              />
                              <span>{item}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend className="text-sm font-medium">
                          Requested adjustment
                        </legend>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {[
                            "Step-free access",
                            "Extra time or rest breaks",
                            "Reader or scribe",
                            "Sign-language interpreter",
                            "Captioning",
                            "Large print or Braille",
                            "Assistive technology",
                            "Quiet room",
                          ].map((item) => (
                            <label key={item} className="flex gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={form.requestedAdjustments.includes(
                                  item,
                                )}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    requestedAdjustments: e.target.checked
                                      ? [...f.requestedAdjustments, item]
                                      : f.requestedAdjustments.filter(
                                          (x) => x !== item,
                                        ),
                                  }))
                                }
                              />
                              <span>{item}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div>
                        <Label htmlFor="support-description">
                          Short description of support needed (optional)
                        </Label>
                        <textarea
                          id="support-description"
                          maxLength={500}
                          value={form.supportDescription}
                          onChange={(e) =>
                            set("supportDescription", e.target.value)
                          }
                          className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                          placeholder="Tell us what assistance would remove a barrier. Do not provide a diagnosis."
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="support-contact">
                            Preferred contact
                          </Label>
                          <select
                            id="support-contact"
                            value={form.preferredContactMethod}
                            onChange={(e) =>
                              set("preferredContactMethod", e.target.value)
                            }
                            className={selectClass}
                          >
                            <option value="">Select</option>
                            <option>Email</option>
                            <option>Phone</option>
                            <option>SMS</option>
                          </select>
                        </div>
                        <div>
                          <Label htmlFor="support-format">
                            Preferred format
                          </Label>
                          <select
                            id="support-format"
                            value={form.preferredFormat}
                            onChange={(e) =>
                              set("preferredFormat", e.target.value)
                            }
                            className={selectClass}
                          >
                            <option value="">Select</option>
                            <option>Plain language</option>
                            <option>Large print</option>
                            <option>Audio</option>
                            <option>Sign-language support</option>
                          </select>
                        </div>
                      </div>
                      <label className="flex gap-3 text-sm">
                        <input
                          required
                          type="checkbox"
                          checked={form.supportConsentAccepted}
                          onChange={(e) =>
                            set("supportConsentAccepted", e.target.checked)
                          }
                        />
                        <span>
                          I consent to the Accessibility/Student Support Office
                          contacting me about the support requested.
                        </span>
                      </label>
                    </div>
                  )}
                </section>
                <section className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                  <h2 className="font-semibold">
                    Candidate passport photograph
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Upload the candidate's recent passport photograph here
                    before submitting the application. Only JPEG and PNG files
                    up to 2 MiB are accepted. The file is uploaded to private
                    storage after the application number is generated and is not
                    published publicly.
                  </p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
                    <div>
                      {passportPhotoPreview ? (
                        <img
                          src={passportPhotoPreview}
                          alt="Selected candidate passport photograph"
                          className="h-36 w-32 rounded-md border object-cover"
                        />
                      ) : (
                        <div className="flex h-36 w-32 items-center justify-center rounded-md border border-dashed bg-background text-center text-xs text-muted-foreground">
                          No photograph selected
                        </div>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="passport-photo">
                        Choose passport photograph{" "}
                        <span className="text-red-600">*</span>
                      </Label>
                      <Input
                        id="passport-photo"
                        className="mt-2"
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={(e) => {
                          selectPassportPhoto(
                            e.currentTarget.files?.[0] ?? null,
                          );
                          e.currentTarget.value = "";
                        }}
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {passportPhoto
                          ? `${passportPhoto.name} · ${(passportPhoto.size / 1024).toFixed(0)} KB`
                          : "No file selected"}
                      </p>
                      {photoMessage && (
                        <p className="mt-2 text-sm text-red-700" role="alert">
                          {photoMessage}
                        </p>
                      )}
                    </div>
                  </div>
                </section>
                <section>
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="font-semibold">O'Level results</h2>
                      <p className="text-xs leading-5 text-muted-foreground">
                        Set examination details once for each sitting, then
                        enter only the subjects and grades. This prevents
                        repeated typing and keeps every subject tied to the
                        correct certificate.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={secondSitting}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          setSecondSitting(enabled);
                          if (!enabled)
                            setOlevel((rows) =>
                              rows.map((row) => ({ ...row, sittingNumber: 1 })),
                            );
                        }}
                      />
                      Add second sitting
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {([1, ...(secondSitting ? [2] : [])] as (1 | 2)[]).map(
                      (sittingNumber) => {
                        const meta = sittingMeta[sittingNumber];
                        const types =
                          examTypesByAuthority[meta.authorityId] ?? [];
                        return (
                          <div
                            key={sittingNumber}
                            className="rounded-xl border bg-muted/20 p-4"
                          >
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <h3 className="font-medium">
                                {sittingNumber === 1
                                  ? "1st sitting"
                                  : "2nd sitting"}
                              </h3>
                              <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                                {subjectCountBySitting[sittingNumber]} subjects
                              </span>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <Label>Exam body</Label>
                                <select
                                  value={meta.authorityId}
                                  onChange={(e) => {
                                    const authorityId = e.target.value;
                                    updateSittingMeta(sittingNumber, {
                                      authorityId,
                                      examTypeId: "",
                                      candidateCategory: "",
                                    });
                                    loadExamTypes(authorityId);
                                  }}
                                  className={selectClass}
                                >
                                  <option value="">Select exam body</option>
                                  {authorities.map((authority) => (
                                    <option
                                      key={authority.id}
                                      value={authority.id}
                                    >
                                      {authority.code} — {authority.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <Label>Exam type</Label>
                                <select
                                  value={meta.examTypeId}
                                  onChange={(e) =>
                                    updateSittingMeta(sittingNumber, {
                                      examTypeId: e.target.value,
                                    })
                                  }
                                  className={selectClass}
                                  disabled={!meta.authorityId}
                                >
                                  <option value="">Select exam type</option>
                                  {types.map((type) => (
                                    <option key={type.id} value={type.id}>
                                      {type.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <Label>Exam year</Label>
                                <Input
                                  type="number"
                                  min={1990}
                                  max={2100}
                                  value={meta.examYear}
                                  onChange={(e) =>
                                    updateSittingMeta(sittingNumber, {
                                      examYear:
                                        Number(e.target.value) ||
                                        new Date().getFullYear(),
                                    })
                                  }
                                />
                              </div>
                              <div>
                                <Label>Candidate category (optional)</Label>
                                <Input
                                  value={meta.candidateCategory}
                                  onChange={(e) =>
                                    updateSittingMeta(sittingNumber, {
                                      candidateCategory: e.target.value,
                                    })
                                  }
                                  placeholder="School candidate, private…"
                                />
                              </div>
                              <div>
                                <Label>Candidate number (optional)</Label>
                                <Input
                                  value={meta.candidateNumber}
                                  onChange={(e) =>
                                    updateSittingMeta(sittingNumber, {
                                      candidateNumber: e.target.value,
                                    })
                                  }
                                  placeholder="As printed on result slip"
                                />
                              </div>
                              <div>
                                <Label>Examination number (optional)</Label>
                                <Input
                                  value={meta.examinationNumber}
                                  onChange={(e) =>
                                    updateSittingMeta(sittingNumber, {
                                      examinationNumber: e.target.value,
                                    })
                                  }
                                  placeholder="Certificate exam number"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <Label>
                                  Examination centre number (optional)
                                </Label>
                                <Input
                                  value={meta.centreNumber}
                                  onChange={(e) =>
                                    updateSittingMeta(sittingNumber, {
                                      centreNumber: e.target.value,
                                    })
                                  }
                                  placeholder="Centre number on the result"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Label htmlFor="subject-search">Find a subject</Label>
                    <Input
                      id="subject-search"
                      value={subjectSearch}
                      onChange={(e) => setSubjectSearch(e.target.value)}
                      placeholder="Search by name, code, or category"
                      className="sm:max-w-sm"
                    />
                    <span className="text-xs text-muted-foreground">
                      {filteredSubjects.length} available in the catalogue
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={quickAddCommonSubjects}
                    >
                      Quick-add common subjects to{" "}
                      {secondSitting ? "2nd" : "1st"} sitting
                    </Button>
                    <span className="self-center text-xs text-muted-foreground">
                      English, Mathematics, sciences, Economics, Government and
                      Literature when available in the institution catalogue.
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {olevel.map((row, index) => (
                      <div
                        key={`${row.sittingNumber}-${index}`}
                        className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
                      >
                        <select
                          value={row.subjectId}
                          onChange={(e) =>
                            setOlevel((rows) =>
                              rows.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, subjectId: e.target.value }
                                  : item,
                              ),
                            )
                          }
                          className={selectClass}
                        >
                          <option value="">Select subject</option>
                          {groupedSubjects.map(([category, items]) => (
                            <optgroup key={category} label={category}>
                              {items.map((subject) => (
                                <option key={subject.id} value={subject.id}>
                                  {subject.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <select
                          value={row.grade}
                          onChange={(e) =>
                            setOlevel((rows) =>
                              rows.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, grade: e.target.value }
                                  : item,
                              ),
                            )
                          }
                          className={selectClass}
                        >
                          <option value="">Grade</option>
                          {grades.map((grade) => (
                            <option key={grade}>{grade}</option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setOlevel((rows) =>
                              rows.length > 1
                                ? rows.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  )
                                : rows,
                            )
                          }
                          aria-label="Remove subject row"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      const sittingNumber = secondSitting ? 2 : 1;
                      const meta = sittingMeta[sittingNumber];
                      setOlevel((rows) => [
                        ...rows,
                        {
                          subjectId: "",
                          grade: "",
                          authorityId: meta.authorityId,
                          examTypeId: meta.examTypeId,
                          examYear: meta.examYear,
                          sittingNumber,
                          candidateCategory: meta.candidateCategory,
                          candidateNumber: meta.candidateNumber,
                          examinationNumber: meta.examinationNumber,
                          centreNumber: meta.centreNumber,
                        },
                      ]);
                    }}
                  >
                    Add another subject
                  </Button>
                </section>

                <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <h2 className="font-semibold">
                    Candidate agreement, privacy notice, and terms
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-amber-950">
                    By submitting this application, the candidate confirms that
                    the information and documents supplied are true and
                    complete, authorises the University to verify the
                    information for admissions purposes, understands that
                    submission does not guarantee admission, and agrees to
                    comply with the University's admission regulations and
                    privacy notice.
                  </p>
                  <label className="mt-4 flex gap-3 text-sm font-medium">
                    <input
                      required
                      className="mt-1 h-4 w-4"
                      type="checkbox"
                      checked={form.declarationAccepted}
                      onChange={(e) =>
                        set("declarationAccepted", e.target.checked)
                      }
                    />
                    <span>
                      I, the candidate, have read, understood, and agree to the
                      terms and conditions above and confirm that this
                      application is submitted by me or with my authority.{" "}
                      <span className="text-red-600">*</span>
                    </span>
                  </label>
                  <label className="mt-4 flex gap-3 text-sm">
                    <input
                      required
                      className="mt-1 h-4 w-4"
                      type="checkbox"
                      checked={form.privacyNoticeAccepted}
                      onChange={(e) =>
                        set("privacyNoticeAccepted", e.target.checked)
                      }
                    />
                    <span>
                      I acknowledge the University's privacy notice and
                      understand that my application data will be used for
                      admissions administration, verification, safeguarding, and
                      legally required institutional purposes.{" "}
                      <span className="text-red-600">*</span>
                    </span>
                  </label>
                </section>
                {reviewing && (
                  <section
                    className="rounded-lg border-2 border-blue-200 bg-blue-50/50 p-4"
                    aria-labelledby="review-heading"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 id="review-heading" className="font-semibold">
                          Review before submission
                        </h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Check the summary below. You can go back and edit any
                          section before confirming.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setReviewing(false)}
                      >
                        Back to edit
                      </Button>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">Candidate</dt>
                        <dd className="font-medium">
                          {form.firstName} {form.middleName} {form.lastName}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Email</dt>
                        <dd className="font-medium">{form.email}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          Admission route
                        </dt>
                        <dd className="font-medium">
                          {selectedCycle?.admissionType} —{" "}
                          {selectedCycle?.academicYear}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          First programme choice
                        </dt>
                        <dd className="font-medium">
                          {programmes.find(
                            (p) => p.id === form.programmeChoice1Id,
                          )?.name ?? "Selected"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          Passport photograph
                        </dt>
                        <dd className="font-medium text-green-700">
                          Verified and ready
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">
                          Accessibility contact
                        </dt>
                        <dd className="font-medium">
                          {form.supportRequested
                            ? "Requested"
                            : "Not requested"}
                        </dd>
                      </div>
                    </dl>
                    <p className="mt-4 text-xs text-muted-foreground">
                      By confirming, the candidate records the current terms and
                      privacy-notice versions. Submission will create the
                      official application record and cannot be silently undone.
                    </p>
                  </section>
                )}
                {TURNSTILE_SITE_KEY && (
                  <section
                    className="rounded-lg border bg-muted/30 p-4"
                    aria-labelledby="human-verification-heading"
                  >
                    <h2
                      id="human-verification-heading"
                      className="font-semibold"
                    >
                      Human verification
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      This short privacy-conscious challenge helps protect the
                      admissions service from automated abuse. If it does not
                      load, check your connection or contact Admissions rather
                      than repeatedly submitting.
                    </p>
                    <div
                      id="admissions-turnstile"
                      className="mt-3 min-h-[65px]"
                      aria-live="polite"
                    />
                  </section>
                )}
                <label
                  htmlFor="website"
                  className="absolute left-[-10000px] h-px w-px overflow-hidden"
                >
                  Leave this field empty
                  <input
                    id="website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <p className="text-xs text-muted-foreground sm:mr-auto">
                    Your photograph must show “verified and ready” before
                    submission.
                  </p>
                  <Button
                    type="submit"
                    loading={submitting}
                    disabled={
                      !form.admissionCycleId ||
                      submitting ||
                      photoUploading ||
                      !photoProof ||
                      Boolean(TURNSTILE_SITE_KEY && !humanVerificationToken)
                    }
                  >
                    {reviewing ? "Confirm and submit" : "Review application"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
