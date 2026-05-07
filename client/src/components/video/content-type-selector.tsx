import * as React from 'react';
import {
  Camera,
  Package,
  User,
  MessageSquare,
  Film,
  GraduationCap,
  Sparkles,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type ContentType =
  | 'lifestyle'
  | 'product'
  | 'ugc'
  | 'testimonial'
  | 'broll'
  | 'explainer'
  | (string & {});

interface ContentTypeOption {
  value: ContentType;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const CONTENT_TYPE_OPTIONS: ContentTypeOption[] = [
  {
    value: 'lifestyle',
    label: 'Lifestyle',
    description: 'People using the product naturally',
    Icon: Camera,
  },
  {
    value: 'product',
    label: 'Product',
    description: 'Hero/product-focused shots',
    Icon: Package,
  },
  {
    value: 'ugc',
    label: 'UGC',
    description: 'User-generated, casual selfie style',
    Icon: User,
  },
  {
    value: 'testimonial',
    label: 'Testimonial',
    description: 'Customer story or review',
    Icon: MessageSquare,
  },
  {
    value: 'broll',
    label: 'B-Roll',
    description: 'Background or ambient footage',
    Icon: Film,
  },
  {
    value: 'explainer',
    label: 'Explainer',
    description: 'How-to or demonstration',
    Icon: GraduationCap,
  },
];

const OPTION_BY_VALUE: Record<string, ContentTypeOption> = CONTENT_TYPE_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.value as string] = opt;
    return acc;
  },
  {} as Record<string, ContentTypeOption>,
);

function resolveOption(type: ContentType | undefined): ContentTypeOption {
  if (type && OPTION_BY_VALUE[type as string]) {
    return OPTION_BY_VALUE[type as string];
  }
  return OPTION_BY_VALUE.lifestyle;
}

export function getContentTypeIcon(type: ContentType): React.ReactNode {
  const option = resolveOption(type);
  if (!option) {
    return <Sparkles className="h-3 w-3" />;
  }
  const Icon = option.Icon;
  return <Icon className="h-3 w-3" />;
}

interface ContentTypeSelectorProps {
  value: ContentType;
  onChange: (next: ContentType) => void;
  compact?: boolean;
  disabled?: boolean;
}

export function ContentTypeSelector({
  value,
  onChange,
  compact = false,
  disabled = false,
}: ContentTypeSelectorProps) {
  const current = resolveOption(value);
  const CurrentIcon = current.Icon;

  return (
    <Select
      value={current.value as string}
      onValueChange={(next) => onChange(next as ContentType)}
      disabled={disabled}
    >
      <SelectTrigger
        className={compact ? 'h-8 w-[140px] text-xs' : 'w-full'}
        data-testid="content-type-selector-trigger"
        aria-label="Content type"
      >
        <SelectValue>
          <span className="flex items-center gap-2">
            <CurrentIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={compact ? 'truncate' : ''}>{current.label}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {CONTENT_TYPE_OPTIONS.map((opt) => {
          const Icon = opt.Icon;
          return (
            <SelectItem
              key={opt.value as string}
              value={opt.value as string}
              data-testid={`content-type-option-${opt.value}`}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{opt.label}</span>
                  {!compact && (
                    <span className="text-xs text-muted-foreground">
                      {opt.description}
                    </span>
                  )}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
