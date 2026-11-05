'use client';

import { createContext, useContext } from 'react';
import { makeT, type Lang, type T } from '@/i18n';

export const I18nContext = createContext<{ lang: Lang; t: T }>({ lang: 'en', t: makeT('en') });
export const useI18n = () => useContext(I18nContext);
