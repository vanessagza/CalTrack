export const PALETTE_ROLES = [
  ['background', 'Background', 'The space behind your dashboard.'],
  ['surface', 'Cards & panels', 'Your cards, sidebar, menus and dialogs.'],
  ['text', 'Main text', 'Exercise names, values and everyday text.'],
  ['subtext', 'Secondary text', 'Descriptions, labels and supporting details.'],
  ['accent', 'Titles & accents', 'Headings, links, selected items and primary buttons.'],
];
export const TEXT_ROLES = [
  ['title', 'Page titles', 24, 56], ['heading', 'Section headings', 14, 36],
  ['body', 'Main text', 12, 24], ['subtext', 'Secondary text & labels', 10, 20],
];
export const DEFAULT_PREFERENCES = {
  theme:'system',
  palettes:{
    light:{ background:'#f7f8f5', surface:'#ffffff', text:'#25332e', subtext:'#637366', accent:'#1d5145' },
    dark:{ background:'#111827', surface:'#1c273b', text:'#e5ecf7', subtext:'#a6b4cb', accent:'#a1c4ff' },
  },
  typography:{ title:36, heading:20, body:14, subtext:12 },
  density:'comfortable', reduceMotion:false, avatar:'',
};

export function validateHex(value) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error('Use a six-digit hex color, such as #a1c4ff.');
  return value.toLowerCase();
}
export function colorRGB(hex) {
  const value = validateHex(hex);
  return [1,3,5].map(start => parseInt(value.slice(start,start+2),16));
}
export function colorHex(channels) {
  if (!Array.isArray(channels) || channels.length !== 3 || channels.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error('Red, green and blue must be whole numbers from 0 to 255.');
  return '#'+channels.map(n => n.toString(16).padStart(2,'0')).join('');
}
export function mixColors(a, b, amount) {
  return colorHex(colorRGB(a).map((value,i) => Math.round(value*(1-amount)+colorRGB(b)[i]*amount)));
}
function luminance(hex) {
  const channels = colorRGB(hex).map(value => {
    const n=value/255;
    return n<=0.04045 ? n/12.92 : ((n+0.055)/1.055)**2.4;
  });
  return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
}
export function contrastRatio(a,b) {
  const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);
  return (values[0]+0.05)/(values[1]+0.05);
}
export function accentText(color) {
  return contrastRatio(color,'#ffffff')>contrastRatio(color,'#000000') ? '#ffffff' : '#000000';
}
export function validatePreferences(value) {
  if (value === undefined) return structuredClone(DEFAULT_PREFERENCES);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Appearance settings are invalid.');
  const result=structuredClone(DEFAULT_PREFERENCES);
  if (value.theme !== undefined) {
    if (!['system','light','dark'].includes(value.theme)) throw new Error('Choose light, dark or device theme.');
    result.theme=value.theme;
  }
  if (value.palettes !== undefined) {
    if (!value.palettes || typeof value.palettes !== 'object' || Array.isArray(value.palettes)) throw new Error('Color palettes are invalid.');
    for (const theme of ['light','dark']) {
      const palette=value.palettes[theme];
      if (palette === undefined) continue;
      if (!palette || typeof palette !== 'object' || Array.isArray(palette)) throw new Error('Color palette is invalid.');
      for (const [role] of PALETTE_ROLES) if (palette[role] !== undefined) result.palettes[theme][role]=validateHex(palette[role]);
    }
  }
  if (value.typography !== undefined) {
    if (!value.typography || typeof value.typography !== 'object' || Array.isArray(value.typography)) throw new Error('Text sizes are invalid.');
    for (const [role,label,min,max] of TEXT_ROLES) {
      if (value.typography[role] === undefined) continue;
      const size=Number(value.typography[role]);
      if (!Number.isInteger(size) || size<min || size>max) throw new Error(`${label} must be between ${min} and ${max} pixels.`);
      result.typography[role]=size;
    }
  }
  if (value.density !== undefined) {
    if (!['comfortable','compact'].includes(value.density)) throw new Error('Choose comfortable or compact spacing.');
    result.density=value.density;
  }
  if (value.reduceMotion !== undefined) {
    if (typeof value.reduceMotion !== 'boolean') throw new Error('Reduced motion setting is invalid.');
    result.reduceMotion=value.reduceMotion;
  }
  if (value.avatar !== undefined) {
    if (typeof value.avatar !== 'string' || value.avatar.length>350000 || (value.avatar && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.avatar))) throw new Error('Choose a valid JPEG, PNG or WebP profile photo.');
    result.avatar=value.avatar;
  }
  return result;
}
