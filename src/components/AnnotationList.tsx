import type { ReactNode } from 'react';
import type { Annotation, Reply } from '../features/types';
import { AnnotationItem } from './AnnotationItem';
import { Empty } from './states/States';

interface AnnotationListProps {
  annotations: Annotation[];
  repliesByAnnotation: Record<string, Reply[]>;
  selectedId: string | null;
  onSelect(id: string): void;
  onPlay(a: Annotation): void;
  onEdit(id: string, note: string): void;
  onDelete(id: string): void;
  onAddReply(annotationId: string, text: string): void;
  onEditReply(annotationId: string, replyId: string, text: string): void;
  onDeleteReply(annotationId: string, replyId: string): void;
}

export function AnnotationList({
  annotations,
  repliesByAnnotation,
  selectedId,
  onSelect,
  onPlay,
  onEdit,
  onDelete,
  onAddReply,
  onEditReply,
  onDeleteReply,
}: AnnotationListProps): ReactNode {
  const visible = annotations.filter((a) => !a.deleted).sort((a, b) => a.startSec - b.startSec);

  if (visible.length === 0) {
    return <Empty>No annotations yet. Add a point or region on the waveform.</Empty>;
  }

  return (
    <ul className="annotation-list" aria-label="Annotations">
      {visible.map((a) => (
        <AnnotationItem
          key={a.id}
          annotation={a}
          replies={repliesByAnnotation[a.id] ?? []}
          selected={a.id === selectedId}
          onSelect={() => onSelect(a.id)}
          onPlay={() => onPlay(a)}
          onEdit={(note) => onEdit(a.id, note)}
          onDelete={() => onDelete(a.id)}
          onAddReply={(text) => onAddReply(a.id, text)}
          onEditReply={(replyId, text) => onEditReply(a.id, replyId, text)}
          onDeleteReply={(replyId) => onDeleteReply(a.id, replyId)}
        />
      ))}
    </ul>
  );
}
