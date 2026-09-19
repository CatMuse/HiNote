import { TFile } from 'obsidian';
import { t } from '../../../i18n';
import type { HighlightInfo } from '../../../types/highlight';
import { IdGenerator } from '../../../utils/IdGenerator';

/** Creates view-only file-comment drafts. Persistence begins on first save. */
export class FileCommentDraftManager {
    createDraft(currentFile: TFile): HighlightInfo {
        const timestamp = Date.now();

        return {
            id: `file-comment-draft-${IdGenerator.generateHighlightRecordId()}`,
            kind: 'file-comment',
            text: t('File Comment'),
            filePath: currentFile.path,
            isDraft: true,
            position: 0,
            paragraphOffset: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
            comments: []
        };
    }
}
