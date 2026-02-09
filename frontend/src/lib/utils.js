import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(date, locale = 'fr-FR') {
  if (!date) return '-';
  const d = new Date(date);
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatRelativeTime(date, locale = 'fr') {
  if (!date) return null;
  const now = new Date();
  const d = new Date(date);
  const diff = now - d;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return locale === 'fr' ? 'À l\'instant' : 'Just now';
  if (minutes < 60) return locale === 'fr' ? `Il y a ${minutes} min` : `${minutes} min ago`;
  if (hours < 24) return locale === 'fr' ? `Il y a ${hours}h` : `${hours}h ago`;
  return locale === 'fr' ? `Il y a ${days}j` : `${days}d ago`;
}

export function getEventTypeColor(type) {
  switch (type) {
    case 'FALL': return 'bg-destructive text-destructive-foreground';
    case 'SENSITIVE_FALL': return 'bg-red-500 text-white';
    case 'PRE_FALL': return 'bg-warning text-warning-foreground';
    case 'BED_EXIT': return 'bg-purple-500 text-white';
    case 'PRESENCE': return 'bg-primary/80 text-primary-foreground';
    case 'INACTIVITY': return 'bg-orange-500 text-white';
    case 'UNKNOWN': return 'bg-muted text-muted-foreground';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function getEventTypeIcon(type) {
  switch (type) {
    case 'FALL': return '🚨';
    case 'SENSITIVE_FALL': return '⚠️';
    case 'PRE_FALL': return '⚠️';
    case 'BED_EXIT': return '🛏️';
    case 'PRESENCE': return '👤';
    case 'INACTIVITY': return '💤';
    default: return '❓';
  }
}

export function getPresenceStatusColor(status) {
  return status === 'DETECTED' 
    ? 'bg-success/20 text-success border-success/50' 
    : 'bg-muted/50 text-muted-foreground border-muted';
}

export function getSeverityColor(severity) {
  switch (severity) {
    case 'HIGH': return 'severity-high';
    case 'MED': return 'severity-med';
    case 'LOW': return 'severity-low';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function getStatusColor(status) {
  switch (status) {
    case 'NEW': return 'status-new';
    case 'ACK': return 'status-ack';
    case 'RESOLVED': return 'status-resolved';
    case 'FALSE_ALARM': return 'status-false-alarm';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function getSensorStatusColor(status) {
  switch (status) {
    case 'ONLINE': return 'sensor-online';
    case 'OFFLINE': return 'sensor-offline';
    case 'MAINTENANCE': return 'sensor-maintenance';
    default: return 'text-muted-foreground';
  }
}

export function truncate(str, length = 50) {
  if (!str) return '';
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

export function generateId() {
  return Math.random().toString(36).substring(2, 15);
}
