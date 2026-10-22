import type { ReleaseNote, ReleaseNoteItem } from "@/shared/types/releaseNote";

interface DateGroup {
  releasedAt: string;
  items: ReleaseNoteItem[];
}

/**
 * 노트를 배포 날짜별로 묶어요(NEWS-R4). 노트 순서(최신부터)를 그대로 지키고,
 * 같은 날 두 번 릴리즈해 이어진 노트는 한 묶음에 앞 노트의 항목부터 쌓아요.
 */
export const groupNotesByDate = (notes: ReleaseNote[]) =>
  notes.reduce<DateGroup[]>((groups, { releasedAt, items }) => {
    const lastGroup = groups[groups.length - 1];

    if (lastGroup?.releasedAt === releasedAt) {
      lastGroup.items.push(...items);
    } else {
      groups.push({ releasedAt, items: [...items] });
    }

    return groups;
  }, []);
