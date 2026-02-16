// Professional Template System with Emoji Support
// Enhanced templates for Pine Hill Farm Employee Management System

export interface TemplateConfig {
  emoji: string;
  priorityEmoji: string;
  categoryEmoji: string;
  suggestedTitle: string;
  suggestedContent: string;
}

// Priority Emoji Mapping
export const PRIORITY_EMOJIS = {
  emergency: "🚨",
  high: "⚠️", 
  normal: "📢",
  low: "💬"
} as const;

// Category Emoji Mapping  
export const CATEGORY_EMOJIS = {
  emergency: "🚨",
  safety: "🛡️",
  policy: "📜",
  schedule: "📅",
  general: "📋",
  training: "🎓",
  important: "🔴", 
  recognition: "🎉",
  maintenance: "🔧"
} as const;

// Professional Template Library
export const PROFESSIONAL_TEMPLATES = [
  // Emergency Templates
  {
    name: "Emergency Alert",
    category: "emergency",
    priority: "emergency",
    emoji: "🚨",
    title: "EMERGENCY ALERT",
    content: "⚠️ IMMEDIATE ACTION REQUIRED\n\n[Emergency details here]\n\n🏃‍♂️ Follow emergency procedures immediately.\n📞 Contact security if you need assistance.\n\n- Pine Hill Farm Management",
    smsEnabled: true,
    tags: ["emergency", "safety", "alert"]
  },
  {
    name: "Safety Alert",
    category: "safety", 
    priority: "high",
    emoji: "🛡️",
    title: "Safety Alert",
    content: "🛡️ SAFETY NOTICE\n\n[Safety concern details]\n\n✅ Please review safety procedures\n📋 Report any safety concerns immediately\n\n- Pine Hill Farm Safety Team",
    smsEnabled: true,
    tags: ["safety", "alert", "procedures"]
  },
  
  // Policy Templates
  {
    name: "New Policy Announcement",
    category: "policy",
    priority: "high", 
    emoji: "📜",
    title: "New Policy Update",
    content: "📜 POLICY UPDATE\n\n🆕 A new policy has been implemented:\n\n[Policy details here]\n\n📅 Effective Date: [Date]\n📚 Please review and acknowledge\n\n- Pine Hill Farm HR",
    smsEnabled: false,
    tags: ["policy", "update", "hr"]
  },
  {
    name: "Policy Reminder",
    category: "policy",
    priority: "normal",
    emoji: "📋",
    title: "Policy Reminder",
    content: "📋 POLICY REMINDER\n\n🔄 Please remember our policy regarding:\n\n[Policy topic]\n\n📖 Review the full policy in your employee handbook\n❓ Contact HR with questions\n\n- Pine Hill Farm Management",
    smsEnabled: false,
    tags: ["policy", "reminder"]
  },

  // Schedule Templates  
  {
    name: "Schedule Change",
    category: "schedule",
    priority: "high",
    emoji: "📅",
    title: "Schedule Update", 
    content: "📅 SCHEDULE CHANGE\n\n⏰ Your schedule has been updated:\n\n[Schedule details]\n\n📱 Check the app for full details\n📞 Contact your manager with questions\n\n- Pine Hill Farm Scheduling",
    smsEnabled: true,
    tags: ["schedule", "change", "shift"]
  },
  {
    name: "Shift Reminder", 
    category: "schedule",
    priority: "normal",
    emoji: "⏰",
    title: "Shift Reminder",
    content: "⏰ SHIFT REMINDER\n\n👋 You have an upcoming shift:\n\n📅 Date: [Date]\n🕐 Time: [Time]\n📍 Location: [Location]\n\n✅ Please arrive 15 minutes early\n\n- Pine Hill Farm Scheduling",
    smsEnabled: true,
    tags: ["schedule", "reminder", "shift"]
  },

  // General Communication
  {
    name: "General Announcement",
    category: "general", 
    priority: "normal",
    emoji: "📢",
    title: "Important Announcement",
    content: "📢 ANNOUNCEMENT\n\n[Announcement details here]\n\n📋 Please note this information\n❓ Contact management with questions\n\n- Pine Hill Farm Management",
    smsEnabled: false,
    tags: ["general", "announcement"]
  },
  {
    name: "Team Update",
    category: "general",
    priority: "low", 
    emoji: "👥",
    title: "Team Update",
    content: "👥 TEAM UPDATE\n\n📈 Here's what's happening with our team:\n\n[Update details]\n\n🎯 Keep up the great work!\n\n- Pine Hill Farm Management",
    smsEnabled: false,
    tags: ["team", "update", "communication"]
  },

  // Training Templates
  {
    name: "Training Announcement",
    category: "training",
    priority: "high",
    emoji: "🎓", 
    title: "Training Session",
    content: "🎓 TRAINING OPPORTUNITY\n\n📚 Upcoming training session:\n\n[Training details]\n\n📅 Date: [Date]\n🕐 Time: [Time]\n📍 Location: [Location]\n\n✅ Please confirm attendance\n\n- Pine Hill Farm Training",
    smsEnabled: true,
    tags: ["training", "education", "development"]
  },

  // Recognition Templates
  {
    name: "Employee Recognition",
    category: "recognition",
    priority: "normal",
    emoji: "🎉",
    title: "Employee Recognition", 
    content: "🎉 CONGRATULATIONS!\n\n⭐ We want to recognize outstanding performance:\n\n[Recognition details]\n\n👏 Thank you for your dedication!\n🌟 Keep up the excellent work!\n\n- Pine Hill Farm Management",
    smsEnabled: false,
    tags: ["recognition", "celebration", "achievement"]
  },

  // Maintenance Templates
  {
    name: "Maintenance Notice",
    category: "maintenance", 
    priority: "normal",
    emoji: "🔧",
    title: "Maintenance Scheduled",
    content: "🔧 MAINTENANCE NOTICE\n\n⚠️ Scheduled maintenance:\n\n[Maintenance details]\n\n📅 Date: [Date]\n🕐 Duration: [Duration]\n\n📋 Plan accordingly\n\n- Pine Hill Farm Facilities",
    smsEnabled: false,
    tags: ["maintenance", "facilities", "notice"]
  }
];

