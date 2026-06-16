// Web preferences — stored in localStorage

export const PREF_KEYS = {
  DEFAULT_YARN_UNIT:        'pref:default_yarn_unit',
  DEFAULT_GAUGE_UNIT:       'pref:default_gauge_unit',
  PREFERRED_NEEDLE_SYSTEM:  'pref:preferred_needle_system',
  ROW_COUNTER_INCREMENT:    'pref:row_counter_increment',
  DATE_FORMAT:              'pref:date_format',
  TIMER_REMINDER_HOURS:     'pref:timer_reminder_hours',
  DARK_MODE:                'pref:dark_mode',
};

export const PREF_DEFAULTS: Record<string, string> = {
  DEFAULT_YARN_UNIT:        'yards',
  DEFAULT_GAUGE_UNIT:       '10cm',
  PREFERRED_NEEDLE_SYSTEM:  'metric',
  ROW_COUNTER_INCREMENT:    '1',
  DATE_FORMAT:              'YYYY-MM-DD',
  TIMER_REMINDER_HOURS:     '0',
  DARK_MODE:                'false',
};

export function getPref(key: keyof typeof PREF_KEYS): string {
  return localStorage.getItem(PREF_KEYS[key]) ?? PREF_DEFAULTS[key];
}

export function setPref(key: keyof typeof PREF_KEYS, value: string) {
  localStorage.setItem(PREF_KEYS[key], value);
}
