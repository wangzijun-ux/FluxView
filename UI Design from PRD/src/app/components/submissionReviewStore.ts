export const SUBMISSION_REVIEW_STORAGE_KEY = "fluxview-submission-reviews-v1";

export type SubmissionRank = "S" | "A" | "B" | "C" | "";

export interface SubmissionReviewEntry {
  rank: SubmissionRank;
  comment: string;
  updatedAt: string;
}

export type SubmissionReviewStore = Record<string, SubmissionReviewEntry>;

export function readSubmissionReviewStore(): SubmissionReviewStore {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(SUBMISSION_REVIEW_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as SubmissionReviewStore) : {};
  } catch {
    return {};
  }
}

export function writeSubmissionReviewStore(store: SubmissionReviewStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SUBMISSION_REVIEW_STORAGE_KEY, JSON.stringify(store));
}

export function createDefaultSubmissionReviewEntry(): SubmissionReviewEntry {
  return {
    rank: "A",
    comment: "",
    updatedAt: "",
  };
}

export function updateSubmissionReview(
  store: SubmissionReviewStore,
  recordId: string,
  patch: Partial<SubmissionReviewEntry>,
) {
  const stored = store[recordId];
  const current = {
    ...createDefaultSubmissionReviewEntry(),
    ...stored,
    rank: stored?.rank || "A",
  };

  return {
    ...store,
    [recordId]: {
      rank: patch.rank ?? current.rank,
      comment: patch.comment ?? current.comment,
      updatedAt: new Date().toISOString(),
    },
  } satisfies SubmissionReviewStore;
}
