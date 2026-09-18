import React from 'react';
import { View, Text, TextInput, Switch, Pressable } from 'react-native';
import { useScreenColors } from '@/hooks/useScreenColors';
export type TaskCalendar = { enabled: boolean; startAt?: string; reminderMinutes?: number };
export function calendarPayload(value: TaskCalendar) {
  if (!value.enabled) return { enabled: false };
  if (!value.startAt || !Number.isFinite(Date.parse(value.startAt))) throw new Error('Enter a calendar date and time, for example 2026-09-20T14:30');
  return { ...value, startAt: new Date(value.startAt).toISOString(), reminderMinutes: value.reminderMinutes ?? 10 };
}
export function TaskCalendarFields({ value, onChange }: { value: TaskCalendar; onChange: (value: TaskCalendar) => void }) {
  const { textColor, mutedColor, borderColor, colors } = useScreenColors();
  const shownTime = value.startAt && /Z$|[+-]\d{2}:\d{2}$/.test(value.startAt) && Number.isFinite(Date.parse(value.startAt)) ? new Date(Date.parse(value.startAt) - new Date(value.startAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : value.startAt || '';
  return <View style={{ padding: 12, borderWidth: 1, borderColor, borderRadius: 12, marginVertical: 12, gap: 10 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ color: textColor, flex: 1 }}>Google Calendar reminder</Text>
      <Switch accessibilityLabel="Google Calendar reminder" value={value.enabled} onValueChange={enabled => onChange({ ...value, enabled })} />
    </View>
    {value.enabled && <>
      <Text style={{ color: mutedColor }}>Date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Use YYYY-MM-DDTHH:mm.</Text>
      <TextInput accessibilityLabel="Calendar date and time" style={{ padding: 12, borderWidth: 1, borderColor, borderRadius: 8, color: textColor }} value={shownTime} onChangeText={startAt => onChange({ ...value, startAt })} placeholder="2026-09-20T14:30" placeholderTextColor={mutedColor} autoCapitalize="none" />
      <Text style={{ color: textColor }}>Remind me before the task:</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{[0, 5, 10, 15, 30, 60, 1440].map(minutes => <Pressable key={minutes} accessibilityRole="button" accessibilityState={{ selected: (value.reminderMinutes ?? 10) === minutes }} onPress={() => onChange({ ...value, reminderMinutes: minutes })} style={{ padding: 10, borderWidth: 1, borderRadius: 8, borderColor: (value.reminderMinutes ?? 10) === minutes ? colors.tint : borderColor }}><Text style={{ color: textColor }}>{minutes === 0 ? 'At start' : minutes === 1440 ? '1 day' : `${minutes} min`}</Text></Pressable>)}</View>
      <Text style={{ color: mutedColor }}>The assignee must enable their own calendar in Settings → Google Calendar. Completed tasks have no reminder.</Text>
    </>}
  </View>;
}
