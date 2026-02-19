import { db } from '../db';
import { brandSettings } from '../../shared/schema';
import { eq } from 'drizzle-orm';

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

let cachedBrand: { data: BrandContext; userId: string; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getBrandContext(userId: string): Promise<BrandContext> {
  if (cachedBrand && cachedBrand.userId === userId && Date.now() - cachedBrand.fetchedAt < CACHE_TTL_MS) {
    return cachedBrand.data;
  }

  try {
    const [settings] = await db
      .select()
      .from(brandSettings)
      .where(eq(brandSettings.userId, userId))
      .limit(1);

    if (!settings) return DEFAULT_BRAND;

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

    cachedBrand = { data: brand, userId, fetchedAt: Date.now() };
    return brand;
  } catch (error) {
    console.error('[BrandContext] Failed to fetch brand settings:', error);
    return DEFAULT_BRAND;
  }
}

export async function getAnyBrandContext(): Promise<BrandContext> {
  try {
    const [settings] = await db
      .select()
      .from(brandSettings)
      .limit(1);

    if (!settings) return DEFAULT_BRAND;

    return {
      brandName: settings.brandName || '',
      tagline: settings.tagline || '',
      website: settings.website || '',
      primaryColor: settings.primaryColor || '#9333ea',
      secondaryColor: settings.secondaryColor || '#4f46e5',
      accentColor: settings.accentColor || '#06b6d4',
      logoUrl: settings.logoUrl || null,
      guidelines: settings.guidelines || '',
    };
  } catch {
    return DEFAULT_BRAND;
  }
}

export function getBrandNameOrDefault(brand: BrandContext): string {
  return brand.brandName?.trim() || 'the brand';
}
