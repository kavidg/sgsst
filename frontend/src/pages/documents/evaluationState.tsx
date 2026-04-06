import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

type AnswerValue = {
  status: string;
};

type AnswersState = Record<string, AnswerValue>;

type SectionItem = {
  code: string;
  weight: number;
};

type SectionCompliance = {
  sectionId: string;
  title: string;
  completedWeight: number;
  totalWeight: number;
  percentage: number;
};

type ValidationResult = {
  isValid: boolean;
  missingCodes: string[];
  sectionErrors: string[];
};

type DocumentsEvaluationContextValue = {
  answers: AnswersState;
  missingCodes: Set<string>;
  sectionErrors: Set<string>;
  registerSection: (sectionId: string, section: { title: string; items: SectionItem[] }) => void;
  setAnswerStatus: (code: string, status: string) => void;
  validateAll: () => ValidationResult;
  totalCompliance: SectionCompliance;
  sectionCompliance: SectionCompliance[];
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
  const [sections, setSections] = useState<Record<string, { title: string; items: SectionItem[] }>>({});
  const [missingCodes, setMissingCodes] = useState<Set<string>>(new Set());
  const [sectionErrors, setSectionErrors] = useState<Set<string>>(new Set());

  const registerSection = useCallback((sectionId: string, section: { title: string; items: SectionItem[] }) => {
    setSections((current) => ({ ...current, [sectionId]: section }));

    setAnswers((current) => {
      const next = { ...current };
      let changed = false;

      for (const item of section.items) {
        const code = item.code;
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

    const sectionErrorIds = Object.entries(sections)
      .filter(([, section]) => section.items.some((item) => missing.includes(item.code)))
      .map(([sectionId]) => sectionId);

    setMissingCodes(new Set(missing));
    setSectionErrors(new Set(sectionErrorIds));

    return {
      isValid: missing.length === 0,
      missingCodes: missing,
      sectionErrors: sectionErrorIds,
    };
  }, [answers, sections]);

  const sectionCompliance = useMemo<SectionCompliance[]>(() => {
    return Object.entries(sections).map(([sectionId, section]) => {
      const totalWeight = section.items.reduce((acc, item) => acc + item.weight, 0);
      const completedWeight = section.items.reduce((acc, item) => {
        const status = answers[item.code]?.status ?? '';
        return status === 'Cumple totalmente' ? acc + item.weight : acc;
      }, 0);

      const percentage = totalWeight === 0 ? 0 : Number(((completedWeight / totalWeight) * 100).toFixed(2));

      return {
        sectionId,
        title: section.title,
        completedWeight,
        totalWeight,
        percentage,
      };
    });
  }, [answers, sections]);

  const totalCompliance = useMemo<SectionCompliance>(() => {
    const completedWeight = sectionCompliance.reduce((acc, section) => acc + section.completedWeight, 0);
    const totalWeight = sectionCompliance.reduce((acc, section) => acc + section.totalWeight, 0);
    const percentage = totalWeight === 0 ? 0 : Number(((completedWeight / totalWeight) * 100).toFixed(2));

    return {
      sectionId: 'total',
      title: 'Cumplimiento total SG-SST',
      completedWeight,
      totalWeight,
      percentage,
    };
  }, [sectionCompliance]);

  const value = useMemo(
    () => ({
      answers,
      missingCodes,
      sectionErrors,
      registerSection,
      setAnswerStatus,
      validateAll,
      totalCompliance,
      sectionCompliance,
    }),
    [answers, missingCodes, sectionErrors, registerSection, setAnswerStatus, validateAll, totalCompliance, sectionCompliance],
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
