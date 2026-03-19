import React, { useEffect, useState } from 'react';
import { Maximize2, X } from 'lucide-react';

const useGoogleFonts = (families: string[]) => {
  useEffect(() => {
    const unique = [...new Set(families.filter(f => f && f !== 'Inter'))];
    if (unique.length === 0) return;
    const id = 'endcard-google-fonts';
    const existing = document.getElementById(id);
    const params = unique.map(f => `family=${f.replace(/ /g, '+')}:wght@300;400;500;600;700`).join('&');
    const href = `https://fonts.googleapis.com/css2?${params}&display=swap`;
    if (existing?.getAttribute('href') === href) return;
    if (existing) existing.remove();
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }, [families]);
};

interface EndCardPreviewProps {
  backgroundUrl?: string | null;
  logoUrl?: string | null;
  logoSize?: number;
  logoPositionY?: number;
  taglineText?: string;
  taglinePositionY?: number;
  taglineFontSize?: number;
  taglineColor?: string;
  taglineFontFamily?: string;
  taglineBold?: boolean;
  websiteText?: string;
  websitePositionY?: number;
  websiteFontSize?: number;
  websiteColor?: string;
  websiteBold?: boolean;
  websiteFontFamily?: string;
  websiteFontWeight?: number;
  taglineFontWeight?: number;
  phoneText?: string;
  emailText?: string;
  aspectRatio?: string;
}

const PreviewContent: React.FC<EndCardPreviewProps & { scale?: number }> = ({
  backgroundUrl,
  logoUrl,
  logoSize = 25,
  logoPositionY = 32,
  taglineText = '',
  taglinePositionY = 55,
  taglineFontSize = 28,
  taglineColor = '#E8D5B7',
  taglineFontFamily = 'Great Vibes',
  taglineBold = false,
  websiteText = '',
  websitePositionY = 75,
  websiteFontSize = 22,
  websiteColor = '#FFFFFF',
  websiteBold = false,
  websiteFontFamily = 'Inter',
  websiteFontWeight,
  taglineFontWeight,
  phoneText = '',
  emailText = '',
  aspectRatio = '16/9',
  scale = 0.35,
}) => {
  const bgStyle: React.CSSProperties = backgroundUrl
    ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'linear-gradient(145deg, #1a1a2e, #16213e, #0d1b2a)' };

  const previewTaglineSize = Math.max(7, Math.round(taglineFontSize * scale));
  const previewWebsiteSize = Math.max(6, Math.round(websiteFontSize * scale));

  return (
    <div
      className="relative rounded-lg overflow-hidden border w-full"
      style={{
        ...bgStyle,
        borderColor: 'var(--border-subtle)',
        aspectRatio,
      }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        {logoUrl && (
          <div
            className="absolute flex items-center justify-center"
            style={{
              top: `${logoPositionY}%`,
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: `${logoSize * 1.5}%`,
              maxWidth: '70%',
            }}
          >
            <img
              src={logoUrl}
              alt="Logo"
              className="max-h-full max-w-full object-contain"
              style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))' }}
            />
          </div>
        )}

        {!logoUrl && (
          <div
            className="absolute flex items-center justify-center"
            style={{
              top: `${logoPositionY}%`,
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="rounded-lg flex items-center justify-center"
              style={{
                width: `${Math.max(logoSize * 0.8, 20)}px`,
                height: `${Math.max(logoSize * 0.6, 14)}px`,
                backgroundColor: 'rgba(255,255,255,0.15)',
                border: '1px dashed rgba(255,255,255,0.3)',
              }}
            >
              <span className="text-[7px] text-white/50">Logo</span>
            </div>
          </div>
        )}

        {taglineText && (
          <div
            className="absolute left-0 right-0 text-center px-3"
            style={{ top: `${taglinePositionY}%`, transform: 'translateY(-50%)' }}
          >
            <span
              style={{
                fontSize: previewTaglineSize,
                fontFamily: `'${taglineFontFamily}', cursive, serif`,
                color: taglineColor,
                fontWeight: taglineFontWeight ?? (taglineBold ? 700 : 400),
                textShadow: '0 1px 4px rgba(0,0,0,0.6)',
              }}
            >
              {taglineText}
            </span>
          </div>
        )}

        {(websiteText || phoneText || emailText) && (
          <div
            className="absolute left-0 right-0 text-center px-3 flex flex-col items-center"
            style={{ top: `${websitePositionY}%`, transform: 'translateY(-50%)', gap: 2 }}
          >
            {[websiteText, phoneText, emailText].filter(Boolean).map((item, i) => (
              <span
                key={i}
                style={{
                  fontSize: previewWebsiteSize,
                  fontFamily: `'${websiteFontFamily}', sans-serif`,
                  color: websiteColor,
                  fontWeight: websiteFontWeight ?? (websiteBold ? 700 : 500),
                  textShadow: '0 1px 3px rgba(0,0,0,0.5)',
                }}
              >
                {item}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/30 to-transparent h-4" />
    </div>
  );
};

export const EndCardPreview: React.FC<EndCardPreviewProps> = (props) => {
  const [zoomed, setZoomed] = useState(false);
  const { taglineFontFamily = 'Great Vibes', websiteFontFamily = 'Inter' } = props;
  useGoogleFonts([taglineFontFamily, websiteFontFamily]);

  return (
    <>
      <div className="relative group">
        <PreviewContent {...props} scale={0.35} />
        <div
          className="absolute top-1 left-1 px-1 py-0.5 rounded text-[7px] font-medium"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.7)' }}
        >
          Preview
        </div>
        <button
          onClick={() => setZoomed(true)}
          className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
          title="Zoom preview"
        >
          <Maximize2 className="w-3 h-3 text-white/80" />
        </button>
      </div>

      {zoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setZoomed(false)}
        >
          <div
            className="relative w-full"
            style={{ maxWidth: 720, maxHeight: '85vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <PreviewContent {...props} scale={0.7} />
            <button
              onClick={() => setZoomed(false)}
              className="absolute -top-3 -right-3 p-1.5 rounded-full"
              style={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              <X className="w-4 h-4 text-white" />
            </button>
            <div
              className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded text-[10px]"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: 'rgba(255,255,255,0.6)' }}
            >
              {props.aspectRatio?.replace('/', ':') || '16:9'} · Click outside to close
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EndCardPreview;
