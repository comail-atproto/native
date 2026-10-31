// Mobile-side templates store. Mirrors the webmail's `template-store` but
// keeps the surface minimal — categories, defaults, placeholders, and the
// favourite/recent tracking are not yet exposed in the mobile UI. We persist
// the same shape so an export from one platform imports cleanly into the
// other.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { exportTemplates, importTemplates as parseTemplateImport } from '../lib/template-utils';

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  /** Body is HTML (inserted verbatim) rather than plain text. */
  isHTML?: boolean;
  category: string;
  defaultRecipients?: {
    to?: string[];
    cc?: string[];
    bcc?: string[];
  };
  identityId?: string;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'webmail:templates:v1';

interface TemplatesState {
  templates: EmailTemplate[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  addTemplate: (
    data: Pick<EmailTemplate, 'name' | 'subject' | 'body'>
      & Partial<Pick<EmailTemplate, 'category' | 'isFavorite' | 'isHTML' | 'defaultRecipients' | 'identityId'>>,
  ) => EmailTemplate;
  updateTemplate: (id: string, updates: Partial<Omit<EmailTemplate, 'id' | 'createdAt'>>) => void;
  deleteTemplate: (id: string) => void;
  exportAll: () => string;
  importTemplates: (json: string) => { count: number; error?: string };
}

function persist(state: EmailTemplate[]): void {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ templates: state })).catch((err) => {
    console.warn('[templates-store] persist failed', err);
  });
}

function genId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { templates?: EmailTemplate[] };
        if (Array.isArray(parsed.templates)) {
          set({ templates: parsed.templates, hydrated: true });
          return;
        }
      }
    } catch (err) {
      console.warn('[templates-store] hydrate failed', err);
    }
    set({ hydrated: true });
  },

  addTemplate: (data) => {
    const now = new Date().toISOString();
    const template: EmailTemplate = {
      id: genId(),
      name: data.name,
      subject: data.subject,
      body: data.body,
      category: data.category ?? '',
      isHTML: data.isHTML,
      defaultRecipients: data.defaultRecipients,
      identityId: data.identityId,
      isFavorite: data.isFavorite ?? false,
      createdAt: now,
      updatedAt: now,
    };
    const next = [...get().templates, template];
    set({ templates: next });
    persist(next);
    return template;
  },

  updateTemplate: (id, updates) => {
    const next = get().templates.map((t) =>
      t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t,
    );
    set({ templates: next });
    persist(next);
  },

  deleteTemplate: (id) => {
    const next = get().templates.filter((t) => t.id !== id);
    set({ templates: next });
    persist(next);
  },

  // Webmail export envelope (type: 'webmail-templates', exportedAt) so a
  // file exported here imports on the web and vice versa.
  exportAll: () => exportTemplates(get().templates),

  importTemplates: (json) => {
    const result = parseTemplateImport(json);
    if (result.errors.length && result.templates.length === 0) {
      return { count: 0, error: result.errors[0] };
    }
    if (result.templates.length === 0) return { count: 0 };
    const merged = [...get().templates, ...result.templates];
    set({ templates: merged });
    persist(merged);
    return { count: result.templates.length };
  },
}));
