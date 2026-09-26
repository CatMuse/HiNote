import type { EditorFeatureContext } from '../../types/plugin';
import type { HighlightColor } from '../../services/highlight/HighlightColor';
import { recolorHighlightSource } from '../../services/highlight/HighlightColorEdit';
import { HighlightExtractor } from '../../services/highlight/HighlightExtractor';
import { scanToHighlightView } from '../../models/HighlightModels';
import type { HighlightInfo } from '../../types/highlight';
import { HighlightCardClipboard } from '../../components/highlight/card/Clipboard';
import { HighlightDeletionManager } from '../../views/highlight/actions/HighlightDeletionManager';
import { t } from '../../i18n';
import type { SelectionRangePlan } from './SelectionRangeResolver';
import type { SelectionContext } from './SelectionCapture';

export interface PreparedSelection {
    context: SelectionContext;
    rollback?: {
        originalSnapshot: string;
        originalPlan: SelectionRangePlan;
    };
}

export type SelectionDeleteResult = 'deleted' | 'cancelled' | 'missing';

/** Performs source and record operations initiated by the selection toolbar. */
export class SelectionHighlightActions {
    constructor(
        private plugin: EditorFeatureContext,
        private extractor: HighlightExtractor
    ) {}

    async ensureHighlighted(context: SelectionContext): Promise<PreparedSelection> {
        if (context.plan.source) return { context };
        const originalSnapshot = context.snapshot;
        const originalPlan = { ...context.plan };
        await this.writeSelectionChange(context, null);
        const snapshot = await this.readCurrentSnapshot(context);
        const scan = this.extractor.extractHighlights(snapshot, context.file)
            .find(item => item.position === context.plan.from);
        if (!scan) throw new Error(t('This selection cannot be highlighted safely.'));
        return {
            context: {
                ...context,
                snapshot,
                plan: {
                    from: scan.position,
                    to: scan.position + scan.originalLength,
                    source: scan
                }
            },
            rollback: { originalSnapshot, originalPlan }
        };
    }

    async getExistingHighlight(context: SelectionContext): Promise<HighlightInfo | null> {
        if (!context.plan.source) return null;
        const services = await this.plugin.ensureServicesInitialized();
        const snapshot = await this.readCurrentSnapshot(context);
        const scans = this.extractor.extractHighlights(snapshot, context.file);
        const scan = scans.find(item => item.position === context.plan.from);
        if (!scan) return null;
        const merged = services.highlightService.mergeHighlightsWithComments(
            scans,
            services.highlightRepository.getCachedHighlights(context.file.path) || [],
            context.file
        );
        return merged.find(item => item.position === scan.position) || scanToHighlightView(scan);
    }

    async copyHighlight(context: SelectionContext): Promise<void> {
        const existing = await this.getExistingHighlight(context);
        const highlight: HighlightInfo = existing || {
            text: context.snapshot.slice(context.plan.from, context.plan.to),
            position: context.plan.from,
            filePath: context.file.path,
            fileName: context.file.basename,
            comments: []
        };
        HighlightCardClipboard.copyHighlightContent(highlight, context.file.basename);
    }

    async deleteHighlight(context: SelectionContext): Promise<SelectionDeleteResult> {
        const highlight = await this.getExistingHighlight(context);
        if (!highlight) return 'missing';
        const services = await this.plugin.ensureServicesInitialized();
        const deleted = await new HighlightDeletionManager({
            app: this.plugin.app,
            settings: this.plugin.settings,
            highlightManager: services.highlightManager,
            eventManager: services.eventManager
        }).deleteHighlight(highlight);
        return deleted ? 'deleted' : 'cancelled';
    }

    async writeSelectionChange(context: SelectionContext, color: HighlightColor | null): Promise<void> {
        if (context.view
            ? context.view.state.doc.toString() !== context.snapshot || !context.view.dom.isConnected
            : this.plugin.app.vault.getAbstractFileByPath(context.file.path) !== context.file) {
            throw new Error(t('The selection changed. Select the text again.'));
        }
        const { plan } = context;
        const original = context.snapshot.slice(plan.from, plan.to);
        const replacement = plan.source
            ? recolorHighlightSource(original, color)
            : recolorHighlightSource(`==${original}==`, color);
        if (context.view) {
            context.view.dispatch({
                changes: { from: plan.from, to: plan.to, insert: replacement },
                selection: { anchor: plan.from + replacement.length },
                userEvent: 'input.hinote-highlight-color'
            });
        } else {
            await this.plugin.app.vault.process(context.file, current => {
                if (current !== context.snapshot) throw new Error(t('The selection changed. Select the text again.'));
                return current.slice(0, plan.from) + replacement + current.slice(plan.to);
            });
        }
        this.plugin.services?.highlightDecorator.invalidate(context.file.path);
    }

    private async readCurrentSnapshot(context: SelectionContext): Promise<string> {
        return context.view
            ? context.view.state.doc.toString()
            : this.plugin.app.vault.read(context.file);
    }
}
