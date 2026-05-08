import { parseJiraRaw, type Item } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { Field, FieldList, ItemPanelLayout } from '@/panels/item/ItemPanelLayout';

export function JiraIssuePanel({ item }: { item: Item }) {
  const j = parseJiraRaw(item.raw);
  return (
    <ItemPanelLayout
      item={item}
      headerKey={item.key}
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
