export function detectUIMode(): 'lightning' | 'classic' {
  const hasLightning = document.querySelector('[class*="lightning"], lightning-page, force-record-layout-section');
  return hasLightning ? 'lightning' : 'classic';
}
