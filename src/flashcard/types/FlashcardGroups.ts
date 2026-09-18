import type { CardGroup } from './FSRSTypes';

export const ALL_CARDS_GROUP = 'hinote:all';
export const UNGROUPED_CARDS_GROUP = 'hinote:ungrouped';
export const PAUSED_CARDS_GROUP = 'hinote:paused';

export function systemCardGroups(): CardGroup[] {
    return [
        { id: ALL_CARDS_GROUP, name: 'All cards' },
        { id: UNGROUPED_CARDS_GROUP, name: 'Ungrouped cards' },
        { id: PAUSED_CARDS_GROUP, name: 'Paused cards' }
    ].map((group, index) => ({ ...group, filter: '', createdTime: 0, sortOrder: index - 3 }));
}

export function isSystemCardGroup(id: string): boolean {
    return [ALL_CARDS_GROUP, UNGROUPED_CARDS_GROUP, PAUSED_CARDS_GROUP].includes(id);
}
