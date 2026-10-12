import { mixColors, accentText } from './preferences.js?v=7';

export function applyAppearance(preferences) {
  window.DailyBalanceTheme.setPreference(preferences.theme);
  const root=document.documentElement;
  const palette=preferences.palettes[root.dataset.theme];
  const variables={
    '--bg':palette.background, '--paper':palette.surface, '--ink':palette.text,
    '--muted':palette.subtext, '--green':palette.accent, '--title-color':palette.accent,
    '--line':mixColors(palette.surface,palette.subtext,0.25),
    '--green-light':mixColors(palette.surface,palette.accent,0.13),
    '--surface-soft':mixColors(palette.surface,palette.background,0.45),
    '--accent-ink':accentText(palette.accent), '--lime':accentText(palette.accent),
  };
  for (const [key,value] of Object.entries(variables)) root.style.setProperty(key,value);
  for (const [role,size] of Object.entries(preferences.typography)) root.style.setProperty(`--${role}-size`,`${size}px`);
  root.style.setProperty('--body-scale',String(preferences.typography.body/14));
  root.dataset.appearance='personal';
  root.dataset.density=preferences.density;
  root.dataset.reduceMotion=String(preferences.reduceMotion);
  document.querySelector('meta[name="theme-color"]').content=palette.background;
}

export async function prepareProfilePhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.');
  if (file.size>10*1024*1024) throw new Error('Choose a photo smaller than 10 MB.');
  let bitmap;
  try { bitmap=await createImageBitmap(file); }
  catch { throw new Error('This image could not be opened. Try a different photo.'); }
  try {
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=256;
    const context=canvas.getContext('2d');
    context.fillStyle='#ffffff';context.fillRect(0,0,256,256);
    const side=Math.min(bitmap.width,bitmap.height);
    context.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,256,256);
    return canvas.toDataURL('image/jpeg',0.85);
  } finally { bitmap.close(); }
}

export async function prepareExerciseImage(file) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('Choose a JPEG, PNG or WebP image smaller than 10 MB.');
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw new Error('This illustration could not be opened.');}
  try {
    const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',0.8);
  }finally{bitmap.close();}
}
