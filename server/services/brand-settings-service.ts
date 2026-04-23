import { db } from '../db';
import { brandSettings } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from './user-context';

export interface BrandContext {
  brandName: string;
  tagline: string;
  website: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  guidelines: string;
}

const DEFAULT_BRAND: BrandContext = {
  brandName: '',
  tagline: '',
  website: '',
  primaryColor: '#9333ea',
  secondaryColor: '#4f46e5',
  accentColor: '#06b6d4',
  logoUrl: null,
  guidelines: '',
};

const cache = new Map<string, { data: BrandContext; fetchedAt: number }>();
const CACHE_TTL_MS = 60_000;

export async function getBrandContext(userId?: string): Promise<BrandContext> {
  const uid = userId ?? getCurrentUserId();
  if (!uid) {
    console.warn('[BrandContext] getBrandContext called without userId — returning empty defaults');
    return DEFAULT_BRAND;
  }

  const cached = cache.get(uid);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const [settings] = await db
      .select()
      .from(brandSettings)
      .where(eq(brandSettings.userId, uid))
      .limit(1);

    if (!settings) {
      cache.set(uid, { data: DEFAULT_BRAND, fetchedAt: Date.now() });
      return DEFAULT_BRAND;
    }

    const brand: BrandContext = {
      brandName: settings.brandName || '',
      tagline: settings.tagline || '',
      website: settings.website || '',
      primaryColor: settings.primaryColor || '#9333ea',
      secondaryColor: settings.secondaryColor || '#4f46e5',
      accentColor: settings.accentColor || '#06b6d4',
      logoUrl: settings.logoUrl || null,
      guidelines: settings.guidelines || '',
    };

    cache.set(uid, { data: brand, fetchedAt: Date.now() });
    return brand;
  } catch (error) {
    console.error('[BrandContext] Failed to fetch brand settings:', error);
    return DEFAULT_BRAND;
  }
}

export function clearBrandContextCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

export function getBrandNameOrDefault(brand: BrandContext): string {
  return brand.brandName?.trim() || 'the brand';
}
