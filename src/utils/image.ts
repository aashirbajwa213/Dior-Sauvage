/**
 * Normalizes image URLs to ensure they route through the unblocked main domain (gionee.com.pk)
 * instead of the Pakistani ISP-throttled cdn.gionee.com.pk subdomain.
 */
export function cleanImageUrl(url: string | null | undefined): string {
    if (!url) return '/images/placeholder.svg';
    if (typeof url !== 'string') return '/images/placeholder.svg';
    
    // Replace cdn.gionee.com.pk with gionee.com.pk
    if (url.includes('cdn.gionee.com.pk')) {
        return url.replace('https://cdn.gionee.com.pk', 'https://gionee.com.pk')
                  .replace('http://cdn.gionee.com.pk', 'https://gionee.com.pk');
    }
    
    return url;
}
