import { supabase } from './supabase';

export function getPublicStorageUrl(bucket: string, value: string, cacheKey?: number) {
  const storedValue = value.trim();

  if (!storedValue) {
    return '';
  }

  // Older builds stored the generated public URL instead of the bucket path.
  // Keep those values working while new uploads store paths consistently.
  if (/^https?:\/\//i.test(storedValue)) {
    return addCacheKey(storedValue, cacheKey);
  }

  const path = storedValue.replace(/^\/+/, '').replace(new RegExp(`^${escapeRegExp(bucket)}/`), '');
  const publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  return addCacheKey(publicUrl, cacheKey);
}

function addCacheKey(url: string, cacheKey?: number) {
  return cacheKey ? `${url}${url.includes('?') ? '&' : '?'}v=${cacheKey}` : url;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
