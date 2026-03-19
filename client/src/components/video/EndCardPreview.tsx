import React from 'react';

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
  aspectRatio?: string;
}

export const EndCardPreview: React.FC<EndCardPreviewProps> = ({
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
  aspectRatio = '16/9',
}) => {
  const bgStyle: React.CSSProperties = backgroundUrl
    ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: 'linear-gradient(145deg, #1a1a2e, #16213e, #0d1b2a)' };

  const previewTaglineSize = Math.max(7, Math.round(taglineFontSize * 0.35));
  const previewWebsiteSize = Math.max(6, Math.round(websiteFontSize * 0.35));

  return (
    <div
      className="relative rounded-lg overflow-hidden border"
      style={{
        ...bgStyle,
        borderColor: 'var(--border-subtle)',
        aspectRatio,
        minHeight: 120,
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
                fontWeight: taglineBold ? 700 : 400,
                textShadow: '0 1px 4px rgba(0,0,0,0.6)',
              }}
            >
              {taglineText}
            </span>
          </div>
        )}

        {websiteText && (
          <div
            className="absolute left-0 right-0 text-center px-3"
            style={{ top: `${websitePositionY}%`, transform: 'translateY(-50%)' }}
          >
            <span
              style={{
                fontSize: previewWebsiteSize,
                fontFamily: 'Inter, sans-serif',
                color: websiteColor,
                fontWeight: websiteBold ? 700 : 400,
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}
            >
              {websiteText}
            </span>
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/30 to-transparent h-4" />
      <div
        className="absolute top-1 left-1 px-1 py-0.5 rounded text-[7px] font-medium"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.7)' }}
      >
        Preview
      </div>
    </div>
  );
};

export default EndCardPreview;
