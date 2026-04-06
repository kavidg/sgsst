import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

type AnswerValue = {
  status: string;
};

type AnswersState = Record<string, AnswerValue>;

type ValidationResult = {
  isValid: boolean;
  missingCodes: string[];
  sectionErrors: string[];
};

type DocumentsEvaluationContextValue = {
  answers: AnswersState;
  missingCodes: Set<string>;
  sectionErrors: Set<string>;
  registerSection: (sectionId: string, codes: string[]) => void;
  setAnswerStatus: (code: string, status: string) => void;
  validateAll: () => ValidationResult;
};

const STORAGE_KEY = 'sgsst-documents-answers';

const DocumentsEvaluationContext = createContext<DocumentsEvaluationContextValue | null>(null);

const loadInitialAnswers = (): AnswersState => {
  if (typeof window === 'undefined') {
    return {};
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return {};
  }

  try {
    const parsed = JSON.parse(saved) as AnswersState;
    return parsed ?? {};
  } catch {
    return {};
  }
};

export function DocumentsEvaluationProvider({ children }: { children: ReactNode }) {
  const [answers, setAnswers] = useState<AnswersState>(() => loadInitialAnswers());
  const [sectionCodes, setSectionCodes] = useState<Record<string, string[]>>({});
  const [missingCodes, setMissingCodes] = useState<Set<string>>(new Set());
  const [sectionErrors, setSectionErrors] = useState<Set<string>>(new Set());

  const registerSection = useCallback((sectionId: string, codes: string[]) => {
    setSectionCodes((current) => ({ ...current, [sectionId]: codes }));

    setAnswers((current) => {
      const next = { ...current };
      let changed = false;

      for (const code of codes) {
        if (!next[code]) {
          next[code] = { status: '' };
          changed = true;
        }
      }

      if (changed && typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }

      return changed ? next : current;
    });
  }, []);

  const setAnswerStatus = useCallback((code: string, status: string) => {
    setAnswers((current) => {
      const next = { ...current, [code]: { status } };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });

    setMissingCodes((current) => {
      const next = new Set(current);
      if (status) {
        next.delete(code);
      }
      return next;
    });
  }, []);

  const validateAll = useCallback((): ValidationResult => {
    const missing: string[] = [];

    Object.entries(answers).forEach(([code, value]) => {
      if (!value.status) {
        missing.push(code);
      }
    });

    const sectionErrorIds = Object.entries(sectionCodes)
      .filter(([, codes]) => codes.some((code) => missing.includes(code)))
      .map(([sectionId]) => sectionId);

    setMissingCodes(new Set(missing));
    setSectionErrors(new Set(sectionErrorIds));

    return {
      isValid: missing.length === 0,
      missingCodes: missing,
      sectionErrors: sectionErrorIds,
    };
  }, [answers, sectionCodes]);

  const value = useMemo(
    () => ({
      answers,
      missingCodes,
      sectionErrors,
      registerSection,
      setAnswerStatus,
      validateAll,
    }),
    [answers, missingCodes, sectionErrors, registerSection, setAnswerStatus, validateAll],
  );

  return <DocumentsEvaluationContext.Provider value={value}>{children}</DocumentsEvaluationContext.Provider>;
}

export function useDocumentsEvaluation() {
  const context = useContext(DocumentsEvaluationContext);

  if (!context) {
    throw new Error('useDocumentsEvaluation debe utilizarse dentro de DocumentsEvaluationProvider.');
  }

  return context;
}
