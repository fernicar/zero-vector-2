function formatTimestamp(timestamp, format = 'iso') {
  if (!timestamp && timestamp !== 0) {
    return 'Unknown';
  }

  let date;
  try {
    date = new Date(timestamp);
  } catch (error) {
    return 'Invalid Date';
  }

  if (isNaN(date.getTime()) || date.getTime() === null || date.getTime() === undefined) {
    return 'Invalid Date';
  }

  try {
    const timeValue = date.getTime();
    if (typeof timeValue !== 'number' || !isFinite(timeValue)) {
      return 'Invalid Date';
    }
  } catch (e) {
    return 'Invalid Date';
  }

  const time = date.getTime();
  if (time < -8640000000000000 || time > 8640000000000000) {
    return 'Invalid Date';
  }

  try {
    switch (format) {
      case 'iso':
        try {
          return date.toISOString();
        } catch (e) {
          return 'Invalid Date';
        }
      case 'date':
        try {
          return date.toLocaleDateString();
        } catch (e) {
          return 'Invalid Date';
        }
      case 'time':
        try {
          return date.toLocaleTimeString();
        } catch (e) {
          return 'Invalid Date';
        }
      case 'datetime':
        try {
          return date.toLocaleString();
        } catch (e) {
          return 'Invalid Date';
        }
      case 'relative':
        return formatRelativeTime(date);
      default:
        try {
          return date.toString();
        } catch (e) {
          return 'Invalid Date';
        }
    }
  } catch (error) {
    return 'Format Error';
  }
}

function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 7) {
    return date.toLocaleDateString();
  } else if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  } else {
    return 'Just now';
  }
}

function safeExtractTimestamp(data, field) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const timestamp = data[field];

  if (typeof timestamp === 'number' && !isNaN(timestamp)) {
    return timestamp;
  }

  if (typeof timestamp === 'string') {
    const parsed = Date.parse(timestamp);
    return isNaN(parsed) ? null : parsed;
  }

  return null;
}

function formatDuration(startTime, endTime) {
  const start = safeExtractTimestamp({ time: startTime }, 'time');
  const end = safeExtractTimestamp({ time: endTime }, 'time');

  if (!start || !end) {
    return 'Unknown duration';
  }

  const diffMs = Math.abs(end - start);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays}d ${diffHours}h`;
  } else if (diffHours > 0) {
    return `${diffHours}h ${diffMinutes}m`;
  } else {
    return `${diffMinutes}m`;
  }
}

export {
  formatTimestamp,
  formatRelativeTime,
  safeExtractTimestamp,
  formatDuration
};
