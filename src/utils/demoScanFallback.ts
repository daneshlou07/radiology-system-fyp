import type { Case } from '../types';

export function getDemoScanImage(caseItem?: Case | null): string | null {
  if (!caseItem) return null;
  const text = `${caseItem.modality || ''} ${caseItem.scanType || ''}`.toLowerCase();

  if (text.includes('mri')) {
    if (text.includes('cervical') || text.includes('neck')) return '/demo-images/mri-cervical-spine.png';
    return '/demo-images/mri-spinal-stenosis.png';
  }

  if (text.includes('ct')) {
    if (text.includes('brain') || text.includes('head')) return '/demo-images/ct-brain-stroke.png';
    if (text.includes('sinus')) return '/demo-images/ct-paranasal-sinus.png';
    if (text.includes('pelvis')) return '/demo-images/ct-abdomen-pelvis.png';
    return '/demo-images/ct-abdomen-liver.png';
  }

  if (text.includes('ultrasound') || text.includes('usg')) {
    return '/demo-images/ct-abdomen-liver.png';
  }

  if (text.includes('spine') || text.includes('lumbar') || text.includes('wrist') || text.includes('knee') || text.includes('ankle')) {
    return '/demo-images/spine-xray-trauma.png';
  }

  return '/demo-images/chest-xray-rib-fracture.png';
}

export async function urlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
