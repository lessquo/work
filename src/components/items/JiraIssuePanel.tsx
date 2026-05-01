import { Field, FieldList, ItemPanelLayout } from '@/components/items/ItemPanelLayout';
import { parseJiraRaw, type Item, type JiraStatusCategory } from '@/lib/api';
import { timeAgo } from '@/lib/time';

export function JiraIssuePanel({ item, isFlowMode }: { item: Item; isFlowMode: boolean }) {
  const j = parseJiraRaw(item.raw);
  return (
    <ItemPanelLayout
      item={item}
      isFlowMode={isFlowMode}
      headerKey={item.key}
      badge={{
        label: j.status_name ?? 'unknown',
        color: STATUS_COLOR[j.status_category ?? ''] ?? 'bg-gray-100 text-gray-600',
      }}
      body={
        <FieldList>
          <Field label='Type'>{j.issuetype ?? '—'}</Field>
          <Field label='Assignee'>{j.assignee ?? '—'}</Field>
          <Field label='Priority'>{j.priority ?? '—'}</Field>
          <Field label='Created'>{j.created ? timeAgo(j.created) : '—'}</Field>
          <Field label='Updated'>{j.updated ? timeAgo(j.updated) : '—'}</Field>
        </FieldList>
      }
    />
  );
}

const STATUS_COLOR: Record<JiraStatusCategory, string> = {
  new: 'bg-gray-100 text-gray-700',
  indeterminate: 'bg-sky-100 text-sky-700',
  done: 'bg-emerald-100 text-emerald-700',
};