// Utility Functions
export function getPriorityEmoji(priority: string): string {
  return PRIORITY_EMOJIS[priority as keyof typeof PRIORITY_EMOJIS] || "📢";
}

export function getCategoryEmoji(category: string): string {
  return CATEGORY_EMOJIS[category as keyof typeof CATEGORY_EMOJIS] || "📋";
}

export function getTemplateConfig(category: string, priority: string): TemplateConfig {
  const template = PROFESSIONAL_TEMPLATES.find(t => t.category === category && t.priority === priority) 
    || PROFESSIONAL_TEMPLATES.find(t => t.category === category)
    || PROFESSIONAL_TEMPLATES[0];

  return {
    emoji: template.emoji,
    priorityEmoji: getPriorityEmoji(priority),
    categoryEmoji: getCategoryEmoji(category), 
    suggestedTitle: template.title,
    suggestedContent: template.content
  };
}

export function formatMessageContent(content: string, variables: Record<string, string> = {}): string {
  let formatted = content;
  Object.entries(variables).forEach(([key, value]) => {
    formatted = formatted.replace(new RegExp(`\\[${key}\\]`, 'g'), value);
  });
  return formatted;
}

// Enhanced priority styling
export function getPriorityStyle(priority: string): { color: string; bg: string; icon: string } {
  switch (priority) {
    case 'emergency':
      return { color: 'text-red-700', bg: 'bg-red-100 border-red-300', icon: '🚨' };
    case 'high':
      return { color: 'text-orange-700', bg: 'bg-orange-100 border-orange-300', icon: '⚠️' };
    case 'normal':
      return { color: 'text-blue-700', bg: 'bg-blue-100 border-blue-300', icon: '📢' };
    case 'low':
      return { color: 'text-gray-700', bg: 'bg-gray-100 border-gray-300', icon: '💬' };
    default:
      return { color: 'text-blue-700', bg: 'bg-blue-100 border-blue-300', icon: '📢' };
  }
}

export function getCategoryStyle(category: string): { color: string; bg: string; icon: string } {
  switch (category) {
    case 'emergency':
      return { color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: '🚨' };
    case 'safety':
      return { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: '🛡️' };
    case 'policy':
      return { color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: '📜' };
    case 'schedule':
      return { color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: '📅' };
    case 'training':
      return { color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200', icon: '🎓' };
    case 'recognition':
      return { color: 'text-pink-700', bg: 'bg-pink-50 border-pink-200', icon: '🎉' };
    case 'maintenance':
      return { color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', icon: '🔧' };
    default:
      return { color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: '📋' };
  }
}